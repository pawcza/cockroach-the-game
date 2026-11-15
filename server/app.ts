import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { Server } from 'socket.io';
import db, { getDailyScores, getEndlessScores, getProfile, getTopScores, getPlayerBest, insertScore, saveProfile, type User } from './db';
import { acceptsDaily, COURSE_VERSION, dailyDate, dailySeed } from './daily';
import { buy, lookOf, parseLook, payAchievements, SHOP, shopState, wear } from './economy';
import { createAuth, type AuthOptions } from './auth';
import { setupMultiplayer, type MultiplayerOptions } from './multiplayer';
import { clientIp, originAllowed } from './net';
import {
  claimRun, deathSeen, finishRun, issueTicket, modeOf, noteMatchDeath, noteMatchOver, parseRunClaim, startAllowed, takeForBoard, validStart,
  type CheckedRun, type Owner,
} from './runs';
import { mergeIntoStored, parseDay, parseProfile } from './validate';

export interface GameServerOptions extends Omit<MultiplayerOptions, 'tickets'> {
  /** Google sign-in. Without it nobody can sign in, so nobody can save a score. */
  auth?: AuthOptions | null;
  /** The clock runs are checked on (ms). Tests move it on; it defaults to the real one. */
  now?: () => number;
}

/** What a client of another version is told: its runs would not pay or rank, so it should reload. */
const OUTDATED = { error: 'This version of the game is out of date: reload it', reload: true };

const ticketIdOf = (body: unknown): string | null => {
  const ticket = (body as { ticket?: unknown } | undefined)?.ticket;
  return typeof ticket === 'string' && /^[\w-]{16,32}$/.test(ticket) ? ticket : null;
};

/** How long a match player's report waits for the socket's word of the death. */
const MATCH_DEATH_WAIT_MS = 3000;

const currentClient = (body: unknown): boolean => (body as { course?: unknown } | undefined)?.course === COURSE_VERSION;

/** A checked run on its board, under the account's name. */
function rank(user: User, run: CheckedRun) {
  return insertScore(
    user.id, user.name, run.score, run.deathCause, run.distance, run.seconds, run.apples, run.beers, run.pills, run.level,
    run.combo, run.mode === 'daily' ? run.dailyDate : null, run.start > 0 ? 'endless' : null,
  );
}

