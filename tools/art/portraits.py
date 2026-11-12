"""Turns the chosen boss portraits into the versus splash's game assets.

Every `art/sprites/bosses/<id>-portrait.png` (1024x1024 on white) becomes `public/boss/portraits/<id>.webp`,
and `manifest.json` beside them lists the ids, so the game only asks for files that exist.

The renders are pixel art on an 8 px grid, so the whole canvas is reduced 8:1 to 128 texels across: one pixel of the
art is one texel of the game (2 world px), nothing is resampled, and a portrait comes out 115-125 texels tall, about
half the 256-row screen. The white goes in two steps: background connected to the border or any large white pocket
(the gap between pipes), and then block by block, where a block is solid only if most of it is, and takes the median
colour of its solid pixels, so no white fringe rides along. The roach's antennae and bust run off the canvas edge,
so the crop keeps that edge: the splash anchors it to the screen edge.

Usage: python tools/art/portraits.py [--preview DIR]   (the preview composites each portrait on a dark panel, 4x)
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ni

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art/sprites/bosses"
OUT = ROOT / "public/boss/portraits"

BLOCK = 8  # source px per art pixel
TEXELS = 1024 // BLOCK  # 128
WHITE = 232  # all channels above this is background paper
POCKET = 1200  # a white region this big (source px) is a gap in the figure, not a highlight
SOLID_SHARE = 0.5


def background(rgb: np.ndarray) -> np.ndarray:
    white = rgb.min(2) > WHITE
    labels, count = ni.label(white)
    sizes = ni.sum(white, labels, range(1, count + 1))
    edge = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    gone = {i + 1 for i, size in enumerate(sizes) if size >= POCKET} | edge
    gone.discard(0)
    return np.isin(labels, list(gone))


def reduce(rgb: np.ndarray, empty: np.ndarray) -> np.ndarray:
    """One RGBA texel per 8x8 block: solid when most of the block is figure, coloured by the median of its figure."""
    # The renders are slightly soft at the edge of a block, so the figure is eroded by a pixel before it votes
    figure = ni.binary_erosion(~empty, iterations=1)
    out = np.zeros((TEXELS, TEXELS, 4), np.uint8)
    for ty in range(TEXELS):
        for tx in range(TEXELS):
            ys, xs = slice(ty * BLOCK, (ty + 1) * BLOCK), slice(tx * BLOCK, (tx + 1) * BLOCK)
            mask = figure[ys, xs]
            if mask.mean() < SOLID_SHARE:
                continue
            out[ty, tx, :3] = np.median(rgb[ys, xs][mask], axis=0)
            out[ty, tx, 3] = 255
    return out


def defringe(texels: np.ndarray) -> None:
    """Whatever near-white texel still touches the outside is paper that survived, not part of the art."""
    for _ in range(2):
        solid = texels[..., 3] > 0
        outside = ni.binary_dilation(~solid, structure=np.ones((3, 3))) & solid
        bright = texels[..., :3].min(2) > 205
        texels[outside & bright, 3] = 0


def crop(texels: np.ndarray) -> np.ndarray:
    ys, xs = np.where(texels[..., 3] > 0)
    return texels[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def portrait_id(path: Path) -> str:
    return path.stem.removesuffix("-portrait")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    ids = []
    for path in sorted(SRC.glob("*-portrait.png")):
        rgb = np.asarray(Image.open(path).convert("RGB"))
        texels = reduce(rgb, background(rgb))
        defringe(texels)
        texels = crop(texels)
        name = portrait_id(path)
        Image.fromarray(texels).save(OUT / f"{name}.webp", lossless=True, exact=True)
        ids.append(name)
        print(f"{name}: {texels.shape[1]}x{texels.shape[0]} texels")
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            panel = Image.new("RGBA", (texels.shape[1] + 16, texels.shape[0] + 16), (40, 22, 12, 255))
            panel.alpha_composite(Image.fromarray(texels), (8, 8))
            panel.resize((panel.width * 4, panel.height * 4), Image.NEAREST).save(args.preview / f"{name}.png")

    (OUT / "manifest.json").write_text(json.dumps(ids) + "\n")


if __name__ == "__main__":
    main()
