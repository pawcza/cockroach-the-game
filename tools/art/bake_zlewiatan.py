"""Bakes Zlewiatan (tools/art/zlewiatan.py) into its own atlas, public/boss/zlewiatan.webp + .json, and writes what the
game needs to know about the frames into src/systems/boss/zlewiatanFrames.ts.

Run from the repo root: python3 tools/art/bake_bosses.py zlewiatan

The creature's frames share one cell whose pivot is the boss's point in the fight (cam.width - 95 world px, between
the floors). They are trimmed, so the big cell costs only what each frame draws. Its shots are frames of the same
atlas, each on its own small cell with its pivot in its middle (the puddle's and the mark's on the floor).

zlewiatanFrames.ts is generated: the animations' frame counts and speeds, where each head's mouth is on the frame its
shot leaves (native px from the pivot), and the creature's front on every row, so bullets stop where it is drawn.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import zlewiatan as z  # noqa: E402

OUT = Path("public/boss")
FRAMES_TS = Path("src/systems/boss/zlewiatanFrames.ts")
ATLAS_WIDTH = 2048
RELEASE = {"spit-block": "block", "spit-pierog": "pierog", "spit-carp": "carp", "rage-spit": "block"}


def _release_frame(name: str) -> int:
    poses = z.ANIMATIONS[name][0]()
    return next(i for i, p in enumerate(poses) if p.fire)


def _front(frames, box, pivot_px, layer=None) -> list:
    """The leftmost drawn px on every row of the cell, over all the frames given: native px from the pivot, or None.
    `layer`: only what that layer of the rig drew (one head)."""
    alpha = np.zeros((box[3] - box[1], box[2] - box[0]), bool)
    for d in frames:
        if layer is None:
            alpha |= np.asarray(d.image.crop(box).getchannel("A")) > 128
        else:
            alpha |= d.masks[layer][box[1]:box[3], box[0]:box[2]]
    out = []
    for row in alpha:
        xs = np.nonzero(row)[0]
        out.append(int(xs.min() - pivot_px[0]) if len(xs) else None)
    return out


def bake_zlewiatan() -> None:
    rendered = {name: z.render(name) for name in z.ANIMATIONS}
    problems = [f"{n}[{i}] {f}" for n, fr in rendered.items() for i, d in enumerate(fr) for f in d.failures]
    if problems:
        raise SystemExit("the rig fails:\n" + "\n".join(problems))
    box = z._crop_box([d for fr in rendered.values() for d in fr])
    cell_w, cell_h = box[2] - box[0], box[3] - box[1]
    pivot_px = (z.CONTAINER[0] - z.X0 - box[0], z.CONTAINER[1] - z.Y0 - box[1])
    pivot = (pivot_px[0] / cell_w, pivot_px[1] / cell_h)

    frames = []        # (key, image, trim, source size, pivot)
    for name, drawn in rendered.items():
        for i, d in enumerate(drawn):
            cell = d.image.crop(box)
            trim = cell.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
            frames.append((f"zlewiatan-{name}_{i}", cell.crop(trim), trim, (cell_w, cell_h), pivot))
    for name, (images, _, _, piv) in z.PROJECTILES.items():
        for i, arr in enumerate(images):
            cell = Image.fromarray(arr)
            trim = cell.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
            frames.append((f"zlewiatan-{name}_{i}", cell.crop(trim), trim, cell.size, piv))

    # shelves, tallest first, so the sheet packs tight
    order = sorted(range(len(frames)), key=lambda k: -frames[k][1].height)
    placed, x, y, shelf = {}, 0, 0, 0
    for k in order:
        img = frames[k][1]
        if x + img.width > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf, 0
        placed[k] = (x, y)
        x += img.width + 1
        shelf = max(shelf, img.height + 1)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for k, (key, img, trim, size, piv) in enumerate(frames):
        fx, fy = placed[k]
        atlas.paste(img, (fx, fy))
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": img.width, "h": img.height}, "rotated": False, "trimmed": True,
            "spriteSourceSize": {"x": trim[0], "y": trim[1], "w": img.width, "h": img.height},
            "sourceSize": {"w": size[0], "h": size[1]},
            "pivot": {"x": round(piv[0], 4), "y": round(piv[1], 4)},
        }
    used = atlas.getbbox()
    atlas = atlas.crop((0, 0, used[2], used[3]))
    atlas.save(OUT / "zlewiatan.webp", lossless=True, quality=100, exact=True)
    (OUT / "zlewiatan.json").write_text(json.dumps({"frames": meta, "meta": {"image": "zlewiatan.webp", "scale": "1"}}))

    anims = {name: (len(rendered[name]), fps, loop) for name, (_, fps, loop) in z.ANIMATIONS.items()}
    anims.update({name: (len(images), fps, loop) for name, (images, fps, loop, _) in z.PROJECTILES.items()})
    release = {}
    for name, head in RELEASE.items():
        i = _release_frame(name)
        mx, my = rendered[name][i].mouths[head]
        release[name] = (i, head, round(mx - z.CONTAINER[0]), round(my - z.CONTAINER[1]))
    front_idle = _front(rendered["idle"], box, pivot_px)
    front_charge = _front(rendered["charge"], box, pivot_px)
    # The solo fight: each head's own front (where a bullet stops on it), each set of heads' front with its necks (where
    # a bullet glances off the pipes), and where each head's middle is at rest (where it falls off from)
    head_front = {h: _front(rendered["idle"], box, pivot_px, layer=h) for h in z.ORDER}
    set_front = {k: _front(rendered[f"idle-{k}"], box, pivot_px) for k in z.SETS}
    middles = {h: tuple(round(float(c), 1) for c in z._rest_middle(h) - np.array(z.CONTAINER)) for h in z.ORDER}
    # Per set of heads left (bpc: all three): where each head sits, its mouth as it spits, its front on every row
    set_heads = {}
    for key, keep in [("bpc", tuple(z.ORDER))] + list(z.SETS.items()):
        idle = rendered["idle" if key == "bpc" else f"idle-{key}"]
        set_heads[key] = {}
        for h in keep:
            spit = rendered[f"spit-{h}" if key == "bpc" else f"spit-{h}-{key}"][_release_frame(f"spit-{h}")]
            mid = z._rest_middle(h) + z._shift(key, h) - np.array(z.CONTAINER)
            mouth = np.array(spit.mouths[h]) - np.array(z.CONTAINER)
            set_heads[key][h] = (tuple(round(float(c), 1) for c in mid), tuple(round(float(c)) for c in mouth),
                                 _front(idle, box, pivot_px, layer=h))
    halves = {}
    for name in ("slab", "radiator", "skwarka", "bone", "bubble", "smietana"):
        images, _, _, (px, py) = z.PROJECTILES[name]
        ws, hs = [], []
        for arr in images:
            box_ = Image.fromarray(arr).getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
            cx, cy = arr.shape[1] * px, arr.shape[0] * py
            ws.append(max(cx - box_[0], box_[2] - cx))
            hs.append(max(cy - box_[1], box_[3] - cy))
        halves[name] = (round(sum(ws) / len(ws), 1), round(sum(hs) / len(hs), 1))
    _write_ts(anims, release, front_idle, front_charge, pivot_px, (cell_w, cell_h), halves, head_front, set_front, middles,
              set_heads)
    print("shots, half width x half height, native px:", halves)
    print(f"zlewiatan: {len(frames)} frames, cell {cell_w}x{cell_h}, pivot {pivot[0]:.4f},{pivot[1]:.4f}, "
          f"atlas {atlas.size}, {(OUT / 'zlewiatan.webp').stat().st_size // 1024} KB")
    print("release:", release)


def _write_ts(anims, release, front_idle, front_charge, pivot_px, cell, halves, head_front, set_front, middles, set_heads) -> None:
    def arr(values):
        return "[" + ", ".join("null" if v is None else str(v) for v in values) + "]"
    names = " | ".join(f"'{n}'" for n in anims)
    lines = [
        "/**",
        " * Generated by tools/art/bake_zlewiatan.py from the rig (tools/art/zlewiatan.py): don't edit, re-bake.",
        " * Native px; positions are from the frames' pivot, the boss's point in the fight.",
        " */",
        "",
        f"export type ZlewiatanAnim = {names};",
        "",
        "/** Frame counts and speeds, as baked. */",
        "export const ZLEWIATAN_ANIMS: Record<ZlewiatanAnim, { frames: number; fps: number; loop: boolean }> = {",
    ]
    for n, (count, fps, loop) in anims.items():
        lines.append(f"  '{n}': {{ frames: {count}, fps: {fps}, loop: {'true' if loop else 'false'} }},")
    lines += [
        "};",
        "",
        "/** The frame each spit lets its shot go on, and where that head's mouth is then. */",
        "export const ZLEWIATAN_RELEASE = {",
    ]
    for n, (i, head, x, y) in release.items():
        lines.append(f"  '{n}': {{ frame: {i}, head: '{head}', x: {x}, y: {y} }},")
    lines += [
        "} as const;",
        "",
        f"/** The cell: {cell[0]}x{cell[1]}, its pivot at ({pivot_px[0]}, {pivot_px[1]}). Row r of the fronts is pivot y + r - FRONT_TOP. */",
        f"export const FRONT_TOP = {round(pivot_px[1])};",
        "/** The creature's leftmost drawn px on each row, through the idle loop (null: nothing on that row). */",
        f"export const FRONT_IDLE: readonly (number | null)[] = {arr(front_idle)};",
        "/** The same, leaning in through the charge. */",
        f"export const FRONT_CHARGE: readonly (number | null)[] = {arr(front_charge)};",
        "",
        "/** How far each shot is drawn from its middle, on average over its frames: half its width and half its height. */",
        "export const SHOT_HALF = {",
        *[f"  '{n}': {{ w: {w}, h: {h} }}," for n, (w, h) in halves.items()],
        "} as const;",
        "",
        "/** The solo fight: each head's own leftmost drawn px on each row, through the idle loop (rows as FRONT_IDLE). */",
        "export const HEAD_FRONT: Record<'block' | 'pierog' | 'carp', readonly (number | null)[]> = {",
        *[f"  {h}: {arr(v)}," for h, v in head_front.items()],
        "};",
        "/** With only these heads left (b block, p pierog, c carp): the creature's front, necks and all, through its idle. */",
        "export const SET_FRONT: Record<'bp' | 'bc' | 'pc' | 'b' | 'p' | 'c', readonly (number | null)[]> = {",
        *[f"  {k}: {arr(v)}," for k, v in set_front.items()],
        "};",
        "/** Each head's middle at rest, from the pivot: where it falls off from. */",
        "export const HEAD_MIDDLE = {",
        *[f"  {h}: {{ x: {x}, y: {y} }}," for h, (x, y) in middles.items()],
        "} as const;",
        "",
        "/** By the heads left (bpc: all three): where each sits (its middle), its mouth as it spits, its front on every row. */",
        "export const SET_HEADS: Record<string, Partial<Record<'block' | 'pierog' | 'carp', { mid: { x: number; y: number }; "
        "mouth: { x: number; y: number }; front: readonly (number | null)[] }>>> = {",
        *[f"  {k}: {{ " + " ".join(f"{h}: {{ mid: {{ x: {m[0]}, y: {m[1]} }}, mouth: {{ x: {mo[0]}, y: {mo[1]} }}, front: {arr(fr)} }},"
                                    for h, (m, mo, fr) in v.items()) + " },"
          for k, v in set_heads.items()],
        "};",
        "",
    ]
    FRAMES_TS.write_text("\n".join(lines))


if __name__ == "__main__":
    bake_zlewiatan()
