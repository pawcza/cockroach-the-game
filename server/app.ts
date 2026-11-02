import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { Server } from 'socket.io';
import db, { getTopScores, getPlayerBest, insertScore } from './db';
import { setupMultiplayer, type MultiplayerOptions } from './multiplayer';
import { clientIp, originAllowed } from './net';
import { parseScoreSubmission } from './validate';

/** Builds the HTTP and socket server without starting it, so tests can run it on a spare port. */
export function createGameServer(options: MultiplayerOptions = {}) {
  const app = express();
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

  // Rate limit score submissions: 1 per 5 seconds per visitor
  const submitLimiter = rateLimit({
    windowMs: 5000,
    limit: 1,
    message: { error: 'Too many submissions, wait a moment' },
    keyGenerator: (req) => ipKeyGenerator(clientIp(req.socket.remoteAddress, req.headers)),
    validate: { xForwardedForHeader: false },
  });

  // GET /api/scores?limit=100
  app.get('/api/scores', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
    res.json(getTopScores(limit));
  });

  // GET /api/scores/:playerName
  app.get('/api/scores/:playerName', (req, res) => {
    res.json(getPlayerBest(req.params.playerName));
  });

  // POST /api/scores
  app.post('/api/scores', submitLimiter, (req, res) => {
    const submission = parseScoreSubmission(req.body);
    if ('error' in submission) {
      res.status(400).json({ error: submission.error });
      return;
    }

    res.status(201).json(insertScore(
      submission.name,
      submission.score,
      submission.deathCause,
      submission.distance,
      submission.timeSurvived,
      submission.applesCollected,
      submission.tyskiesCollected,
      submission.pillsCollected,
      submission.maxLevel,
      submission.maxCombo,
    ));
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
  const stopMultiplayer = setupMultiplayer(io, options);

  /** Stops accepting connections, then closes the database. */
  const close = async (): Promise<void> => {
    stopMultiplayer();
    await io.close();
    db.close();
  };

  return { server, close };
}
