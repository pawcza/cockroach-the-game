/** Which bosses have a fight to play. Registering a boss here is all it takes for solo runs to meet it. */
import { BigosFight } from './BigosFight';
import { BIGOS_TEXTURE } from './bigosConfig';
import { BossDef, BossId, BOSSES } from './bosses';
import { BossFightFactory } from './BossFight';
import { EksterminatorFight } from './EksterminatorFight';
import { EKS_TEXTURE } from './eksterminatorConfig';
import { LodziaFight } from './LodziaFight';
import { LODZIA_TEXTURE } from './lodziaConfig';
import { ZlewiatanFight } from './ZlewiatanFight';
import { ZlewiatanSoloFight } from './ZlewiatanSoloFight';
import { ZLEWIATAN_TEXTURE } from './zlewiatanConfig';

export const BOSS_FIGHTS: Partial<Record<BossId, BossFightFactory>> = {
  lodzia: (ctx) => new LodziaFight(ctx),
  bigos: (ctx) => new BigosFight(ctx),
  // Solo plays the authored fight; a match keeps the server-driven one (the server owns its HP)
  zlewiatan: (ctx) => (ctx.role === 'solo' ? new ZlewiatanSoloFight(ctx) : new ZlewiatanFight(ctx)),
  eksterminator: (ctx) => new EksterminatorFight(ctx),
};

/** A texture each fight can't start without. They load after boot, so a fight waits for its own. */
const FIGHT_TEXTURES: Partial<Record<BossId, string>> = {
  lodzia: LODZIA_TEXTURE,
  bigos: BIGOS_TEXTURE,
  zlewiatan: ZLEWIATAN_TEXTURE,
  eksterminator: EKS_TEXTURE,
};

/** The boss's assets are in: its fight can start. */
export function fightReady(id: BossId, textures: { exists: (key: string) => boolean }): boolean {
  const key = FIGHT_TEXTURES[id];
  return !key || textures.exists(key);
}

/** The server runs one boss per match, and it is this one. */
export const MULTIPLAYER_BOSS: BossId = 'zlewiatan';

/** What a solo run meets: every boss with a fight. */
export function soloLadder(): BossDef[] {
  return BOSSES.filter(b => BOSS_FIGHTS[b.id]);
}
