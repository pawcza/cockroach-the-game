"""Bakes every animated sprite into the game's atlases (Phaser JSON hash), one per pack, plus assets/packs.json.

Run from the repo root after changing art/sprites or a rig: python3 tools/art/bake.py [--out DIR] [--no-skins]
Then bump ASSET_REV in BootScene. Frames are native pixels (one texel = one world block), named <anim>_<n>, with a
pivot on the object's baseline, so anything placed at the floor Y stands on the floor. Obstacles and pickups carry
their soft red or green glow in the frames: no runtime outlines and no preFX cost.

The atlases, each at most 2048 px a side (src/config/packs.ts loads them):
  sprites            what boot needs: the plain roach (run and armed), worn items, pickups, the gun, buttons and icons
  roach/<skin>       one shop skin each, loaded when it is worn or the wardrobe opens
  enemies/lv<N>      the base art of the enemies that first appear in level N (ENEMY_TIER), loaded with that level;
                     enemies/legacy holds art no level fields any more (old records, the hand-held swatters)
  skins/lv<N>[-k]    level N's enemy skins, when any are baked, in as many sheets as they need
Every frame is in exactly one of them; packs.json lists which exist, and which skins are baked. Everything is written
only once the whole bake has succeeded (tools/art/packing.py publish).

ENEMY SKINS (src/objects/obstacles/cast.ts): a skin is a base enemy drawn as something that fits a level. Its frames are
named `<skinId>/<baseAnim>_<n>` (animation `<skinId>/<baseAnim>`, e.g. lv5-goose/hen and lv5-goose/hen-head), with the
base animation's frame count and order, so the game poses it with the base's frame indices. Rigs come from
tools/art/skinrigs.py (`SKIN_RIGS`, keyed by that animation key, each a callable returning frames like the base's rig),
with stills in art/sprites/enemies/skins/<skinId>[-pose].png. Each is baked like its base animation (size, glow,
padding, pivot by the base's name) into skins/lv<N> of the level in its id. A skin lights up in the game once every
animation that depicts its base enemy (cast.ts SKIN_PARTS) is in; until then the base art shows.
"""
import argparse
import io
import json
import re
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ni

sys.path.insert(0, str(Path(__file__).parent))
import armed  # noqa: E402
import buttons  # noqa: E402
import icons  # noqa: E402
import packing  # noqa: E402
import pixels  # noqa: E402
from creatures import CREATURES  # noqa: E402
from objects import OBJECTS  # noqa: E402
from roach import ANIMATIONS, baked, frames_with_anchors, painted  # noqa: E402
from skins import PAINTED  # noqa: E402
from gunact import GUNACT, GUNACT_PICKUPS  # noqa: E402
from hopact import HOPACT  # noqa: E402
from swatters import SWATTERS  # noqa: E402
from worn import ITEMS, bake as bake_item  # noqa: E402

try:
    from skinrigs import SKIN_RIGS  # noqa: E402
except ModuleNotFoundError:
    SKIN_RIGS = {}
except Exception:  # a rig file half-written mid-edit: bake without skins rather than not at all
    print("tools/art/skinrigs.py failed to import, baking without skins:", file=sys.stderr)
    traceback.print_exc()
    SKIN_RIGS = {}

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
# Strips lit only on some frames: the bleach's drop glows only as it falls (frame 3), not while it swells at the cap; a
# dancing boot only stomped down (frame 1), never lifted
PARTLY_LIT = {"bleach-drop": {3}, "boot": {1}}
ATLAS_WIDTH = 2048  # at most 2048 either way, which every phone takes

