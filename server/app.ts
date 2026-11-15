import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { Server } from 'socket.io';
import db, { getDailyScores, getEndlessScores, getProfile, getTopScores, getPlayerBest, insertScore, saveProfile } from './db';
import { acceptsDaily, dailyDate, dailySeed } from './daily';
import { CHECKPOINT_STARTS } from './bossDistances';
import { buy, lookOf, parseLook, parseRunReport, payAchievements, payStored, reportRun, shopState, wear } from './economy';
import { createAuth, type AuthOptions } from './auth';
import { setupMultiplayer, type MultiplayerOptions } from './multiplayer';
import { clientIp, originAllowed } from './net';
import { mergeIntoStored, parseDay, parseProfile, parseScoreSubmission } from './validate';

export interface GameServerOptions extends MultiplayerOptions {
  /** Google sign-in. Without it nobody can sign in, so nobody can save a score. */
  auth?: AuthOptions | null;
}

/** Whether a stored profile has the Eksterminator's start unlocked (stats.checkpoints counts the boss starts: 4 of them). */
function endlessUnlocked(profile: unknown): boolean {
  const checkpoints = (profile as { stats?: { checkpoints?: unknown } } | null)?.stats?.checkpoints;
  return typeof checkpoints === 'number' && checkpoints >= CHECKPOINT_STARTS.length;
}

