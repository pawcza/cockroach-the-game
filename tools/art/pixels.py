"""Pixel-art sources read at their own grid, and reduced to game size by whole numbers only.

The sprite renders are pixel art drawn on a coarse grid (16 render px to a painted pixel on the 768 px renders, 4 on
the 256 px ones), slightly soft at the cell edges. Read at that grid (one colour per cell, from its middle), a source
is its true native image; rigs pose that image blown up by a whole factor with nearest sampling and the result is
read back at the same factor, so a turned limb lands on the grid instead of being smeared (the bosses do the same).
Shrinking to game size is by an integer only, keeping outlines: a block takes its commonest colour unless it is on
the silhouette's edge and a dark outline covers a good part of it. No blending anywhere; alpha is all or nothing.
"""
from functools import lru_cache

import numpy as np
from PIL import Image

from rig import cut_white

# Below this luminance a colour counts as the outline
OUTLINE = 70
# Renders that were not drawn on a grid at all (a smooth render, read as it is)
NO_GRID = {"art/sprites/disco.png"}
# Where the edges also line up on a fraction of the cell (a pattern of two- and three-cell runs), the detector finds
# that fraction: the cell size as measured by eye, the phase still found from the edges
CELL = {f"art/sprites/beer-{n}.png": 19.6 for n in range(1, 7)}


def _edges(rgba: np.ndarray, axis: int) -> np.ndarray:
    """How much colour changes between neighbouring columns (axis 1) or rows (axis 0), summed over the drawing."""
    rgb = rgba[..., :3].astype(int)
    solid = rgba[..., 3] > 128
    d = np.abs(np.diff(rgb, axis=axis)).sum(-1)
    both = solid[:, 1:] & solid[:, :-1] if axis == 1 else solid[1:] & solid[:-1]
    e = np.where(both, d, 0).sum(axis=1 - axis).astype(float)
    return np.concatenate([[0.0], e])


def _phase(e: np.ndarray, p: float) -> float:
    pos = np.arange(len(e), dtype=float)
    v = (e * np.exp(2j * np.pi * pos / p)).sum()
    return (-(np.angle(v) / (2 * np.pi) * p)) % p


def _period(e: np.ndarray) -> tuple[float, float]:
    """The cell period along one axis and the position of a cell boundary, from where colour changes pile up.

    Edges at every multiple of the period P line up just as well on any divisor of P, but not on a multiple of it:
    the period is the longest one they line up on."""
    pos = np.arange(len(e), dtype=float)
    periods = np.arange(3, 40, .02)
    res = []
    for p in periods:
        v = (e * np.exp(2j * np.pi * pos / p)).sum() / e.sum()
        res.append(v)
    strength = np.abs(np.array(res))
    strong = strength >= strength.max() * .6
    i = int(np.nonzero(strong)[0].max())
    # The top of that peak
    j = i
    while j > 0 and strength[j - 1] >= strength[j]:
        j -= 1
    while j + 1 < len(periods) and strength[j + 1] > strength[j]:
        j += 1
    p = float(periods[j])
    phase = (np.angle(res[j]) / (2 * np.pi) * p) % p
    return p, (-phase) % p


@lru_cache(maxsize=None)
def grid(path: str) -> tuple[float, float, float]:
    """The painting's cell size and phase (x, y of a cell boundary) in render px. Not always a whole number: the
    renders were drawn on a grid and then resized."""
    if path in NO_GRID:
        return 1.0, 0.0, 0.0
    rgba = cut_white(path)
    if path in CELL:
        k = CELL[path]
        return k, _phase(_edges(rgba, 1), k), _phase(_edges(rgba, 0), k)
    px, ox = _period(_edges(rgba, 1))
    py, oy = _period(_edges(rgba, 0))
    k = (px + py) / 2
    return k, ox, oy


