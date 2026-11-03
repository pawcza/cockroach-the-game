"""Bake painted level plates and ledges: `python3 tools/art/levels.py [level ...]`, from the repo root.

Far, mid and near plates come out at the native grid (512x256, power of two, so a TileSprite needn't resample them)
and tile horizontally. The sky/mid/fg/floor folders under public/levels hold the results. To add a level, drop its
picks in art/levels/ as lvN-far.png, lvN-mid.png, lvN-fg.png and lvN-plat.png, then add a row to LEVELS.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ni

SOURCE = Path("art/levels")
OUT = Path("public/levels")

NATIVE = (512, 256)
OVERLAP = 32
# Render a little oversized so the wrap can blend real pixels: width + overlap, keeping the aspect ratio
OVERSIZED = (NATIVE[0] + OVERLAP, (NATIVE[0] + OVERLAP) // 2)

LANES_CLEAR = (30, 228)  # native rows the near layer must leave free
FADE = (30, 10)
NEAR_TINT = (6, 6, 12)

SEGMENT = 34  # native px, one floor tile
SEGMENTS = 10
LEDGE_ROWS = 19
SHADOW_ROWS = 8
SHADOW_ALPHA = 130

# hue: the colour distant things fade to. veil: how far the whole backdrop sinks into that hue, so play stays brightest.
LEVELS = {
    1: {"hue": (20, 60, 62), "veil": .35},
    2: {"hue": (44, 58, 52), "veil": .38},
    3: {"hue": (92, 52, 28), "veil": .35},
    4: {"hue": (28, 58, 40), "veil": .38},
    5: {"hue": (70, 22, 20), "veil": .30},
    6: {"hue": (50, 20, 80), "veil": .35},
    7: {"hue": (34, 58, 84), "veil": .38},
    8: {"hue": (42, 44, 54), "veil": .30},
    9: {"hue": (70, 84, 30), "veil": .42},
    10: {"hue": (104, 38, 18), "veil": .40},
}


def key_white(path: Path, threshold: int = 205, erode: int = 1) -> np.ndarray:
    """RGBA from a render on white. White touching the border goes, and so do big white holes between objects."""
    rgba = np.asarray(Image.open(path).convert("RGBA")).copy()
    rgb = rgba[..., :3].astype(int)
    white = (rgb.min(2) > threshold) & (rgb.max(2) - rgb.min(2) < 45)
    labels, count = ni.label(white)
    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    sizes = ni.sum(white, labels, range(1, count + 1))
    large = {i for i, size in enumerate(sizes, 1) if size > 400}
    gone = np.isin(labels, list(border | large))
    rgba[..., 3] = ni.binary_erosion(~gone, iterations=erode) * 255
    return rgba


def shrink(rgba: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Box filter on premultiplied colour, so keyed edges don't pick up the white they were cut from."""
    alpha = rgba[..., 3:] / 255
    premultiplied = np.dstack([rgba[..., :3] * alpha, rgba[..., 3]]).astype(np.float32)
    channels = [np.asarray(Image.fromarray(premultiplied[..., c]).resize(size, Image.BOX))
                for c in range(4)]
    out = np.dstack(channels)
    opacity = np.maximum(out[..., 3:] / 255, 1e-3)
    out[..., :3] = np.minimum(out[..., :3] / opacity, 255)
    return out


def tile(plate: np.ndarray, width: int = NATIVE[0], overlap: int = OVERLAP) -> np.ndarray:
    """Fold the plate's extra right-hand columns over its left edge, so column 0 follows the last column."""
    plate = plate[:, :width + overlap].copy()
    t = np.linspace(0, 1, overlap)[None, :, None]
    plate[:, :overlap] = plate[:, width:width + overlap] * (1 - t) + plate[:, :overlap] * t
    return plate[:, :width]


def fit_native(rgba: np.ndarray) -> np.ndarray:
    plate = shrink(rgba, OVERSIZED)
    top = (plate.shape[0] - NATIVE[1]) // 2
    return tile(plate[top:top + NATIVE[1]])


