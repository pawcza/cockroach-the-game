/**
 * Google sign-in: the server-side authorization code flow, then a signed session cookie. No libraries: Google's
 * token endpoint over HTTPS is trusted for the ID token it returns, and the cookie is an HMAC of the user id.
 */
import crypto from 'crypto';
import type { Request, Response, Router } from 'express';
import express from 'express';
import { deleteUser, findOrCreateGoogleUser, getUser, renameUser, type User } from './db';
import { cleanName, isRecord, MAX_NAME_LENGTH } from './validate';

const SESSION_COOKIE = 'kc_session';
const STATE_COOKIE = 'kc_oauth_state';
const SESSION_DAYS = 180;
const STATE_MINUTES = 10;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CALLBACK_PATH = '/api/auth/google/callback';

export interface GoogleProfile {
  sub: string;
  name: string | null;
}

export interface AuthOptions {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  /** Where players reach the game, such as https://cockroach.wszystko.app. The callback is built from it. */
  publicUrl: string;
  /** Swaps an authorization code for the player's Google profile. Tests replace it; it defaults to Google. */
  exchangeCode?: (code: string) => Promise<GoogleProfile>;
}

/** Reads the auth settings from the environment, or null when sign-in isn't configured. */
export function authFromEnv(env: NodeJS.ProcessEnv): AuthOptions | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, PUBLIC_URL } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET || !PUBLIC_URL) return null;
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, sessionSecret: SESSION_SECRET, publicUrl: PUBLIC_URL };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return cookies;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Decodes the payload of an ID token that came straight from Google's token endpoint. */
function idTokenPayload(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export interface Auth {
  router: Router;
  /** The signed-in player behind this request, or null. */
  userOf: (req: Request) => User | null;
}

export function createAuth(options: AuthOptions | null): Auth {
  const router = express.Router();
  const secure = options?.publicUrl.startsWith('https://') ?? false;

  const sign = (value: string): string =>
    crypto.createHmac('sha256', options!.sessionSecret).update(value).digest('base64url');

  const cookie = (res: Response, name: string, value: string, maxAgeMs: number): void => {
    res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: maxAgeMs });
  };

  const userOf = (req: Request): User | null => {
    if (!options) return null;
    const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!raw) return null;
    const [body, mac] = raw.split('.');
    if (!body || !mac || !safeEqual(sign(body), mac)) return null;
    const [id, issued] = body.split(':').map(Number);
    if (!Number.isInteger(id) || !Number.isFinite(issued)) return null;
    if (Date.now() - issued > SESSION_DAYS * 86_400_000) return null;
    return getUser(id);
  };

  const exchangeCode = options?.exchangeCode ?? (async (code: string): Promise<GoogleProfile> => {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: options!.clientId,
        client_secret: options!.clientSecret,
        redirect_uri: options!.publicUrl + CALLBACK_PATH,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    const payload = idTokenPayload(((await res.json()) as Record<string, unknown>).id_token);
    if (!payload || payload.aud !== options!.clientId || !GOOGLE_ISSUERS.has(String(payload.iss))) {
      throw new Error('Google returned an ID token for someone else');
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('Google ID token expired');
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Google ID token has no subject');
    const name = typeof payload.given_name === 'string' ? payload.given_name : typeof payload.name === 'string' ? payload.name : null;
    return { sub: payload.sub, name };
  });

  router.get('/auth/google', (_req, res) => {
    if (!options) { res.status(503).json({ error: 'Sign-in is not available' }); return; }
    const state = crypto.randomBytes(16).toString('base64url');
    cookie(res, STATE_COOKIE, state, STATE_MINUTES * 60_000);
    const params = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.publicUrl + CALLBACK_PATH,
      response_type: 'code',
      scope: 'openid profile',
      state,
      prompt: 'select_account',
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  router.get('/auth/google/callback', async (req, res) => {
    if (!options) { res.status(503).json({ error: 'Sign-in is not available' }); return; }
    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/' });
    const { code, state } = req.query;
    // Declined on Google's screen, or a forged callback: back to the game, still signed out
    if (typeof code !== 'string' || typeof state !== 'string' || !expected || !safeEqual(state, expected)) {
      res.redirect('/?signin=failed');
      return;
    }
    try {
      const profile = await exchangeCode(code);
      const fallback = cleanName(profile.name)?.slice(0, MAX_NAME_LENGTH) ?? 'Karaluch';
      const user = findOrCreateGoogleUser(profile.sub, fallback);
      const body = `${user.id}:${Date.now()}`;
      cookie(res, SESSION_COOKIE, `${body}.${sign(body)}`, SESSION_DAYS * 86_400_000);
      res.redirect('/?signin=ok');
    } catch (err) {
      console.error(err);
      res.redirect('/?signin=failed');
    }
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const user = userOf(req);
    res.json({ user: user && { id: user.id, name: user.name }, signInAvailable: options !== null });
  });

  router.post('/me', (req, res) => {
    const user = userOf(req);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    const name = isRecord(req.body) ? cleanName(req.body.name) : null;
    if (!name || name.length > MAX_NAME_LENGTH) {
      res.status(400).json({ error: `Name must be 1-${MAX_NAME_LENGTH} characters` });
      return;
    }
    const renamed = renameUser(user.id, name);
    res.json({ user: { id: renamed.id, name: renamed.name } });
  });

  // Deleting the account takes its scores off the board too, and signs out
  router.delete('/me', (req, res) => {
    const user = userOf(req);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    deleteUser(user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return { router, userOf };
}