# Which atlas each enemy animation goes in: the level whose cast (src/objects/obstacles/cast.ts CAST) first fields that
# enemy. tests/packs.test.ts checks this against CAST. Art no level fields goes in enemies/legacy
ENEMY_TIER = {
    "onion": 1, "glue": 1, "flipper-swat": 1, "flipper": 1, "bleach": 1, "bleach-drop": 1, "bleach-splash": 1,
    "spray": 2, "spray-big": 2, "lamp": 2, "mop": 2,
    "newspaper-swat": 3, "newspaper": 3, "vacuum": 3,
    "bird": 4, "hen": 4, "hen-head": 4,
    "cat": 5, "frog": 5,
    "centipede": 6, "boot": 6,
    "jellyfish": 7, "gull": 7, "wasp": 7,
    "bug-zapper": 8, "robot-vacuum": 8, "aerosol": 8,
    "bison": 9, "hedgehog": 9, "repeller": 9,
    "bait": 10,
}
LEGACY = {"pope", "blackhole", "disco", "flipper-swat-hand", "newspaper-swat-hand"}
SKIN_KEY = re.compile(r"^lv(\d+)-[a-z0-9-]+/([a-z0-9-]+)$")


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


# The pickups, one family a little smaller than the enemies, by less than a whole factor (an apple 36x48 texels would
# halve to 18x24): scaled on the 8x grid and read back block by block, so they stay crisp. The owner's hand-tuned sizes
# (the sprite tuner) are on top: the apple x .8, beers 3, 4 and 6 x .9; the bison, 1.5 times what its rig gives
RESCALE = {"apple": .72 * .8, "pill": .9, **{f"beer-{n}": .8 * (.9 if n in (3, 4, 6) else 1) for n in range(1, 7)}, "bison": 1.5}


def _rescaled(frames: list[Image.Image], scale: float) -> list[Image.Image]:
    """Frames sharing one canvas, scaled together on the 8x grid (nearest) and read back 8x with pixels.down."""
    if scale == 1:
        return frames
    out = []
    for f in frames:
        w, h = round(f.width * scale), round(f.height * scale)
        big = Image.fromarray(pixels.up(np.asarray(f), 8)).resize((w * 8, h * 8), Image.NEAREST)
        out.append(Image.fromarray(pixels.down(np.asarray(big), 8)))
    return out


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


def _resized_strip(name: str, frames: list[np.ndarray]) -> list[Image.Image]:
    """The creatures and objects: from native rig frames to game size (AREA, MAX_SIZE, FACTOR, RESCALE by `name`), glowing."""
    colour = GREEN if name in PICKUPS else RED
    return [_with_glow(f, colour) for f in _rescaled(_resize(frames, name), RESCALE.get(name, 1))]


def _sized_strip(name: str, frames: list[Image.Image]) -> list[Image.Image]:
    """The swatters, the hop and gun acts' enemies: already at game size, padded, lit as `name` is (UNLIT, PARTLY_LIT)."""
    # The bleach jug and the spray's big can stand out of the way at the back of the ledge: no red glow
    lit = PARTLY_LIT.get(name)
    return [_padded(f) if name in UNLIT or (lit is not None and i not in lit) else _with_glow(f, GREEN if name in GUNACT_PICKUPS else RED)
            for i, f in enumerate(frames)]


def _baseline(frames: list[Image.Image]) -> float:
    return (frames[0].height - PAD) / frames[0].height


RESIZED = {**CREATURES, **OBJECTS}
SIZED = {**SWATTERS, **HOPACT, **GUNACT, **GUNACT_PICKUPS}


def collect_skins(sheet: dict) -> dict:
    """The enemy skins from tools/art/skinrigs.py, each treated like its base animation. A skin whose rig raises, or
    whose strip doesn't match its base's frame count, is reported and left out whole (all its animations)."""
    out, broken = {}, set()
    for key, make in SKIN_RIGS.items():
        skin = key.split("/", 1)[0]
        match = SKIN_KEY.match(key)
        base = match.group(2) if match else None
        try:
            if base is None or base not in sheet or not (base in RESIZED or base in SIZED):
                raise ValueError(f"not <skinId>/<baseAnim> of a baked enemy animation")
            frames = _resized_strip(base, make()) if base in RESIZED else _sized_strip(base, make())
            if len(frames) != len(sheet[base][0]):
                raise ValueError(f"{len(frames)} frames, its base {base} has {len(sheet[base][0])}")
            out[key] = (frames, _baseline(frames))
        except Exception as error:  # one broken skin must not stop the bake
            print(f"skin {key} skipped: {error}", file=sys.stderr)
            broken.add(skin)
    return {key: entry for key, entry in out.items() if key.split("/", 1)[0] not in broken}


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
    for name, make in RESIZED.items():
        frames = _resized_strip(name, make())
        sheet[name] = (frames, _baseline(frames))
    # The swatters, the hop and gun acts' enemies: already at game size from their picked renders, one canvas per strip;
    # the ammo box is drawn at game size
    for name, make in SIZED.items():
        frames = _sized_strip(name, make())
        sheet[name] = (frames, _baseline(frames))
    sheet.update(buttons.frames())
    sheet.update(icons.frames())
    return sheet, anchors