/** Builds the HTTP and socket server without starting it, so tests can run it on a spare port. */
export function createGameServer(options: GameServerOptions = {}) {
  const app = express();
  const auth = createAuth(options.auth ?? null);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));

  // Vite's hashed bundles share dist/assets with the sprites copied from public/assets, whose names never change:
  // only the hashed ones may be cached forever, the rest revalidate (ETag) so new art shows up on the next visit
  const HASHED = /-[\w-]{8}\.(js|css)$/;
  app.use('/assets', express.static(path.join(__dirname, '..', 'dist', 'assets'), {
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', HASHED.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  // All other static files — no cache (forces revalidation on every visit)
  app.use(express.static(path.join(__dirname, '..', 'dist'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  app.use('/api', auth.router);

  // Rate limit score submissions: 1 per 5 seconds per player (per visitor before sign-in is checked)
  const submitLimiter = rateLimit({
    windowMs: 5000,
    limit: 1,
    message: { error: 'Too many submissions, wait a moment' },
    keyGenerator: (req) => {
      const user = auth.userOf(req);
      return user ? `user:${user.id}` : ipKeyGenerator(clientIp(req.socket.remoteAddress, req.headers));
    },
    validate: { xForwardedForHeader: false },
  });

  // Profiles are saved after every run and on sign-in: a few a minute is plenty
  const profileLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    message: { error: 'Too many saves, wait a moment' },
    keyGenerator: (req) => {
      const user = auth.userOf(req);
      return user ? `user:${user.id}` : ipKeyGenerator(clientIp(req.socket.remoteAddress, req.headers));
    },
    validate: { xForwardedForHeader: false },
  });

  // GET /api/scores?limit=100, ?daily=YYYY-MM-DD for that day's Karaluch Dnia board, or ?board=endless for Bez końca
  app.get('/api/scores', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
    const day = parseDay(req.query.daily);
    res.json(day ? getDailyScores(day, limit) : req.query.board === 'endless' ? getEndlessScores(limit) : getTopScores(limit));
  });

  // GET/PUT /api/me/profile: a signed-in player's stats and achievements, so they follow them between devices
  app.get('/api/me/profile', (req, res) => {
    const user = auth.userOf(req);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    res.json({ profile: getProfile(user.id) });
  });
  app.put('/api/me/profile', profileLimiter, (req, res) => {
    const user = auth.userOf(req);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    const profile = parseProfile(req.body);
    if (!profile) { res.status(400).json({ error: 'Invalid profile' }); return; }
    // Folded into what is stored, so a client that doesn't know the newer stats can't wipe them
    const merged = mergeIntoStored(profile, getProfile(user.id));
    if (!merged) { res.status(400).json({ error: 'Invalid profile' }); return; }
    saveProfile(user.id, merged);
    res.json({ ok: true, paid: payAchievements(user.id, merged.stats) });
  });

  // The shop: okruszki, owned items, what you wear and your three missions. Signed-in players only
  const signedIn = (req: Request, res: Response): number | null => {
    const user = auth.userOf(req);
    if (!user) res.status(401).json({ error: 'Sign in first' });
    return user?.id ?? null;
  };
  // A run report pays missions: one per two seconds is more than any real run needs
  const runLimiter = rateLimit({
    windowMs: 2000,
    limit: 1,
    message: { error: 'Too many reports, wait a moment' },
    keyGenerator: (req) => {
      const user = auth.userOf(req);
      return user ? `user:${user.id}` : ipKeyGenerator(clientIp(req.socket.remoteAddress, req.headers));
    },
    validate: { xForwardedForHeader: false },
  });
  app.get('/api/me/shop', (req, res) => {
    const id = signedIn(req, res);
    if (id !== null) res.json(shopState(id));
  });
  app.post('/api/me/run', runLimiter, (req, res) => {
    const id = signedIn(req, res);
    if (id === null) return;
    const run = parseRunReport(req.body);
    if (!run) { res.status(400).json({ error: 'Invalid run' }); return; }
    const completed = reportRun(id, run);
    // A mission finished moves the record the missions achievements are paid from
    if (completed.length > 0) payStored(id);
    res.json({ completed, state: shopState(id) });
  });
  app.post('/api/me/buy', profileLimiter, (req, res) => {
    const id = signedIn(req, res);
    if (id === null) return;
    const item = (req.body as { item?: unknown } | undefined)?.item;
    const error = typeof item === 'string' ? buy(id, item) : 'Unknown item';
    if (error) { res.status(400).json({ error }); return; }
    // An item bought moves the record the shop achievement is paid from
    payStored(id);
    res.json(shopState(id));
  });
  app.post('/api/me/look', profileLimiter, (req, res) => {
    const id = signedIn(req, res);
    if (id === null) return;
    const look = parseLook(req.body);
    const error = look ? wear(id, look) : 'Invalid look';
    if (error) { res.status(400).json({ error }); return; }
    res.json(shopState(id));
  });

  // GET /api/daily: today's run, the same seed for everyone
  app.get('/api/daily', (_req, res) => {
    const date = dailyDate();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ date, seed: dailySeed(date) });
  });

  // GET /api/scores/:playerName
  app.get('/api/scores/:playerName', (req, res) => {
    res.json(getPlayerBest(req.params.playerName));
  });

  // POST /api/scores: only signed-in players make the board, under their account's name
  app.post('/api/scores', submitLimiter, (req, res) => {
    const user = auth.userOf(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to save a score' });
      return;
    }
    const submission = parseScoreSubmission(req.body);
    if ('error' in submission) {
      res.status(400).json({ error: submission.error });
      return;
    }
    if (submission.daily && !acceptsDaily(submission.daily)) {
      res.status(400).json({ error: 'That day\'s run is over' });
      return;
    }
    // Bez końca starts at the Eksterminator: only an account whose profile has that start unlocked may be on its board
    if (submission.board === 'endless' && !(endlessUnlocked(getProfile(user.id)))) {
      res.status(403).json({ error: 'Beat the Eksterminator first: the endless start is not unlocked on this account' });
      return;
    }

    res.status(201).json(insertScore(
      user.id,
      user.name,
      submission.score,
      submission.deathCause,
      submission.distance,
      submission.timeSurvived,
      submission.applesCollected,
      submission.tyskiesCollected,
      submission.pillsCollected,
      submission.maxLevel,
      submission.maxCombo,
      submission.daily,
      submission.board,
    ));
  });

  // The privacy policy, at the address given on Google's consent screen
  app.get('/privacy', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'privacy.html'));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // SPA fallback — serve index.html for non-API, non-static routes
  app.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : 'Bad request' });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (req, callback) => {
      callback(null, originAllowed(req.headers.origin, req.headers.host));
    },
  });
  const stopMultiplayer = setupMultiplayer(io, {
    ...options,
    lookOf: (headers) => {
      const user = auth.userOf({ headers });
      return user ? lookOf(user.id) : null;
    },
  });

  /** Stops accepting connections, then closes the database. */
  const close = async (): Promise<void> => {
    stopMultiplayer();
    await io.close();
    db.close();
  };

  return { server, close };
}
