"""Bakes every animated sprite into public/assets/sprites.webp + sprites.json (Phaser JSON hash).

Run from the repo root after changing art/sprites or a rig: python3 tools/art/bake.py
Then bump ASSET_REV in BootScene. Frames are native pixels (one texel = one world block), named <anim>_<n>, with a
pivot on the object's baseline, so anything placed at the floor Y stands on the floor. Obstacles and pickups carry
their soft red or green glow in the frames: no runtime outlines and no preFX cost.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ni

sys.path.insert(0, str(Path(__file__).parent))
import armed  # noqa: E402
import buttons  # noqa: E402
import pixels  # noqa: E402
from creatures import CREATURES  # noqa: E402
from objects import OBJECTS  # noqa: E402
from roach import ANIMATIONS, baked, frames_with_anchors, painted  # noqa: E402
from skins import PAINTED  # noqa: E402
from gunact import GUNACT, GUNACT_PICKUPS  # noqa: E402
from hopact import HOPACT  # noqa: E402
from swatters import SWATTERS  # noqa: E402
from worn import ITEMS, bake as bake_item  # noqa: E402

OUT = Path("public/assets")
AREA = 620        # visible native px every object is scaled to
MAX_SIZE = (48, 40)
FACTOR = {"cat": 1.3, "bison": 1.25, "blackhole": 1.3}
PAD = 8           # transparent margin for the glow; src/config/sprites.ts has the same number
GLOW_RADIUS = 3.5
GLOW_ALPHA = .8
RED = (255, 40, 50)
GREEN = (50, 255, 110)
PICKUPS = {"apple", "pill", *(f"beer-{n}" for n in range(1, 7))}
UNLIT = {"bleach", "spray-big"}  # drawn without the enemies' red glow: harmless props, only what they drop or puff hurts
ATLAS_WIDTH = 2048  # with the shop's skins; at most 2048 either way, which every phone takes


def _drop_specks(frame: np.ndarray) -> np.ndarray:
    """Cutting a limb out can leave a few stray pixels floating beside the object."""
    labels, count = ni.label(frame[..., 3] > 128)
    if count < 2:
        return frame
    sizes = ni.sum(np.ones_like(labels), labels, range(1, count + 1))
    out = frame.copy()
    out[np.isin(labels, np.nonzero(sizes < sizes.max() * .02)[0] + 1), 3] = 0
    return out


SIZES: dict[str, tuple] = {}


def _resize(frames: list[np.ndarray], name: str) -> list[Image.Image]:
    """Native frames (one painted pixel per texel, from the rigs) to game size by one whole factor for the whole
    animation, so the object doesn't pulse or drift and its pixels stay pixels. The factor is the one closest to the
    size AREA, MAX_SIZE and FACTOR ask for; each block keeps its commonest colour (pixels.down), then the strip snaps
    to its own small palette."""
    images = [_drop_specks(f) for f in frames]
    boxes = [Image.fromarray(i).getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox() for i in images]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    first = images[0][boxes[0][1]:boxes[0][3], boxes[0][0]:boxes[0][2]]
    area = (first[..., 3] > 128).sum()
    factor = FACTOR.get(name, 1)
    scale = min((AREA * factor / area) ** .5, MAX_SIZE[0] * factor / first.shape[1], MAX_SIZE[1] * factor / first.shape[0])
    n = min(range(1, 13), key=lambda k: abs(np.log(scale * k)))
    crops = [i[box[1]:box[3], box[0]:box[2]] for i in images]
    smooth = f"art/sprites/{name}.png" in pixels.NO_GRID
    small = [pixels.down(c, n, smooth=smooth) for c in crops]
    palette = pixels.palette_of(small, 160)
    small = [pixels.snap(f, palette) for f in small]
    SIZES[name] = (first.shape[1], first.shape[0], n, round(first.shape[1] * scale), round(first.shape[0] * scale))
    return [Image.fromarray(f) for f in small]


def _padded(frame: Image.Image) -> Image.Image:
    """The same transparent margin the glow sits in, without the glow: so its pivot and size work like the rest."""
    canvas = Image.new("RGBA", (frame.width + PAD * 2, frame.height + PAD * 2))
    canvas.alpha_composite(frame, (PAD, PAD))
    return canvas


def _with_glow(frame: Image.Image, colour: tuple[int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (frame.width + PAD * 2, frame.height + PAD * 2))
    solid = np.asarray(frame.getchannel("A"))
    frame = Image.fromarray(np.dstack([np.asarray(frame)[..., :3], (solid > 128) * 255]).astype(np.uint8))
    mask = Image.new("L", canvas.size)
    mask.paste(frame.getchannel("A"), (PAD, PAD))
    halo = np.asarray(mask.filter(ImageFilter.GaussianBlur(GLOW_RADIUS))).astype(float) / 255
    alpha = np.clip(halo * 1.6, 0, GLOW_ALPHA) * 255
    glow = np.dstack([np.full(alpha.shape + (3,), colour), alpha]).astype(np.uint8)
    canvas.alpha_composite(Image.fromarray(glow))
    canvas.alpha_composite(frame, (PAD, PAD))
    return canvas


def collect() -> tuple[dict, dict]:
    """Animation name to (frames, pivot y, or (x, y)); and the anchors file for what a roach wears."""
    sheet = {}
    anchors = {"roach": {}, "items": {}}
    for name, make in ANIMATIONS.items():
        rig_frames, frame_anchors = frames_with_anchors(make)
        frames = [baked(f) for f in rig_frames]
        sheet[f"roach-{name}"] = (frames, .5)
        anchors["roach"][name] = frame_anchors
        # Shop skins: every painted skin from its own body on the rig
        for skin, source in PAINTED.items():
            with painted(source):
                sheet[f"roach-{skin}-{name}"] = ([baked(f) for f in make()], .5)
    # The boss fight's, up on its hind legs: a taller cell, its pivot on the same point of the roach as the run's
    for name, make in armed.ARMED.items():
        frames, frame_anchors = armed.frames_with_anchors(make)
        sheet[f"roach-{name}"] = (frames, armed.PIVOT)
        anchors["roach"][name] = frame_anchors
        for skin, source in PAINTED.items():
            with painted(source):
                sheet[f"roach-{skin}-{name}"] = (make(), armed.PIVOT)
    sheet.update(armed.props())
    # What a roach wears: each its own looping animation, its pivot where it meets the roach
    for item_id, item in ITEMS.items():
        frames, pivot = bake_item(item)
        sheet[f"acc-{item_id}"] = (frames, pivot)
        anchors["items"][item_id] = {"anchor": item.anchor, "behind": item.behind, "frames": len(frames), "fps": item.fps,
                                     "with": list(item.companions)}
    for name, make in {**CREATURES, **OBJECTS}.items():
        colour = GREEN if name in PICKUPS else RED
        frames = [_with_glow(f, colour) for f in _resize(make(), name)]
        sheet[name] = (frames, (frames[0].height - PAD) / frames[0].height)
    # The swatters, the hop and gun acts' enemies: already at game size from their picked renders, one canvas per strip;
    # the ammo box is drawn at game size
    for name, make in {**SWATTERS, **HOPACT, **GUNACT, **GUNACT_PICKUPS}.items():
        # The bleach jug and the spray's big can stand out of the way at the back of the ledge: no red glow
        frames = [f if name in UNLIT else _with_glow(f, GREEN if name in GUNACT_PICKUPS else RED) for f in make()]
        if name in UNLIT:
            frames = [_padded(f) for f in frames]
        sheet[name] = (frames, (frames[0].height - PAD) / frames[0].height)
    sheet.update(buttons.frames())
    return sheet, anchors


def pack(sheet, anchors) -> None:
    placed, x, y, shelf = {}, 0, 0, 0
    for name, (frames, pivot) in sheet.items():
        for i, frame in enumerate(frames):
            if x + frame.width > ATLAS_WIDTH:
                x, y, shelf = 0, y + shelf, 0
            placed[f"{name}_{i}"] = (frame, x, y, pivot)
            x += frame.width
            shelf = max(shelf, frame.height)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for key, (frame, fx, fy, pivot) in placed.items():
        atlas.paste(frame, (fx, fy))
        w, h = frame.size
        px, py = pivot if isinstance(pivot, tuple) else (.5, pivot)
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": w, "h": h}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h},
            "pivot": {"x": round(px, 4), "y": round(py, 4)},
        }
    atlas.save(OUT / "sprites.webp", lossless=True, quality=100, exact=True)
    (OUT / "sprites.json").write_text(json.dumps({"frames": meta, "meta": {"image": "sprites.webp", "scale": "1"}}))
    (OUT / "anchors.json").write_text(json.dumps(anchors))
    strip = Image.new("RGBA", (sum(f.width for f in sheet["roach-run"][0]), sheet["roach-run"][0][0].height))
    for i, frame in enumerate(sheet["roach-run"][0]):
        strip.paste(frame, (i * frame.width, 0))
    strip.save(OUT / "roach-run.png")  # the HTML loading screen runs before the atlas exists
    print(f"{len(placed)} frames, atlas {atlas.size}, {(OUT / 'sprites.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    pack(*collect())
