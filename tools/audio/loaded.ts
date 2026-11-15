/**
 * Prints, as JSON, every audio file the game loads and under which key: { loaded: { key: { path, from } }, errors: [] }.
 * tools/audio/check.py runs it (node --import tsx tools/audio/loaded.ts), read-only on the game's sources.
 *
 * The game spreads its audio over a few places, and parts of them are computed, so this follows each the way the game
 * defines it rather than matching text:
 *   - src/config/packs.ts packAssets() for every pack the catalogue defines (the boot packs and everything streamOrder()
 *     lists: the level, enemy, skin and shop packs, the legacy one), with the real public/assets/packs.json and
 *     public/audio/skins/manifest.json: level music, the enemies' base sounds, the baked skins' sounds. Phaser-free, so it is
 *     imported and called; a pack added to the catalogue is picked up without touching this. The boss packs are PackLoader's.
 *   - src/scenes/BootScene.ts: the `audio` list, the milestone sounds and the single load.audio calls. Imports Phaser, so
 *     the literals are cut out of the source and evaluated.
 *   - src/systems/PackLoader.ts BOSS_PACKS: the shared fight pack and each boss's own (same: cut out and evaluated).
 * A source it cannot read this way goes under `errors`, which check.py reports.
 */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { BOSS_TRIGGER_DISTANCE } from '../../server/bossDistances';
import { LEVELS } from '../../src/config/levels';
import { BOOT_PACKS, type BossId, type PackManifest, type SkinSounds, packAssets, streamOrder } from '../../src/config/packs';

const read = (path: string): string => readFileSync(path, 'utf8');
const loaded: Record<string, { path: string; from: string }> = {};
const errors: string[] = [];

function add(key: string, path: string, from: string): void {
  if (key in loaded && loaded[key].path !== path) errors.push(`audio key ${key} is loaded from two files: ${loaded[key].path} (${loaded[key].from}) and ${path} (${from})`);
  loaded[key] = { path, from };
}

/** The text of the bracketed literal that opens at src[open], strings, templates and comments skipped. */
function balanced(src: string, open: number): string {
  const closing: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
  const stack: string[] = [];
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
    } else if (c in closing) {
      stack.push(closing[c]);
    } else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced literal');
}

/** The literal that follows `marker` in src (the first bracket after it), evaluated; names the file does not define are placeholders. */
function evaluate(src: string, marker: RegExp, extra = ''): unknown {
  const at = marker.exec(src);
  if (!at) throw new Error(`${marker} not found`);
  const open = src.slice(at.index + at[0].length).search(/[[{]/) + at.index + at[0].length;
  const code = transformSync(`${extra}\nreturn ${balanced(src, open)};`, { loader: 'ts', target: 'es2020' }).code;
  const names = new Set(['sfx']);
  const scope = new Proxy({}, {
    has: (_t, k) => typeof k === 'string' && !(k in globalThis) && !names.has(k) && /^[A-Za-z_$][\w$]*$/.test(k),
    get: (_t, k) => (k === 'portraitKey' ? (id: string) => `portrait-${id}` : k === Symbol.unscopables ? undefined : {}),
  });
  // `return` at the top level of a function body; the extra function declarations come first
  return new Function('scope', `with (scope) { ${code} }`)(scope);
}

try {
  const manifest = JSON.parse(read('public/assets/packs.json')) as PackManifest;
  let sounds: SkinSounds = {};
  try { sounds = JSON.parse(read('public/audio/skins/manifest.json')) as SkinSounds; } catch { /* none: no skin sounds */ }
  const ladder = (Object.entries(BOSS_TRIGGER_DISTANCE) as [BossId, number][]).map(([id, triggerDistance]) => ({ id, triggerDistance }));
  // streamOrder is the catalogue's list of every pack the menu streams (all but the boot ones, which BOOT_PACKS names)
  const ids = [...new Set([...BOOT_PACKS, ...streamOrder(ladder, LEVELS.map(l => l.distanceThreshold), [])])];
  for (const id of ids) {
    for (const a of packAssets(id, manifest, sounds) ?? []) if (a.kind === 'audio') add(a.key, a.url, `packs.ts ${id}`);
  }
} catch (e) {
  errors.push(`src/config/packs.ts: ${(e as Error).message}`);
}

try {
  const boot = read('src/scenes/BootScene.ts');
  for (const [key, path] of evaluate(boot, /const audio\s*:[^=]*=\s*/) as [string, string][]) add(key, path, 'BootScene audio');
  const tiers = evaluate(boot, /const milestoneTiers\s*=\s*/) as string[];
  const calls = [...boot.matchAll(/this\.load\.audio\(([^;]*?)\);/g)].map(m => m[1].trim());
  for (const call of calls) {
    const literal = /^'([^']+)',\s*'([^']+)'$/.exec(call);
    const template = /^`([^`]*)\$\{m\}([^`]*)`,\s*`([^`]*)\$\{m\}([^`]*)`$/.exec(call);
    if (literal) add(literal[1], literal[2], 'BootScene');
    else if (template) for (const m of tiers) add(`${template[1]}${m}${template[2]}`, `${template[3]}${m}${template[4]}`, 'BootScene milestones');
    else if (call !== 'asset.key, asset.url' && call !== 'key, path') errors.push(`BootScene.ts: a load.audio(${call}) call this script does not understand`);
  }
} catch (e) {
  errors.push(`src/scenes/BootScene.ts: ${(e as Error).message}`);
}

try {
  const loader = read('src/systems/PackLoader.ts');
  const fn = /function sfx\b/.exec(loader);
  const extra = fn ? sfxSource(loader, fn.index) : '';
  const packs = evaluate(loader, /const BOSS_PACKS[^=]*=\s*/, extra) as Record<string, { audio: [string, string][] }>;
  for (const [boss, pack] of Object.entries(packs)) for (const [key, path] of pack.audio) add(key, path, `PackLoader BOSS_PACKS.${boss}`);
} catch (e) {
  errors.push(`src/systems/PackLoader.ts: ${(e as Error).message}`);
}

/** `function sfx(...) { ... }` as source, to go ahead of the BOSS_PACKS literal. */
function sfxSource(src: string, at: number): string {
  const open = src.indexOf('{', src.indexOf(')', at));
  return src.slice(at, open) + balanced(src, open);
}

process.stdout.write(JSON.stringify({ loaded, errors }));
