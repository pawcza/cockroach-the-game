/**
 * The signed-in player, if any. Guests play everything; only the leaderboard needs a Google sign-in, which is a
 * full-page redirect, so a score waiting to be saved is parked in sessionStorage and saved on the way back.
 */
import { setPlayerName } from '../utils/Storage';

export interface Account {
  id: number;
  name: string;
}

/** A finished run's numbers, as POST /api/scores takes them. */
export type ScoreSubmission = Record<string, number | string | null>;

const PENDING_KEY = 'cockroach-pending-score';

let current: Account | null = null;
let available = false;

export const account = (): Account | null => current;
export const signInAvailable = (): boolean => available;

function adopt(user: Account | null): void {
  current = user;
  // Multiplayer and the menu read the local name, so a signed-in player is known by their account name everywhere
  if (user) setPlayerName(user.name);
}

/** Asks the server who this is. Offline or failing, the player is simply a guest. */
export async function loadAccount(): Promise<Account | null> {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return current;
    const body = await res.json() as { user: Account | null; signInAvailable: boolean };
    available = body.signInAvailable;
    adopt(body.user);
  } catch {
    // Keep whatever we knew
  }
  return current;
}

/** Leaves for Google's sign-in page. A score passed here is saved when the player comes back signed in. */
export function signIn(pending?: ScoreSubmission): void {
  if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  window.location.href = '/api/auth/google';
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  current = null;
}

/** Deletes the account and its scores on the server, and becomes a guest. */
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await fetch('/api/me', { method: 'DELETE' });
    if (!res.ok) return false;
    current = null;
    return true;
  } catch {
    return false;
  }
}

export async function renameAccount(name: string): Promise<boolean> {
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return false;
    adopt((await res.json() as { user: Account }).user);
    return true;
  } catch {
    return false;
  }
}

export async function submitScore(submission: ScoreSubmission): Promise<boolean> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The score parked before a sign-in, taken once. */
export function takePendingScore(): ScoreSubmission | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScoreSubmission;
  } catch {
    return null;
  }
}

/** What the sign-in redirect reported (?signin=ok|failed), read once and cleared from the address bar. */
export function takeSignInResult(): 'ok' | 'failed' | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get('signin');
  if (!result) return null;
  url.searchParams.delete('signin');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return result === 'ok' ? 'ok' : 'failed';
}
