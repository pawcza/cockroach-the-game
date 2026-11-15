/**
 * The signed-in player, if any. Guests play everything; okruszki and the leaderboard need a Google sign-in, which is a
 * full-page redirect: a guest who signs in from a game over parks that run in sessionStorage (its ticket, which the
 * server lets the account that signs in from this browser claim once, and what the screen showed), and the game boots
 * straight back onto that game over (BootScene, takeReturnToRun).
 */
import { setPlayerName } from '../utils/Storage';

export interface Account {
  id: number;
  name: string;
}

/** A guest's run waiting for the sign-in round trip: its ticket, whether it goes on its board, the game over's data. */
export interface PendingRun {
  ticket: string;
  board: boolean;
  view: Record<string, unknown>;
}

const PENDING_KEY = 'cockroach-pending-run';
/** Said by the menu when the way back to a run failed (takeReturnNotice). */
const NOTICE_KEY = 'cockroach-return-notice';

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

/** Leaves for Google's sign-in page. A run passed here is claimed, and its game over shown again, on the way back. */
export function signIn(pending?: PendingRun): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Storage blocked: the sign-in still works, the run is only not brought back
  }
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

/**
 * Back from Google with a run parked before leaving: the run (taken once) and how the sign-in went. Null when there is
 * no run waiting, and the address bar's sign-in result is left for the menu.
 */
export function takeReturnToRun(): { run: PendingRun; signIn: 'ok' | 'failed' } | null {
  if (!new URL(window.location.href).searchParams.has('signin')) return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let run: PendingRun | null = null;
  try {
    const parsed = JSON.parse(raw) as PendingRun;
    const view = parsed?.view as { score?: unknown; guest?: unknown } | null | undefined;
    // The game over can only be drawn from a score and the guest's receipt
    if (typeof parsed?.ticket === 'string' && typeof view === 'object' && view !== null && typeof view.score === 'number' && view.guest) run = parsed;
  } catch {
    // Garbled: handled below with the run that has no ticket
  }
  if (!run) {
    // The run can't be shown, but the sign-in happened: the menu says how it went (the address bar's result is left for
    // it) and, in a line of its own, that the result couldn't be brought back
    parkReturnNotice('Nie udało się wrócić do wyniku biegu');
    return null;
  }
  return { run, signIn: takeSignInResult() ?? 'failed' };
}

/** Something to say on the menu when the way back to a run failed: the menu says it once. */
export function parkReturnNotice(message: string): void {
  try { sessionStorage.setItem(NOTICE_KEY, message); } catch { /* the menu just says nothing */ }
}

export function takeReturnNotice(): string | null {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return message;
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