ROACH_SKIN = re.compile(rf"^roach-({'|'.join(PAINTED)})-")


def atlas_of(name: str) -> str:
    """Which atlas an animation is baked into (see the header)."""
    skin = SKIN_KEY.match(name)
    if skin:
        return f"skins/lv{skin.group(1)}"
    worn = ROACH_SKIN.match(name)
    if worn:
        return f"roach/{worn.group(1)}"
    if name in ENEMY_TIER:
        return f"enemies/lv{ENEMY_TIER[name]}"
    if name in LEGACY:
        return "enemies/legacy"
    if name in RESIZED or name in SIZED:
        if name not in PICKUPS and name not in GUNACT_PICKUPS:
            raise SystemExit(f"{name}: an enemy animation with no ENEMY_TIER or LEGACY entry")
    return "sprites"


def pack(sheet, anchors, out: Path = OUT, cap: int = ATLAS_WIDTH) -> None:
    """Every atlas, packs.json, anchors.json and the loading screen's strip, all made in memory and only then written
    (packing.publish): a bake that fails leaves `out` as it was. A level's skins take as many sheets as they need
    (skins/lvN, skins/lvN-2, ...); any other atlas past `cap` stops the bake."""
    groups: dict[str, list] = {}
    for name, (frames, pivot) in sheet.items():
        groups.setdefault(atlas_of(name), []).extend((f"{name}_{i}", frame, pivot) for i, frame in enumerate(frames))
    files: dict[str, bytes] = {}
    manifest: dict = {"core": "sprites", "enemies": {}, "skins": {}, "roach": {},
                      "baked": sorted({name.split("/", 1)[0] for name in sheet if SKIN_KEY.match(name)})}
    for path, frames in groups.items():
        try:
            sheets = packing.split_sheets(frames, cap)
        except packing.TooBig as error:
            raise SystemExit(f"{path}: {error}")
        kind, _, rest = path.partition("/")
        if len(sheets) > 1 and kind != "skins":
            raise SystemExit(f"{path}: needs {len(sheets)} sheets of {cap} px; only skins may take more than one")
        for i, placed in enumerate(sheets):
            name = path if i == 0 else f"{path}-{i + 1}"
            files.update(packing.atlas_files(name, placed))
            print(f"{name}: {len(placed)} frames, {len(files[name + '.webp']) // 1024} KB")
            if kind == "skins":
                manifest["skins"].setdefault(rest.removeprefix("lv"), []).append(name)
        if kind == "enemies":
            manifest["enemies"][rest.removeprefix("lv")] = path
        elif kind == "roach":
            manifest["roach"][rest] = path
    files["packs.json"] = json.dumps(manifest, indent=1, sort_keys=True).encode()
    files["anchors.json"] = json.dumps(anchors).encode()
    strip = Image.new("RGBA", (sum(f.width for f in sheet["roach-run"][0]), sheet["roach-run"][0][0].height))
    for i, frame in enumerate(sheet["roach-run"][0]):
        strip.paste(frame, (i * frame.width, 0))
    buffer = io.BytesIO()
    strip.save(buffer, format="PNG")  # the HTML loading screen runs before the atlas exists
    files["roach-run.png"] = buffer.getvalue()
    packing.publish(out, files, owned=["skins", "enemies", "roach"])
    print(f"{sum(len(f) for f in groups.values())} frames in {len(files) // 2 - 2} atlases")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=OUT, help="where to write (default public/assets)")
    parser.add_argument("--no-skins", action="store_true", help="leave tools/art/skinrigs.py out")
    args = parser.parse_args()
    sheet, anchors = collect()
    if not args.no_skins:
        sheet.update(collect_skins(sheet))
    pack(sheet, anchors, args.out)