def harden(plate: np.ndarray) -> np.ndarray:
    plate = plate.copy()
    plate[..., 3] = (plate[..., 3] > 127) * 255
    return plate


def grade(plate: np.ndarray, hue, mix: float, gain: float = 1.0) -> np.ndarray:
    plate = plate.copy()
    plate[..., :3] = (plate[..., :3] * (1 - mix) + np.array(hue, np.float32) * mix) * gain
    return plate


def veil(plate: np.ndarray, hue, amount: float) -> np.ndarray:
    return grade(plate, hue, amount)


def clear_lanes(plate: np.ndarray) -> np.ndarray:
    rows = np.arange(plate.shape[0], dtype=np.float32)
    top, bottom = LANES_CLEAR
    keep = np.clip(1 - (rows - top) / FADE[0], 0, 1) + np.clip((rows - bottom) / FADE[1], 0, 1)
    plate = plate.copy()
    plate[..., 3] *= np.clip(keep, 0, 1)[:, None]
    return plate


def save(plate: np.ndarray, path: Path) -> None:
    Image.fromarray(np.clip(plate, 0, 255).round().astype(np.uint8)).save(path, lossless=True, quality=100, method=6)


def _flatten(plank: np.ndarray) -> np.ndarray:
    """Slide every column up to the plank's top edge, so both ends of the strip meet at the same height."""
    solid = plank[..., 3] > 128
    tops = np.array([np.argmax(column) if column.any() else 0 for column in solid.T])
    tops = ni.median_filter(tops, size=31)
    flat = np.zeros_like(plank)
    for x, top in enumerate(tops):
        flat[:plank.shape[0] - top, x] = plank[top:, x]
    height = int(np.median((flat[..., 3] > 128).sum(0)))
    return flat[:height]


def ledge(path: Path) -> np.ndarray:
    """A seamless strip of SEGMENTS floor tiles: plank, then the shadow it casts."""
    rgba = key_white(path, 200)
    solid = rgba[..., 3] > 128
    rows = np.nonzero(solid.mean(1) > .5)[0]
    columns = np.nonzero(solid[rows[0]:rows[-1]].mean(0) > .9)[0]
    margin = int((columns[-1] - columns[0]) * .05)
    plank = _flatten(rgba[:, columns[0] + margin:columns[-1] - margin])
    width = SEGMENT * SEGMENTS
    scale = LEDGE_ROWS / plank.shape[0]
    drawn = shrink(plank, (max(width + OVERLAP, round(plank.shape[1] * scale)), LEDGE_ROWS))
    drawn = harden(tile(drawn[:, :width + OVERLAP], width))
    shadow = np.zeros((SHADOW_ROWS, width, 4), np.float32)
    shadow[..., 3] = np.linspace(SHADOW_ALPHA, 0, SHADOW_ROWS)[:, None]
    return np.vstack([drawn, shadow])


def bake(level: int) -> None:
    hue, amount = LEVELS[level]["hue"], LEVELS[level]["veil"]
    name = f"lv{level}.webp"

    far = fit_native(np.asarray(Image.open(SOURCE / f"lv{level}-far.png").convert("RGBA")))
    far[..., 3] = 255
    save(veil(far, hue, amount), OUT / "sky" / name)

    mid = harden(fit_native(key_white(SOURCE / f"lv{level}-mid.png")))
    save(veil(grade(mid, hue, .35, .75), hue, amount), OUT / "mid" / name)

    near = harden(fit_native(key_white(SOURCE / f"lv{level}-fg.png")))
    save(clear_lanes(grade(near, NEAR_TINT, .75)), OUT / "fg" / name)

    save(ledge(SOURCE / f"lv{level}-plat.png"), OUT / "floor" / name)


if __name__ == "__main__":
    for level in [int(a) for a in sys.argv[1:]] or LEVELS:
        bake(level)
        print(f"lv{level} baked")