/** Builds the HTTP and socket server without starting it, so tests can run it on a spare port. */
export function createGameServer(options: GameServerOptions = {}) {
  const app = express();
  const auth = createAuth(options.auth ?? null);
  const now = options.now ?? Date.now;
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
    // Kept for the player's own pages on every device; nothing is paid from it (the server counts its own: playerStats.ts).
    // A sync is when a reward raised since it was paid is topped up (economy.ts payAchievements)
    saveProfile(user.id, merged);
    res.json({ ok: true, paid: payAchievements(user.id) });
  });

  // The shop: okruszki, owned items, what you wear and your three missions. Signed-in players only
  const signedIn = (req: Request, res: Response): number | null => {
    const user = auth.userOf(req);
    if (!user) res.status(401).json({ error: 'Sign in first' });
    return user?.id ?? null;
  };
  app.get('/api/me/shop', (req, res) => {
    const id = signedIn(req, res);
    if (id !== null) res.json(shopState(id));
  });

  // Runs: a ticket when one starts, its report when it ends (runs.ts). Signed in or not: a guest's run is checked
  // too, and waits on its ticket for the account that signs in from that browser
  const perPlayer = (windowMs: number, limit: number) => rateLimit({
    windowMs,
    limit,
    message: { error: 'Too many runs, wait a moment' },
    keyGenerator: (req) => {
      const user = auth.userOf(req);
      return user ? `user:${user.id}` : ipKeyGenerator(clientIp(req.socket.remoteAddress, req.headers));
    },
    validate: { xForwardedForHeader: false },
  });
  // A run takes a few seconds even when it ends at the first obstacle: twenty a minute is more than anyone plays
  const ticketLimiter = perPlayer(60_000, 20);
  const reportLimiter = perPlayer(1000, 2);
  const ownerOf = (req: Request, res: Response): Owner => {
    const user = auth.userOf(req);
    return { userId: user?.id ?? null, guest: user ? null : auth.ensureGuest(req, res) };
  };

  app.post('/api/run/start', ticketLimiter, (req, res) => {
    if (!currentClient(req.body)) { res.status(409).json(OUTDATED); return; }
    const { start, daily } = (req.body ?? {}) as { start?: unknown; daily?: unknown };
    if (!validStart(start)) { res.status(400).json({ error: 'Invalid start' }); return; }
    const day = daily === undefined || daily === null ? null : parseDay(daily);
    // Yesterday's run still takes a ticket in the first minutes of today (a run begun on its last screen)
    if (daily !== undefined && daily !== null && (!day || !acceptsDaily(day, now()))) {
      res.status(400).json({ error: 'That day\'s run is over' });
      return;
    }
    if (day && start !== 0) { res.status(400).json({ error: 'Karaluch Dnia starts from 0 m' }); return; }
    // Only from a start the server has seen this account unlock; a guest's own unlocks can't be checked: from 0 only
    const owner = ownerOf(req, res);
    if (!startAllowed(owner, start)) {
      res.status(403).json({ error: 'That start is not unlocked on this account', locked: true });
      return;
    }
    res.json({ ticket: issueTicket(owner, day ? 'daily' : 'solo', start, day, now()) });
  });

  app.post('/api/run/finish', reportLimiter, async (req, res) => {
    if (!currentClient(req.body)) { res.status(409).json(OUTDATED); return; }
    const ticket = ticketIdOf(req.body);
    const claim = parseRunClaim(req.body);
    if (!ticket || !claim) { res.status(400).json({ error: 'Invalid run' }); return; }
    // A match's run is held to the score the server relayed at its death: the socket's game:death may land a moment
    // after this report, so it is waited for (a match player's report without one is refused)
    if (modeOf(ticket) === 'match') {
      for (let waited = 0; !deathSeen(ticket) && waited < MATCH_DEATH_WAIT_MS; waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!deathSeen(ticket)) { res.status(409).json({ error: 'The match has not seen this death' }); return; }
    }
    const result = finishRun(ticket, ownerOf(req, res), claim, now());
    if (!result.ok) { res.status(result.status).json({ error: result.reason }); return; }
    res.json({ receipt: result.receipt, state: result.receipt.paid ? shopState(auth.userOf(req)!.id) : null });
  });

  // A guest's run, claimed by the account that has just signed in from the same browser; on its board too if asked
  app.post('/api/run/claim', reportLimiter, (req, res) => {
    const user = auth.userOf(req);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    if (!currentClient(req.body)) { res.status(409).json(OUTDATED); return; }
    const ticket = ticketIdOf(req.body);
    if (!ticket) { res.status(400).json({ error: 'Invalid run' }); return; }
    const result = claimRun(ticket, user.id, auth.guestOf(req), now());
    if (!result.ok) { res.status(result.status).json({ error: result.reason }); return; }
    let saved = false;
    if ((req.body as { board?: unknown }).board === true) {
      const board = takeForBoard(ticket, user.id, now());
      if (board.ok) { rank(user, board.run); saved = true; }
    }
    res.json({ receipt: result.receipt, state: shopState(user.id), saved, name: user.name });
  });

  // Clients from before tickets reported runs here: they are told to reload
  app.post('/api/me/run', (_req, res) => { res.status(409).json(OUTDATED); });
  app.post('/api/me/buy', profileLimiter, (req, res) => {
    const id = signedIn(req, res);
    if (id === null) return;
    const item = (req.body as { item?: unknown } | undefined)?.item;
    const error = typeof item === 'string' ? buy(id, item) : 'Unknown item';
    if (error) { res.status(400).json({ error }); return; }
    // An item bought moves the record the shop achievement is paid from
    payAchievements(id);
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

  // The shop's prices, for guests too: the wardrobe shows them what there is to earn
  app.get('/api/shop/prices', (_req, res) => {
    res.json(Object.fromEntries(Object.entries(SHOP).map(([id, item]) => [id, item.price])));
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

  // POST /api/scores {ticket}: a run the server checked and paid to this account, on its board under the account's
  // name. Once a run; a practice run from a checkpoint goes on none, Bez końca's needs its start unlocked
  app.post('/api/scores', submitLimiter, (req, res) => {
    const user = auth.userOf(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to save a score' });
      return;
    }
    const ticket = ticketIdOf(req.body);
    if (!ticket || !currentClient(req.body)) { res.status(409).json(OUTDATED); return; }
    const board = takeForBoard(ticket, user.id, now());
    if (!board.ok) { res.status(board.status).json({ error: board.reason }); return; }
    res.status(201).json(rank(user, board.run));
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
    // A match's runs get their tickets from the match: the server knows when it started, who died when, who won
    tickets: {
      issue: (headers, startsAt) => {
        const user = auth.userOf({ headers });
        const guest = user ? null : auth.guestOf({ headers });
        return user || guest ? issueTicket({ userId: user?.id ?? null, guest }, 'match', 0, null, startsAt) : null;
      },
      death: (ticket, score) => noteMatchDeath(ticket, score, now()),
      over: (players) => noteMatchOver(players),
    },
    now,
  });

  /** Stops accepting connections, then closes the database. */
  const close = async (): Promise<void> => {
    stopMultiplayer();
    await io.close();
    db.close();
  };

  return { server, close };
}
