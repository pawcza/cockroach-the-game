/**
 * Okruszki, the shop and the missions, as the server keeps them for a signed-in player. Guests have none of it: the
 * shop shows them what there is and asks them to sign in.
 */
import { PLAIN, type Look } from '../config/skins';
import { noteFacts } from '../systems/Profile';
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
  /** Missions finished, as the server counts them. */
  missionsDone: number;
}

let current: ShopState | null = null;

/** What the server just said. Missions done and items owned are its record, and the profile's achievements on them follow it. */
export function adoptShop(state: ShopState): ShopState {
  current = state;
  noteFacts({ missionsDone: state.missionsDone, itemsOwned: state.owned.length });
  return state;
}

/** The last state heard from the server; null for a guest or before it loads. */
export const shop = (): ShopState | null => current;

let listed: Record<string, number> = {};

/** What things cost: the signed-in player's shop state has them, a guest's come from loadPrices. */
export const priceList = (): Record<string, number> => current?.prices ?? listed;

/** Reads the prices for a guest, so the wardrobe shows what there is to earn. Offline, there are none. */
export async function loadPrices(): Promise<void> {
  const prices = await read<Record<string, number>>(await send('/api/shop/prices'));
  if (prices) listed = prices;
}

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

/** The body of an answer that is ok and JSON; null for anything else (a proxy's HTML page during a deploy, a cut connection). */
async function read<T>(res: Response | null): Promise<T | null> {
  if (!res?.ok) return null;
  try {
    return await res.json() as T;
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
  const state = await read<ShopState>(await send('/api/me/shop'));
  current = state ? adoptShop(state) : null;
  return current;
}

/** Buys an item; returns why not, or null when it's yours. */
export async function buyItem(item: string): Promise<string | null> {
  const res = await send('/api/me/buy', { item });
  if (!res) return 'Brak połączenia';
  if (!res.ok) {
    try {
      return ((await res.json()) as { error?: string }).error ?? 'Nie udało się';
    } catch {
      return 'Nie udało się';
    }
  }
  const state = await read<ShopState>(res);
  if (!state) return 'Nie udało się';
  adoptShop(state);
  return null;
}

/** Puts on (or takes off) items you own. */
export async function wearLook(look: Look): Promise<boolean> {
  const state = await read<ShopState>(await send('/api/me/look', look));
  if (!state) return false;
  adoptShop(state);
  return true;
}