@lru_cache(maxsize=None)
def _native(path: str) -> np.ndarray:
    k, ox, oy = grid(path)
    rgba = cut_white(path)
    if k == 1:
        out = rgba.copy()
        out[..., 3] = (out[..., 3] > 128) * 255
        return out
    h, w = rgba.shape[:2]
    cols, rows = int((w - ox) // k), int((h - oy) // k)
    r = max(1, int(k / 4))
    out = np.zeros((rows, cols, 4), np.uint8)
    for j in range(rows):
        cy = int(oy + (j + .5) * k)
        for i in range(cols):
            cx = int(ox + (i + .5) * k)
            core = rgba[max(0, cy - r):cy + r + 1, max(0, cx - r):cx + r + 1].reshape(-1, 4)
            solid = core[:, 3] > 128
            if solid.mean() >= .5:
                out[j, i, :3] = np.median(core[solid][:, :3], axis=0)
                out[j, i, 3] = 255
    return out


def native(path: str) -> np.ndarray:
    """The source at its painted grid, RGBA, one array pixel per painted pixel, trimmed to what is drawn."""
    a = _native(path)
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def lattice(path: str) -> tuple[np.ndarray, int, int, int]:
    """For a rig that poses at render size: the source redrawn from its native pixels on a whole-number lattice (cell
    U render px, the first at x0, y0), so a pose can be read back crisply at the same lattice. Same size and place as
    the render, so the rig's percent coordinates still fit."""
    k, ox, oy = grid(path)
    rgba = cut_white(path)
    if k == 1:
        return _native(path), 1, 0, 0
    nat = _native(path)
    u = round(k)
    x0, y0 = int(round(ox)) % u, int(round(oy)) % u
    canvas = np.zeros_like(rgba)
    big = up(nat, u)
    h = min(big.shape[0], canvas.shape[0] - y0)
    w = min(big.shape[1], canvas.shape[1] - x0)
    canvas[y0:y0 + h, x0:x0 + w] = big[:h, :w]
    return canvas, u, x0, y0


def read(frame: np.ndarray, u: int, x0: int = 0, y0: int = 0) -> np.ndarray:
    """A pose made on a lattice, back at native size."""
    return down(frame[y0:, x0:], u)


def up(a: np.ndarray, factor: int) -> np.ndarray:
    """Blown up by a whole factor, nearest: the grid a rig poses on."""
    return a.repeat(factor, 0).repeat(factor, 1)


def down(a: np.ndarray, factor: int, keep_outline: bool = True, smooth: bool = False) -> np.ndarray:
    """Read back at a whole factor: each block becomes one pixel, its commonest colour (an outline colour where the
    block sits on the silhouette's edge and the outline covers at least a third of it); opaque when half of it is.
    `smooth` is for a render with no pixel grid of its own, where a block's commonest colour is noise: its median."""
    if factor == 1:
        out = a.copy()
        out[..., 3] = (out[..., 3] > 128) * 255
        return out
    h, w = a.shape[0] // factor, a.shape[1] // factor
    blocks = a[:h * factor, :w * factor].reshape(h, factor, w, factor, 4).transpose(0, 2, 1, 3, 4).reshape(h, w, -1, 4)
    solid_px = blocks[..., 3] > 128
    cover = solid_px.mean(-1)
    out = np.zeros((h, w, 4), np.uint8)
    opaque = cover >= .5
    # Packed colours, so a block's pixels can be counted
    packed = (blocks[..., 0].astype(np.int64) << 16) | (blocks[..., 1].astype(np.int64) << 8) | blocks[..., 2]
    lum = blocks[..., :3].astype(float) @ np.array([.299, .587, .114])
    edge = cover < 1
    if smooth:
        for y, x in zip(*np.nonzero(opaque)):
            out[y, x, :3] = np.median(blocks[y, x][solid_px[y, x]][:, :3], axis=0)
            out[y, x, 3] = 255
        return out
    for y, x in zip(*np.nonzero(opaque)):
        px = packed[y, x][solid_px[y, x]]
        values, counts = np.unique(px, return_counts=True)
        colour = values[counts.argmax()]
        if keep_outline:
            dark = solid_px[y, x] & (lum[y, x] < OUTLINE)
            if dark.sum() >= len(px) / 3 and (edge[y, x] or dark.sum() >= len(px) / 2):
                darks = packed[y, x][dark]
                dv, dc = np.unique(darks, return_counts=True)
                colour = dv[dc.argmax()]
        out[y, x] = ((colour >> 16) & 255, (colour >> 8) & 255, colour & 255, 255)
    return out


def palette_of(frames: list[np.ndarray], limit: int = 48) -> np.ndarray:
    """The commonest colours over an animation, at most `limit`: what every pixel snaps to."""
    pixels = np.concatenate([f[f[..., 3] > 0][:, :3] for f in frames])
    values, counts = np.unique(pixels, axis=0, return_counts=True)
    return values[np.argsort(-counts)[:limit]]


def snap(frame: np.ndarray, palette: np.ndarray) -> np.ndarray:
    out = frame.copy()
    solid = out[..., 3] > 0
    px = out[solid][:, :3].astype(int)
    d = ((px[:, None, :] - palette[None, :, :].astype(int)) ** 2).sum(-1)
    out[solid, :3] = palette[d.argmin(1)]
    return out


def strip_ground(a: np.ndarray) -> np.ndarray:
    """Takes away the ground line some renders stand on: the bottom rows that run nearly the full width, wider than
    what is above them. Of those rows only dark pixels with the object directly above survive (its own bottom
    outline); the pale line and its shadow go."""
    out = a.copy()
    solid = out[..., 3] > 0
    widths = solid.sum(1)
    widest = widths.max()
    rows = [y for y in range(out.shape[0]) if widths[y]]
    band = []
    for y in reversed(rows):
        if widths[y] >= widest * .9:
            band.append(y)
        else:
            break
    if band and len(band) < len(rows):
        above = min(band) - 1
        while above >= 0 and not widths[above]:
            above -= 1
        if above >= 0 and widths[above] * 1.08 <= widths[min(band)]:
            lum = out[..., :3].astype(int) @ np.array([.299, .587, .114])
            for y in sorted(band):
                keep = solid[y] & (lum[y] < 60) & solid[y - 1] if y > 0 else np.zeros_like(solid[y])
                out[y, ~keep, 3] = 0
                solid[y] = keep
    ys, xs = np.nonzero(out[..., 3])
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def at_size(path: str, factor: int, ground: bool = False) -> np.ndarray:
    """A still at game size: read at its grid, its ground line taken off if asked, shrunk by a whole factor."""
    a = native(path)
    if ground:
        a = strip_ground(a)
    a = down(a, factor)
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
