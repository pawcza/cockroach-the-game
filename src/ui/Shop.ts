/**
 * Okruszki, the shop and the missions, as the server keeps them for a signed-in player. Guests have none of it: the
 * shop shows them what there is and asks them to sign in.
 */
import { PLAIN, type Look } from '../config/skins';
import { profilePushed, type RunSnapshot } from '../systems/Profile';
import { account } from './Account';

export interface Mission {
  id: string;
  text: string;
  goal: number;
  progress: number;
  reward: number;
  done: boolean;
}

export interface ShopState {
  crumbs: number;
  prices: Record<string, number>;
  owned: string[];
  look: Look;
  missions: Mission[];
}

let current: ShopState | null = null;

/** The last state heard from the server; null for a guest or before it loads. */
export const shop = (): ShopState | null => current;

/** What your roach wears: your account's look, or the plain roach. */
export const myLook = (): Look => current?.look ?? PLAIN;

async function send(path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** Fetches the shop for the signed-in player; a guest gets null. */
export async function loadShop(): Promise<ShopState | null> {
  if (!account()) {
    current = null;
    return null;
  }
  const res = await send('/api/me/shop');
  current = res?.ok ? await res.json() as ShopState : null;
  return current;
}

/** A finished run, for the missions. Returns the ones it finished, which have been paid. */
export async function reportRun(run: RunSnapshot, multiplayer: boolean): Promise<{ text: string; reward: number }[]> {
  if (!account()) return [];
  // The run's achievements are paid with the profile: wait for that, so the state that comes back counts them
  await profilePushed();
  const res = await send('/api/me/run', {
    score: run.score, distance: run.distance, level: run.level, combo: run.combo, apples: run.apples,
    beers: run.beers, pills: run.pills, nearMisses: run.nearMisses, dashThroughs: run.dashThroughs,
    wallsBroken: run.wallsBroken, daily: run.daily, multiplayer,
  });
  if (!res?.ok) return [];
  const { completed, state } = await res.json() as { completed: { text: string; reward: number }[]; state: ShopState };
  current = state;
  return completed;
}

/** Buys an item; returns why not, or null when it's yours. */
export async function buyItem(item: string): Promise<string | null> {
  const res = await send('/api/me/buy', { item });
  if (!res) return 'Brak połączenia';
  if (!res.ok) return ((await res.json()) as { error?: string }).error ?? 'Nie udało się';
  current = await res.json() as ShopState;
  return null;
}

/** Puts on (or takes off) items you own. */
export async function wearLook(look: Look): Promise<boolean> {
  const res = await send('/api/me/look', look);
  if (!res?.ok) return false;
  current = await res.json() as ShopState;
  return true;
}
