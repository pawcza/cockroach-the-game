import express from 'express';
import http from 'http';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { getTopScores, getPlayerBest, insertScore } from './db';
import { setupMultiplayer } from './multiplayer';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Hashed assets (Vite adds content hash) — cache forever
app.use('/assets', express.static(path.join(__dirname, '..', 'dist', 'assets'), {
  maxAge: '1y',
  immutable: true,
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

// Rate limit score submissions: 1 per 5 seconds per IP
const submitLimiter = rateLimit({
  windowMs: 5000,
  max: 1,
  message: { error: 'Too many submissions, wait a moment' },
});

// GET /api/scores?limit=100
app.get('/api/scores', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
  const scores = getTopScores(limit);
  res.json(scores);
});

// GET /api/scores/:playerName
app.get('/api/scores/:playerName', (req, res) => {
  const result = getPlayerBest(req.params.playerName);
  res.json(result);
});

// POST /api/scores
app.post('/api/scores', submitLimiter, (req, res) => {
  const { name, score, deathCause, distance, timeSurvived, applesCollected, tyskiesCollected, pillsCollected, maxLevel, maxCombo } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 20) {
    res.status(400).json({ error: 'Name must be 1-20 characters' });
    return;
  }
  if (typeof score !== 'number' || score < 0 || !Number.isInteger(score)) {
    res.status(400).json({ error: 'Score must be a non-negative integer' });
    return;
  }

  const entry = insertScore(
    name.trim(),
    score,
    deathCause || null,
    typeof distance === 'number' ? distance : null,
    typeof timeSurvived === 'number' ? timeSurvived : null,
    typeof applesCollected === 'number' ? applesCollected : null,
    typeof tyskiesCollected === 'number' ? tyskiesCollected : null,
    typeof pillsCollected === 'number' ? pillsCollected : null,
    typeof maxLevel === 'number' ? maxLevel : null,
    typeof maxCombo === 'number' ? maxCombo : null,
  );

  res.status(201).json(entry);
});

// SPA fallback — serve index.html for non-API, non-static routes
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});
setupMultiplayer(io);

server.listen(PORT, () => {
  console.log(`Cockroach server running on port ${PORT}`);
});
