/**
 * No PNG in the repo carries text or EXIF metadata: ComfyUI writes its whole workflow into a render's text chunks,
 * private file names included. Strip a new image with `python3 tools/art/strip_meta.py <file>` before adding it.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = join(__dirname, '..');
const METADATA = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);

function pngs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pngs(path);
    return entry.name.toLowerCase().endsWith('.png') ? [path] : [];
  });
}

function metadataOf(path: string): string[] {
  const data = readFileSync(path);
  const found: string[] = [];
  for (let at = 8; at + 8 <= data.length;) {
    const length = data.readUInt32BE(at);
    const kind = data.toString('latin1', at + 4, at + 8);
    if (METADATA.has(kind)) found.push(kind);
    if (kind === 'IEND') break;
    at += 12 + length;
  }
  return found;
}

test('no PNG under art/ or public/ carries text or EXIF metadata', () => {
  const dirty = ['art', 'public'].flatMap(dir => pngs(join(ROOT, dir)))
    .map(path => ({ path: relative(ROOT, path), kinds: metadataOf(path) }))
    .filter(f => f.kinds.length > 0);
  assert.deepEqual(dirty, [], 'strip them with python3 tools/art/strip_meta.py <file>');
});
