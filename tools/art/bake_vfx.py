"""Bakes the visual effects (tools/art/vfx.py) into their own small atlas: public/assets/vfx.webp + vfx.json.

Run from the repo root: python3 tools/art/bake_vfx.py [--sheet out.png]
Then bump ASSET_REV in BootScene. Frames are named <effect>_<n> (Phaser JSON hash) with a pivot per effect; the top-level
"anims" key carries each effect's frame count, fps, whether it loops and whether it is light (drawn additively), which
src/effects/Fx.ts reads from the texture's customData. Never touches the main sprite atlas, only reads its roach frames.
--sheet also writes a contact sheet of every effect, frames side by side at 4x on a dark and a level-like background.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from vfx import EFFECTS  # noqa: E402

OUT = Path("public/assets")
ATLAS_WIDTH = 1024
GAP = 1   # a clear texel between frames, so nearest sampling never bleeds a neighbour in


def collect() -> dict:
    return {name: make() for name, make in EFFECTS.items()}


def _trimmed(effect) -> tuple[list[Image.Image], tuple[float, float]]:
    """Crops the whole animation to the box its frames share, moving the pivot with it, so no texel is wasted."""
    frames = [Image.fromarray(f) for f in effect.frames]
    boxes = [f.getchannel("A").getbbox() for f in frames]
    boxes = [b for b in boxes if b] or [(0, 0, 1, 1)]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    w, h = frames[0].size
    px, py = effect.pivot
    pivot = ((px * w - box[0]) / (box[2] - box[0]), (py * h - box[1]) / (box[3] - box[1]))
    return [f.crop(box) for f in frames], pivot


def pack(effects: dict) -> None:
    items = []
    anims = {}
    for name, effect in effects.items():
        # The plate's pieces and the kill zone's tiles are laid side by side by the game: they keep their own sizes
        frames, pivot = ([Image.fromarray(f) for f in effect.frames], effect.pivot) if name.startswith(("plate", "zone", "cord")) else _trimmed(effect)
        anims[name] = {"frames": len(frames), "fps": effect.fps, "loop": effect.loop, "light": effect.light}
        for i, frame in enumerate(frames):
            items.append((f"{name}_{i}", frame, pivot))
    # Tallest first onto shelves: tighter than the order they were drawn in
    order = sorted(items, key=lambda it: -it[1].height)
    placed, x, y, shelf = {}, 0, 0, 0
    for key, frame, pivot in order:
        if x + frame.width > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf + GAP, 0
        placed[key] = (frame, x, y, pivot)
        x += frame.width + GAP
        shelf = max(shelf, frame.height)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for key, (frame, fx, fy, pivot) in placed.items():
        atlas.paste(frame, (fx, fy))
        w, h = frame.size
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": w, "h": h}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h},
            "pivot": {"x": round(pivot[0], 4), "y": round(pivot[1], 4)},
        }
    atlas.save(OUT / "vfx.webp", lossless=True, quality=100, method=6, exact=True)
    (OUT / "vfx.json").write_text(json.dumps({"frames": meta, "anims": anims, "meta": {"image": "vfx.webp", "scale": "1"}}))
    print(f"{len(placed)} frames in {len(anims)} effects, atlas {atlas.size}, {(OUT / 'vfx.webp').stat().st_size // 1024} KB")


def sheet(effects: dict, path: str, top: int = 4) -> None:
    """Every effect on a row, its frames left to right, over the night-kitchen teal and over a dark slab; small ones
    at top x, big ones smaller."""
    rows = []
    for name, effect in effects.items():
        frames = [Image.fromarray(f) for f in effect.frames]
        biggest = max(max(f.width, f.height) for f in frames)
        scale = 1 if biggest > 120 else 2 if biggest > 48 else top
        h = max(f.height for f in frames) * scale
        w = sum(f.width * scale + 6 for f in frames)
        row = Image.new("RGBA", (max(w, 1) * 2 + 40, h + 16), (24, 20, 26, 255))
        bg = Image.new("RGBA", (w, h), (52, 78, 76, 255))
        row.paste(bg, (w + 20, 14))
        x = 0
        for f in frames:
            big = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
            row.alpha_composite(big, (x, 14))
            row.alpha_composite(big, (w + 20 + x, 14))
            x += f.width * scale + 6
        ImageDraw.Draw(row).text((2, 1), f"{name}  {len(frames)}f {effect.fps}fps{' loop' if effect.loop else ''}{' light' if effect.light else ''}",
                                 fill=(255, 230, 140, 255))
        rows.append(row)
    W = max(r.width for r in rows)
    H = sum(r.height for r in rows)
    out = Image.new("RGBA", (W, H), (24, 20, 26, 255))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    out.save(path)
    print(f"sheet {out.size} -> {path}")


if __name__ == "__main__":
    effects = collect()
    if "--sheet" in sys.argv:
        sheet(effects, sys.argv[sys.argv.index("--sheet") + 1])
    if "--no-pack" not in sys.argv:
        pack(effects)
