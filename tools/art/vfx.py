"""The game's visual effects, drawn as pixel art: puffs, sparks, bursts, rings, flames, rays.

Everything is drawn procedurally at native size (one texel = one world block, SPRITE_SCALE px in the game) in a few
short ramps taken from the game's own art: the floor's dust, the roach's browns, the lamps' fire, the touch buttons'
cream and teal, the pickups' reds, ambers, pinks and cyans. Light comes from the top left like everywhere else, so every
blob has a lit side and a dark side; edges are hard, nothing is anti-aliased, nothing is outlined. Animations are short
(3-8 frames) with the strongest frame first, and break up in chunky pixels instead of fading.

EFFECTS maps a name to a function returning an Effect: its frames (RGBA arrays), pivot, fps, whether it loops and
whether it is light (drawn additively). tools/art/bake_vfx.py packs them into public/assets/vfx.webp + vfx.json and
src/effects/Fx.ts plays them. The ghost and shell silhouettes are cut from the baked roach in public/assets/sprites.*,
so bake the main atlas first when the roach changes.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

LIGHT = np.array([-.55, -.83])  # towards the light on the screen: up and to the left, as in buttons.py

# Ramps, dark to light
DUST = [(62, 48, 44), (106, 86, 70), (152, 128, 102), (198, 176, 140)]        # the ledges' worn wood and grime
SMOKE = [(46, 44, 52), (82, 80, 88), (128, 124, 124), (182, 176, 166)]
FIRE = [(104, 34, 24), (190, 80, 34), (238, 156, 56), (252, 226, 118), (255, 252, 228)]  # ember to white-hot
CREAM = [(98, 84, 70), (156, 140, 112), (212, 198, 166), (242, 234, 208), (255, 252, 240)]
TEAL = [(40, 100, 112), (66, 150, 156), (110, 200, 196), (170, 234, 220), (226, 252, 240)]
RED = [(84, 12, 24), (156, 28, 36), (204, 40, 40), (244, 108, 88), (255, 200, 170)]
LEAF = [(28, 70, 36), (52, 130, 52), (110, 196, 80), (190, 236, 130)]
FLESH = [(156, 120, 84), (228, 204, 156), (252, 240, 214)]
AMBER = [(108, 40, 14), (196, 88, 20), (236, 158, 50), (252, 214, 120)]
FOAM = [(168, 154, 128), (220, 208, 178), (250, 246, 230)]
PINK = [(98, 14, 64), (172, 26, 92), (228, 38, 108), (255, 128, 178), (255, 214, 232)]
CYAN = [(12, 64, 124), (28, 126, 176), (38, 180, 204), (148, 234, 240), (226, 252, 255)]
WATER = [(22, 42, 88), (46, 92, 160), (94, 158, 218), (194, 230, 252)]
TOXIC = [(38, 66, 28), (82, 120, 38), (138, 178, 58), (204, 230, 120)]
ELEC = [(36, 54, 146), (76, 126, 228), (158, 208, 255), (240, 250, 255)]
GOLD = [(98, 62, 24), (170, 116, 40), (232, 193, 90), (255, 238, 170), (255, 252, 230)]
MAGENTA = [(84, 18, 86), (164, 38, 156), (232, 88, 206), (255, 186, 238), (255, 240, 252)]
BLUE = [(20, 38, 108), (38, 96, 196), (106, 186, 255), (196, 236, 255), (248, 254, 255)]
VIOLET = [(46, 20, 86), (94, 40, 168), (150, 92, 230), (214, 182, 255), (244, 232, 255)]
ALERT = [(70, 8, 14), (150, 18, 24), (226, 40, 36), (255, 120, 90), (255, 236, 220)]

# The families a boss's held glow, glint, burst and trail come in: src/systems/boss/bossTelegraph.ts picks the nearest
FAMILIES = {
    "cream": [(120, 96, 60), (196, 168, 110), (240, 214, 150), (255, 240, 196), (255, 252, 236)],
    "orange": [(120, 46, 16), (200, 94, 30), (246, 150, 60), (255, 200, 122), (255, 240, 212)],
    "pink": PINK,
    "violet": VIOLET,
    "green": [(38, 78, 24), (84, 138, 40), (155, 224, 74), (208, 246, 150), (244, 255, 222)],
    "grey": [(62, 60, 58), (108, 104, 98), (160, 156, 146), (204, 200, 188), (240, 238, 230)],
    "white": [(148, 144, 136), (198, 194, 184), (236, 232, 222), (250, 248, 240), (255, 255, 255)],
    "cyan": CYAN,
}
WOOD = [(40, 28, 26), (78, 56, 46), (118, 90, 68), (164, 130, 96)]
STONE = [(40, 40, 46), (72, 72, 78), (112, 110, 112), (160, 156, 150)]
INK = [(18, 12, 16), (34, 24, 28), (58, 44, 42), (96, 76, 62)]

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Effect:
    frames: list[np.ndarray]
    pivot: tuple[float, float] = (.5, .5)
    fps: int = 20
    loop: bool = False
    light: bool = False   # drawn additively: flashes, glints, rays


# ---------------------------------------------------------------------------------------------------------------- tools

def new(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), np.uint8)


def _grid(img: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w] + .5
    return xs, ys


def paint(img: np.ndarray, mask: np.ndarray, colour) -> None:
    img[mask, :3] = colour
    img[mask, 3] = 255


def put(img: np.ndarray, x: float, y: float, colour) -> None:
    xi, yi = int(math.floor(x)), int(math.floor(y))
    if 0 <= xi < img.shape[1] and 0 <= yi < img.shape[0]:
        img[yi, xi, :3] = colour
        img[yi, xi, 3] = 255


def shade_index(t: np.ndarray, n: int, bias: float = 0.) -> np.ndarray:
    """t runs from -1 (facing away from the light) to 1 (facing it): hard bands across the ramp, no dither."""
    return np.clip(np.floor((t * .5 + .5) * n + bias), 0, n - 1).astype(int)


def disc(img: np.ndarray, cx: float, cy: float, r: float, ramp, bias: float = .3, squash: float = 1.) -> None:
    """A lit ball: its top left in the light, a dark rim along its bottom right."""
    if r <= .35:
        return
    xs, ys = _grid(img)
    dx, dy = xs - cx, (ys - cy) / squash
    d = np.hypot(dx, dy)
    mask = d <= r
    if r < 1.3:
        paint(img, mask, ramp[min(len(ramp) - 1, len(ramp) - 2 + round(bias))])
        return
    t = (dx * LIGHT[0] + dy * LIGHT[1]) / r
    index = shade_index(t * .9 + .15 * (1 - d / r), len(ramp), bias)
    index = np.where((d > r - 1.1) & (t < -.35), 0, index)
    table = np.array(ramp, np.uint8)
    img[mask, :3] = table[index[mask]]
    img[mask, 3] = 255


def ellipse_ring(img, cx, cy, rx, ry, thick, front, back, broken: float = 0., seed: int = 0) -> None:
    """A ring lying on the ground: its near (lower) arc lit, its far arc dim. broken > 0 cuts it into dashes."""
    xs, ys = _grid(img)
    dx, dy = xs - cx, ys - cy
    outer = (dx / rx) ** 2 + (dy / ry) ** 2 <= 1
    irx, iry = max(rx - thick, .1), max(ry - max(1., thick * ry / rx), .1)
    inner = (dx / irx) ** 2 + (dy / iry) ** 2 <= 1 if rx > thick else np.zeros_like(outer)
    ring = outer & ~inner
    if broken > 0:
        angle = np.arctan2(dy / max(ry, .1), dx / max(rx, .1))
        ring &= np.sin(angle * (8 + seed) + seed) > (broken * 2 - 1)
    paint(img, ring & (dy < 0), back)
    paint(img, ring & (dy >= 0), front)


def circle_ring(img, cx, cy, r, thick, ramp, broken: float = 0., arcs: int = 8, turn: float = 0.) -> None:
    """A ring facing the camera, lit along its top left; broken > 0 cuts it into arcs."""
    xs, ys = _grid(img)
    dx, dy = xs - cx, ys - cy
    d = np.hypot(dx, dy)
    ring = (d <= r) & (d > r - thick)
    if broken > 0:
        angle = np.arctan2(dy, dx) + turn
        ring &= np.cos(angle * arcs) > (broken * 2 - 1)
    t = (dx * LIGHT[0] + dy * LIGHT[1]) / max(r, 1)
    index = shade_index(t, len(ramp), .6)
    table = np.array(ramp, np.uint8)
    img[ring, :3] = table[index[ring]]
    img[ring, 3] = 255


def star(img, cx, cy, r, ramp, sharp: float = .5, diagonal: bool = False, squash: float = 1.) -> None:
    """A pointed star, white-hot at its middle and darker towards the tips. sharp < 1 thins the points."""
    xs, ys = _grid(img)
    dx, dy = xs - cx, (ys - cy) / squash
    if diagonal:
        dx, dy = (dx + dy) / math.sqrt(2), (dx - dy) / math.sqrt(2)
    shape = np.abs(dx) ** sharp + np.abs(dy) ** sharp <= r ** sharp
    d = np.hypot(dx, dy) / max(r, .1)
    n = len(ramp)
    index = np.clip(n - 1 - np.floor(d * (n - .4)), 0, n - 1).astype(int)
    table = np.array(ramp, np.uint8)
    img[shape, :3] = table[index[shape]]
    img[shape, 3] = 255


def seg(img, x0, y0, x1, y1, colour, width: int = 1) -> None:
    """A hard line, Bresenham, width texels thick."""
    x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    half = (width - 1) // 2
    while True:
        for ox in range(-half, width - half):
            for oy in range(-half, width - half):
                put(img, x0 + ox, y0 + oy, colour)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def bit(img, x, y, size: int, ramp) -> None:
    """A particle: one texel, a lit 2x2, or a small ball."""
    if size <= 1:
        put(img, x, y, ramp[-1] if len(ramp) < 4 else ramp[-2])
    elif size == 2:
        put(img, x, y, ramp[-1])
        put(img, x + 1, y, ramp[-2])
        put(img, x, y + 1, ramp[-2])
        put(img, x + 1, y + 1, ramp[max(0, len(ramp) - 3)])
    else:
        disc(img, x + size / 2, y + size / 2, size / 2, ramp, .5)


def dissolve(img: np.ndarray, amount: float, seed: int = 0) -> np.ndarray:
    """Takes away a share of the texels in 2x2 bites at random (seeded, so a bake is repeatable): the chunky way to
    fade, without the mesh an ordered pattern leaves."""
    if amount <= 0:
        return img
    h, w = img.shape[:2]
    coarse = _rng(1000 + seed).rand(h // 2 + 2, w // 2 + 2)
    noise = np.kron(coarse, np.ones((2, 2)))[seed % 2:seed % 2 + h, :w]
    out = img.copy()
    out[noise < amount, 3] = 0
    out[out[..., 3] == 0] = 0
    return out


def shade_mask(mask: np.ndarray, ramp, lit: int = 1, dark: int = 1) -> np.ndarray:
    """A flat silhouette shaded by its edges: lit where the texel above (or up-left) is empty, dark where the one below is."""
    h, w = mask.shape
    img = new(w, h)
    pad = np.pad(mask, 1)
    above = pad[:-2, 1:-1]
    left = pad[1:-1, :-2]
    below = pad[2:, 1:-1]
    right = pad[1:-1, 2:]
    n = len(ramp)
    index = np.full(mask.shape, n - 2 if n > 2 else n - 1)
    if dark:
        index = np.where(~below | ~right, 0 if n < 4 else 1, index)
        index = np.where(~below, 0, index)
    if lit:
        index = np.where(~above | ~left, n - 1, index)
    table = np.array(ramp, np.uint8)
    img[mask, :3] = table[index[mask]]
    img[mask, 3] = 255
    return img


def ease_out(p: float) -> float:
    return 1 - (1 - p) ** 2


def _rng(seed: int) -> np.random.RandomState:
    return np.random.RandomState(seed)


# ------------------------------------------------------------------------------------------------------------- dust etc

def _puff(w, h, seeds, frames, ramp, grow=1., rise=0., spread=0., shrink_from=.6, seed=0) -> list[np.ndarray]:
    """Balls of dust that swell, rise, drift apart and break up. seeds are (x, y, r) at the strongest frame, drawn
    back to front, so the later ones sit on top with their lit side showing."""
    out = []
    cx = w / 2
    for f in range(frames):
        p = f / max(frames - 1, 1)
        img = new(w, h)
        for i, (x, y, r) in enumerate(seeds):
            k = (.8 + grow * ease_out(p)) * (1 - max(0., p - shrink_from) * 1.2)
            disc(img, x + (x - cx) * spread * p, y - rise * p, r * k, ramp, .7 if f == 0 else .35)
        out.append(dissolve(img, max(0., p - .62) * 1.25, seed + f))
    return out


def dust_step() -> Effect:
    return Effect(_puff(14, 11, [(9, 7.5, 2.6), (4.5, 7.5, 2.8), (7, 5.2, 3)], 5, DUST[1:], .45, 2.5, .15), (.5, 1), 16)


def dust_land() -> Effect:
    seeds = [(5, 9, 2.6), (25, 9, 2.6), (9, 7.5, 3.2), (21, 7.5, 3.2), (13, 8, 2.8), (17, 8, 2.8)]
    return Effect(_puff(30, 13, seeds, 6, DUST[1:], .5, 2.5, .3), (.5, 1), 18)


def skid() -> Effect:
    seeds = [(4, 9, 1.8), (8, 8, 2.6), (19, 8.6, 2.2), (13, 7.4, 3.2)]
    return Effect(_puff(24, 12, seeds, 5, DUST[1:], .4, 2, .25), (.75, 1), 16)


def smoke() -> Effect:
    return Effect(_puff(16, 18, [(6, 13, 3), (10, 12, 2.6), (8, 9.5, 2.6)], 6, SMOKE, .7, 5, .2), (.5, 1), 14)


def wisp() -> Effect:
    """A curl of gas: three balls along a hook that swell, rise and come apart."""
    frames = []
    for f in range(6):
        p = f / 5
        img = new(18, 16)
        for i in range(4):
            a = i / 3
            x = 4 + a * 9 + math.sin(a * 3 + p * 2) * 2
            y = 12 - a * 5 - p * 4 + math.cos(a * 4) * 1.5
            r = (1.9 + a * .9) * (.8 + .6 * ease_out(p)) * (1 - max(0., p - .6) * 1.5)
            disc(img, x, y, r, TOXIC, .4)
        frames.append(dissolve(img, max(0., p - .7) * 1.7, f))
    return Effect(frames, (.5, 1), 12)


def cloud(ramp) -> Effect:
    """A cloud of gas that hangs where it is, churning on a loop: its balls swell and shrink out of step."""
    seeds = [(7, 13, 4.2, 0), (14, 11, 5, .33), (21, 13, 4.2, .66), (11, 8, 3.6, .5), (18, 7.5, 3.4, .15)]
    frames = []
    for f in range(4):
        img = new(28, 18)
        for x, y, r, phase in seeds:
            beat = math.sin(2 * math.pi * (f / 4 + phase))
            disc(img, x + beat * .6, y - beat * .5, r * (1 + .1 * beat), ramp, .35)
        frames.append(img)
    return Effect(frames, (.5, 1), 8, loop=True)


def ring(front, back) -> Effect:
    frames = []
    for f in range(5):
        p = f / 4
        img = new(38, 11)
        rx = 4 + 14 * ease_out(p)
        ellipse_ring(img, 19, 5.5, rx, max(1.6, rx * .28), 2 if f < 2 else 1, front, back, broken=.0 if f < 3 else .35 + .3 * (f - 3))
        frames.append(img)
    return Effect(frames, (.5, .5), 20)


def streak(ramp) -> Effect:
    """A speed line: a bright head on the left and a tail that steps down the ramp, shorter each frame."""
    frames = []
    for f in range(3):
        img = new(44, 3)
        tail = [28, 18, 8][f]
        start = [0, 2, 6][f]
        for x in range(start, start + tail + 4):
            u = (x - start) / (tail + 4)
            colour = ramp[-1] if u < .12 else ramp[-2] if u < .4 else ramp[-3] if u < .7 else ramp[1]
            if u > .7 and x % 3 == 2:
                continue
            put(img, x, 1, colour)
        for x in range(start, start + 4 - f):
            put(img, x + 1, 0, ramp[-2])
            put(img, x + 1, 2, ramp[-3])
        frames.append(img)
    return Effect(frames, (0, .5), 16)


# ---------------------------------------------------------------------------------------------------------- impacts

def spark(ramp, size: int = 18) -> Effect:
    """A hit: a white-hot star, then rays thrown out that break into dashes. size is the canvas, in texels."""
    frames = []
    c = size / 2
    k = size / 18
    img = new(size, size)
    star(img, c, c, 8.5 * k, ramp, .45)
    disc(img, c, c, 2.6 * k, [ramp[-2], ramp[-1], ramp[-1]], 1)
    frames.append(img)
    img = new(size, size)
    star(img, c, c, 8.5 * k, ramp[:-1], .38)
    star(img, c, c, 5 * k, ramp, .5, diagonal=True)
    frames.append(img)
    for f, (r0, r1) in enumerate([(4, 8), (6, 9), (8, 9)]):
        img = new(size, size)
        for n in range(8):
            a = n * math.pi / 4
            col = ramp[-2 - f] if n % 2 == 0 else ramp[-3 - f // 2]
            reach = (r1 if n % 2 == 0 else r1 - 2) * k
            seg(img, c + math.cos(a) * r0 * k - .5, c + math.sin(a) * r0 * k - .5,
                c + math.cos(a) * reach - .5, c + math.sin(a) * reach - .5, col, 2 if size > 24 and f < 2 else 1)
        frames.append(dissolve(img, .25 * f, f))
    return Effect(frames, (.5, .5), 24, light=True)


def muzzle() -> Effect:
    """The pistol's flash, pointing right from the muzzle: a long star with a white core, then sparks."""
    frames = []
    img = new(20, 14)
    xs, ys = _grid(img)
    cone = (xs >= 1) & (np.abs(ys - 7) <= 1 + (xs - 1) * .42 * np.clip(1 - (xs - 1) / 17, 0, 1) * 2.2) & (xs <= 18)
    d = (xs - 1) / 17
    index = np.clip(4 - np.floor(d * 4.5) - (np.abs(ys - 7) > 2), 0, 4).astype(int)
    img[cone, :3] = np.array(FIRE, np.uint8)[index[cone]]
    img[cone, 3] = 255
    star(img, 5, 7, 6.5, FIRE, .45)
    disc(img, 4, 7, 2.6, [FIRE[-2], FIRE[-1], FIRE[-1]], 1)
    frames.append(img)
    img = new(20, 14)
    star(img, 7, 7, 7, FIRE[:-1], .38, squash=.55)
    star(img, 4, 7, 4, FIRE[1:], .5)
    disc(img, 4, 7, 1.6, FIRE[3:], 1)
    frames.append(img)
    img = new(20, 14)
    for x, y in [(10, 5), (13, 8), (8, 9), (15, 6), (11, 7)]:
        put(img, x, y, FIRE[2 + (x % 2)])
    disc(img, 5, 7, 2.2, SMOKE[1:], .4)
    frames.append(img)
    return Effect(frames, (0, .5), 30, light=False)


def poof() -> Effect:
    """Something knocked out of the world: a flash, then a ring of puffs that swell and come apart."""
    frames = []
    cx, cy = 13, 12
    img = new(26, 24)
    disc(img, cx, cy, 6.5, CREAM[2:], 1)
    star(img, cx, cy, 11, CREAM[1:], .4)
    frames.append(img)
    for f in range(1, 6):
        p = f / 5
        img = new(26, 24)
        rad = 4 + 7 * ease_out(p)
        for k in range(7):
            a = k * 2 * math.pi / 7 + .3
            r = (2.8 + (k % 2) * .7) * (1 - max(0., p - .5) * 1.6)
            disc(img, cx + math.cos(a) * rad, cy + math.sin(a) * rad * .85, r, SMOKE[1:] + [CREAM[3]], .5)
        if f == 1:
            disc(img, cx, cy, 3, CREAM[2:], 1)
        frames.append(dissolve(img, max(0., p - .6) * 1.8, f))
    return Effect(frames, (.5, .5), 20)


def _chunk_mask(points, angle) -> np.ndarray:
    img = Image.new("L", (8, 8))
    from PIL import ImageDraw
    c, s = math.cos(angle), math.sin(angle)
    ImageDraw.Draw(img).polygon([(4 + x * c - y * s, 4 + x * s + y * c) for x, y in points], fill=255)
    return np.asarray(img) > 0


def chunk(ramp, seed: int) -> Effect:
    """A tumbling bit of debris: one irregular shape turned a quarter in four steps, shaded after each turn."""
    r = _rng(seed)
    points = [(-2.2 + r.rand() * .6, -1.4), (1 + r.rand(), -1.8), (2.4, .4 + r.rand() * .6), (-.2, 1.8), (-2, .8)]
    frames = [shade_mask(_chunk_mask(points, k * math.pi / 4), ramp) for k in range(4)]
    return Effect(frames, (.5, .5), 14, loop=True)


# ---------------------------------------------------------------------------------------------------------- pickups

def twinkle(ramp) -> Effect:
    frames = []
    for arm, diag in [(0, 0), (2, 0), (4, 1), (2, 0), (1, 0)]:
        img = new(9, 9)
        for k in range(1, arm + 1):
            col = ramp[-2] if k < arm else ramp[-3]
            for x, y in [(4 + k, 4), (4 - k, 4), (4, 4 + k), (4, 4 - k)]:
                put(img, x, y, col)
        for k in range(1, diag + 1):
            for x, y in [(4 + k, 4 + k), (4 - k, 4 - k), (4 + k, 4 - k), (4 - k, 4 + k)]:
                put(img, x, y, ramp[-3])
        put(img, 4, 4, ramp[-1])
        frames.append(img)
    return Effect(frames, (.5, .5), 18, light=True)


def _bits_burst(w, h, frames, bits, flash, seed, gravity=6., reach=.45) -> list[np.ndarray]:
    """Bits thrown out from the middle. bits are (ramp, size, count); flash draws the strong first frame."""
    r = _rng(seed)
    cx, cy = w / 2, h / 2
    parts = []
    for ramp, size, count in bits:
        for _ in range(count):
            a = r.rand() * 2 * math.pi
            parts.append((ramp, size, a, (.55 + r.rand() * .45) * min(w, h) * reach))
    out = []
    for f in range(frames):
        p = f / (frames - 1)
        img = new(w, h)
        if f == 0:
            flash(img, cx, cy)
        for ramp, size, a, reach in parts:
            if f == 0:
                continue
            d = reach * ease_out(p)
            x = cx + math.cos(a) * d
            y = cy + math.sin(a) * d * .9 + gravity * p * p
            s = size if p < .6 else max(1, size - 1)
            bit(img, x - s / 2, y - s / 2, s, ramp)
        if f == 1:
            disc(img, cx, cy, 2.2, [CREAM[3], CREAM[4], CREAM[4]], 1)
        out.append(dissolve(img, max(0., p - .7) * 1.5, f))
    return out


def collect_apple() -> Effect:
    def flash(img, cx, cy):
        star(img, cx, cy, 14, RED[1:], .45)
        star(img, cx, cy, 8, RED[2:], .5, diagonal=True)
        disc(img, cx, cy, 4, [CREAM[3], CREAM[4], CREAM[4]], 1)
    return Effect(_bits_burst(34, 34, 6, [(RED, 3, 6), (RED, 2, 5), (FLESH, 2, 3), (LEAF, 3, 3)], flash, 3, reach=.36), (.5, .5), 20)


def collect_beer() -> Effect:
    r = _rng(7)
    bubbles = [(r.rand() * 16 + 6, r.rand() * 6 + 14, 1 + (r.rand() > .6)) for _ in range(7)]
    frames = []
    for f in range(6):
        p = f / 5
        img = new(28, 30)
        if f == 0:
            star(img, 14, 17, 11, AMBER[1:], .45)
            disc(img, 14, 16, 5.5, FOAM, 1)
            for x, y in [(9, 12), (19, 11), (14, 9)]:
                disc(img, x, y, 2.2, FOAM, .8)
        else:
            for k in range(5):
                a = -math.pi / 2 + (k - 2) * .55
                d = 3 + 8 * ease_out(p)
                disc(img, 14 + math.cos(a) * d, 17 + math.sin(a) * d + 6 * p * p, 2.6 * (1 - p * .7), FOAM, .6)
            for k in range(4):
                a = math.pi * (.15 + k * .23)
                d = 4 + 9 * ease_out(p)
                bit(img, 14 + math.cos(a) * d, 18 + math.sin(a) * d * .6 + 8 * p * p, 2 if p < .5 else 1, AMBER)
            for x, y, s in bubbles:
                yy = y - 16 * ease_out(p)
                if s == 2:
                    for ox, oy in [(0, -1), (1, -1), (-1, 0), (2, 0), (-1, 1), (2, 1), (0, 2), (1, 2)]:
                        put(img, x + ox, yy + oy, FOAM[2] if oy < 1 else FOAM[1])
                else:
                    put(img, x, yy, FOAM[2])
        frames.append(dissolve(img, max(0., p - .7) * 1.5, f))
    return Effect(frames, (.5, .55), 18)


def collect_pill() -> Effect:
    """The pill bursting: a pink-and-cyan flash, then its two halves tumbling apart with sparks of both colours."""
    frames = []
    r = _rng(11)
    sparks = [(r.rand() * 2 * math.pi, 7 + r.rand() * 5, (PINK, CYAN)[k % 2]) for k in range(6)]
    cx, cy = 16, 13
    for f in range(6):
        p = f / 5
        img = new(32, 26)
        if f == 0:
            star(img, cx, cy, 12, PINK[1:], .45)
            star(img, cx, cy, 8, CYAN[1:], .5, diagonal=True)
            disc(img, cx, cy, 3.4, [CREAM[3], CREAM[4], CREAM[4]], 1)
        else:
            d = 3 + 8 * ease_out(p)
            for side, ramp in ((-1, PINK), (1, CYAN)):
                spin = side * (.3 + p * 2.4)
                hx, hy = cx + side * d, cy - 3 * p + 8 * p * p
                for k in (0, 1, 2):
                    # a half: three balls along its length, the round end outermost
                    off = side * (k - 1) * 1.3
                    disc(img, hx + math.cos(spin) * off, hy + math.sin(spin) * off, 2.3, ramp[1:], .5)
            for a, reach, ramp in sparks:
                dd = reach * ease_out(p)
                bit(img, cx + math.cos(a) * dd, cy + math.sin(a) * dd, 2 if p < .5 else 1, ramp)
        frames.append(dissolve(img, max(0., p - .7) * 1.5, f))
    return Effect(frames, (.5, .5), 18)


COLLECT_SIZE = 1.2   # the owner's hand-tuned size for what a pickup bursts into (the sprite tuner)


def _grown(effect: Effect, k: float) -> Effect:
    """The same effect k times as big, each frame redrawn by whole texels (nearest), its pivot where it was."""
    frames = [np.asarray(Image.fromarray(f).resize((round(f.shape[1] * k), round(f.shape[0] * k)), Image.NEAREST)) for f in effect.frames]
    return Effect(frames, effect.pivot, effect.fps, effect.loop, effect.light)


PLATE_MIDDLE = 32   # texels of the stretching middle: wide, so the canvas renderer's half-texel overdraw stays small


def plate(rim) -> Effect:
    """The slab under a score popup, in three pieces: left cap, a uniform middle the game stretches, right cap."""
    h, cap = 12, 5
    w = cap * 2 + PLATE_MIDDLE
    full = new(w, h)
    body = np.zeros((h, w), bool)
    body[1:h - 1, :] = True
    body[0, 1:-1] = True
    body[h - 1, 1:-1] = True
    paint(full, body, INK[1])
    paint(full, np.pad(np.ones((1, w - 2), bool), ((1, h - 2), (1, 1))), INK[3])      # lit top edge
    paint(full, np.pad(np.ones((1, w - 2), bool), ((h - 2, 1), (1, 1))), INK[0])      # dark underside
    paint(full, np.pad(np.ones((h - 4, 1), bool), ((2, 2), (1, w - 2))), rim[-2])     # the rim's lit left side
    paint(full, np.pad(np.ones((h - 4, 1), bool), ((2, 2), (w - 2, 1))), rim[1])      # and its dark right side
    for x in (0, w - 1):
        full[0, x] = 0
        full[h - 1, x] = 0
    return Effect([full[:, :cap].copy(), full[:, cap:w - cap].copy(), full[:, w - cap:].copy()], (.5, .5), 1)


# -------------------------------------------------------------------------------------------------------- kill zone

# The run's one look for "this stretch of lane is about to be deadly / is deadly" (src/effects/KillZone.ts): a low
# band along the ledge's surface the game lays tile by tile over exactly the stretch that hurts, with stepped ends.
# Warning: amber hazard stripes marching along it. Killing: a hot red band of flickering teeth with a white-hot root.
ZONE_TILE = 8      # texels along the lane per tile; the band is ZONE_H tall
ZONE_H = 7
ZONE_CAP = 4       # the stepped end's width


def _zone_tile(state: str, f: int) -> np.ndarray:
    img = new(ZONE_TILE, ZONE_H)
    if state == "warn":
        # 45-degree stripes, two texels of amber and two of nothing, moving two texels a frame along the lane
        for y in range(ZONE_H - 1):
            for x in range(ZONE_TILE):
                if (x + y + f * 2) % 4 < 2:
                    img[y, x] = (*AMBER[2], 255) if y > 0 else (*AMBER[3], 255)
        img[ZONE_H - 1, :] = (*AMBER[0], 255)
    else:
        # Teeth of heat: a white-hot root, red flames of varied height licking up out of step from tile to tile
        r = _rng(17 + f)
        img[ZONE_H - 1, :] = (*ALERT[4], 255)
        img[ZONE_H - 2, :] = (*ALERT[3], 255)
        img[ZONE_H - 3, :] = (*ALERT[2], 255)
        for x in range(ZONE_TILE):
            top = ZONE_H - 3 - int(r.randint(1, ZONE_H - 2))
            for y in range(max(0, top), ZONE_H - 3):
                img[y, x] = (*(ALERT[1] if y == top else ALERT[2] if y < ZONE_H - 4 else ALERT[3]), 255)
    return img


def _zone_cap(state: str, f: int) -> np.ndarray:
    """The left end, stepping down to the ledge (the right end is it mirrored): the tile's pattern cut into stairs."""
    tile = _zone_tile(state, f)
    img = new(ZONE_CAP, ZONE_H)
    for x in range(ZONE_CAP):
        step = ZONE_H - 1 - (x + 1) * (ZONE_H - 1) // ZONE_CAP
        img[step:, x] = tile[step:, (ZONE_TILE - ZONE_CAP + x) % ZONE_TILE]
        img[ZONE_H - 1, x] = tile[ZONE_H - 1, x]
    return img


def zone(state: str, part: str) -> Effect:
    frames = [(_zone_tile if part == "tile" else _zone_cap)(state, f) for f in range(4)]
    return Effect(frames, (0., 1.), 8 if state == "warn" else 14, loop=True)


# ----------------------------------------------------------------------------------------------------- landing shadow

# The kill zone's sibling for a spot: where something will come down (src/effects/LandingShadow.ts). A flat ellipse on
# the ledge, drawn in the zone's own palette, that is a strip of LANDING_STAGES stages the game picks from by how far the
# hit has come: wide and faint dashes of amber at first, then the zone's marching amber stripes round a dark dithered
# core as it tightens and fills, and at the last stage it is hot, the zone's red with a white-hot root and flickering
# teeth. The game stretches the width of the stripe by laying a left end, a tiled middle and a right end (as the zone
# does) and sets the ring's width per stage; the height is baked. Two frames of flicker per stage. "pink" is the same
# strip for the boss's glowing last landing.
LANDING_STAGES = 8
LANDING_CAP = 8     # texels: an end, half an ellipse this wide
LANDING_TILE = 8    # texels of middle per tile; every pattern repeats every 4, so tiles and ends join
LANDING_H = 12      # the canvas: the tallest stage, its outline and the teeth over it
# Stage heights (the ellipse's rows, outline excluded): it flattens as it tightens
LANDING_ROWS = [9, 9, 9, 8, 8, 8, 8, 8]


def _shrunk(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:] &= mask[:-1]
    out[:-1] &= mask[1:]
    out[:, 1:] &= mask[:, :-1]
    out[:, :-1] &= mask[:, 1:]
    return out


def _landing_full(look: str, stage: int, f: int) -> np.ndarray:
    """One stage, one flicker frame, a stripe of end + 3 tiles + end, as wide as the ends and tiles it is cut into."""
    cap, tile = LANDING_CAP, LANDING_TILE
    w = 2 * cap + 3 * tile
    amber = AMBER if look == "warm" else PINK[:4]
    hot = ALERT if look == "warm" else PINK
    rows = LANDING_ROWS[stage]
    cy = LANDING_H - 1 - 1 - rows / 2   # the outline below it, the teeth above
    xs, ys = _grid(new(w, LANDING_H))
    u = np.where(xs < cap, (cap - xs) / cap, np.where(xs > w - cap, (xs - (w - cap)) / cap, 0.))
    half = rows / 2 * np.sqrt(1 - u ** 2)
    mask = np.abs(ys - cy) <= half
    inner = _shrunk(mask)
    ring = mask & ~inner
    core = inner
    if stage >= 4:   # the ring thickens as it heats
        core = _shrunk(inner)
        ring |= inner & ~core
    x = np.floor(xs).astype(int)
    y = np.floor(ys).astype(int)
    stripe = (x + y + f * 2) % 4 < 2
    checker = (x + y + f) % 2 == 0
    img = new(w, LANDING_H)
    # A dark outline round it, so it reads on sand as well as on the dark ledge
    outer = np.zeros_like(mask)
    outer[1:] |= mask[:-1]
    outer[:-1] |= mask[1:]
    outer[:, 1:] |= mask[:, :-1]
    outer[:, :-1] |= mask[:, 1:]
    outer &= ~mask
    if stage >= 2:
        paint(img, outer, INK[0])
    if stage < 2:       # far: dashes and a few dark specks, wide and faint
        paint(img, ring & ((x + f * 2) % 8 < (4 if stage == 0 else 6)), amber[1] if stage == 0 else amber[2])
        paint(img, core & (x % 2 == 0) & (y % 2 == f % 2), INK[0])
    elif stage < 4:     # the zone's marching stripes, dim, round a dithered core
        paint(img, ring, amber[0])
        paint(img, ring & stripe, amber[1] if stage == 2 else amber[2])
        paint(img, core & checker, INK[0])
    elif stage < 6:     # brighter and closer: a solid core
        paint(img, core, INK[0])
        paint(img, ring, amber[1])
        paint(img, ring & stripe, amber[2] if stage == 4 else amber[3])
    else:               # hot: the zone's red, a white-hot root along the near edge, flickering teeth on the far one
        root = ring & (ys > cy) & ~_shrunk(ring | core)
        last = stage == 7
        paint(img, core, hot[2] if last else hot[1])
        paint(img, core & checker, hot[1] if last else hot[0])
        paint(img, ring, hot[3] if last else hot[2])
        paint(img, ring & stripe & (not last), hot[3])
        paint(img, root | (ring & (ys > cy) & last), hot[4] if last else hot[3])
        r = _rng(31 + f * 7 + stage)
        for col in range(cap // 2, w - cap // 2):
            top = int(np.argmax(mask[:, col]))
            if r.rand() < (.5 if last else .3):
                img[top - 1, col, :3] = hot[2] if last else hot[1]
                img[top - 1, col, 3] = 255
    return img


def landing(look: str, stage: int, part: str) -> Effect:
    cap, tile = LANDING_CAP, LANDING_TILE
    frames = []
    for f in range(2):
        full = _landing_full(look, stage, f)
        w = full.shape[1]
        frames.append({"left": full[:, :cap], "tile": full[:, cap:cap + tile], "right": full[:, w - cap:]}[part].copy())
    return Effect(frames, (0., .5), 8, loop=True)


# ------------------------------------------------------------------------------------------------------------- lamp

CORD_TILE = 6  # texels: one turn of the twist, so the tiles join


def cord() -> Effect:
    """A lamp's flex, one tile of it (the game stacks it from the top of the screen down to the bulb): a dark twisted
    cord three texels wide, a lit strand winding round it."""
    img = new(3, 6)
    for y in range(6):
        img[y, :] = (*INK[1], 255)
        img[y, 2] = (*INK[0], 255)
        img[y, (y // 2) % 3] = (*STONE[2], 255)
    return Effect([img], (.5, 0.), 1)


def lamp_mount() -> Effect:
    """The fitting a lamp hangs from under the upper ledge: a small steel plate, lit along its top edge."""
    img = new(12, 4)
    img[:, :] = (*STONE[1], 255)
    img[0, 1:-1] = (*STONE[3], 255)
    img[3, :] = (*STONE[0], 255)
    img[1:3, 0] = img[1:3, -1] = (*STONE[0], 255)
    img[0, 0] = img[0, -1] = 0
    return Effect([img], (.5, 0.), 1)


# ------------------------------------------------------------------------------------------------------------ combo

def aura(ramps, w, h, tongues, seed) -> Effect:
    """Flames off the roach's back: a few broad tongues on a shared base, tallest in the middle, licking up and down on
    a loop, with embers rising. Each tongue is three shapes nested: dark outside, white-hot at its root."""
    r = _rng(seed)
    specs = []
    for i in range(tongues):
        u = (i + .5) / tongues
        specs.append((u * w, w / tongues * 1.9, h * (.42 + .58 * math.sin(u * math.pi) ** 1.5) * (.9 + r.rand() * .1),
                      r.rand(), ramps[i % len(ramps)], 1 if r.rand() > .5 else -1))
    embers = [(w * (.2 + .6 * r.rand()), r.rand(), ramps[k % len(ramps)]) for k in range(3)]
    frames = []
    F = 6
    for f in range(F):
        img = new(w, h)
        xs, ys = _grid(img)
        for layer, (scale, idx) in enumerate([(1., 1), (.66, 2), (.36, 3)]):
            for x, width, height, phase, ramp, curl in specs:
                beat = math.sin(2 * math.pi * (f / F + phase))
                hh = height * (.8 + .2 * beat) * (scale ** .5)
                v = (h - ys) / max(hh, .1)                      # 0 at the base, 1 at the tip
                lean = curl * (1 + beat) * v * v * 1.6
                half = width * .5 * scale * np.clip(1 - v, 0, 1) ** .8 * np.clip(.65 + v * 1.4, 0, 1)
                mask = (v >= 0) & (v <= 1) & (np.abs(xs - (x + lean)) <= half)
                paint(img, mask, ramp[min(idx, len(ramp) - 1)])
            # the shared root the tongues grow out of
            base = (ys > h - 2.5 - layer) & (np.abs(xs - w / 2) < w * (.42 - layer * .1))
            paint(img, base, ramps[0][min(idx, len(ramps[0]) - 1)])
        for x, phase, ramp in embers:
            v = (f / F + phase) % 1
            put(img, x + math.sin(v * 6) * 2, h * (1 - v) - 2, ramp[-2])
            if v < .5:
                put(img, x + math.sin(v * 6) * 2, h * (1 - v) - 1, ramp[2])
        frames.append(img)
    return Effect(frames, (.5, 1), 12, loop=True)


def multup() -> Effect:
    """The multiplier going up: chevrons rising out of a flash, sparkles thrown off."""
    frames = []
    for f in range(6):
        p = f / 5
        img = new(24, 30)
        if f == 0:
            star(img, 12, 20, 8, GOLD, .5)
        for k in range(3):
            y = 24 - k * 6 - 14 * ease_out(p)
            if f == 0:
                continue
            col_hi, col_lo = GOLD[-2 if k else -1], GOLD[2]
            for dx in range(5):
                put(img, 12 - dx, y + dx * .9, col_hi if dx < 4 else col_lo)
                put(img, 12 + dx, y + dx * .9, col_hi if dx < 2 else col_lo)
                put(img, 12 - dx, y + 1 + dx * .9, GOLD[1])
                put(img, 12 + dx, y + 1 + dx * .9, GOLD[1])
        if f in (1, 2, 3):
            for x, y in [(3, 18 - f * 3), (20, 15 - f * 3), (6, 8 - f), (18, 24 - f * 2)]:
                put(img, x, y, GOLD[-1])
        frames.append(dissolve(img, max(0., p - .65) * 1.6, f))
    return Effect(frames, (.5, .8), 18)


def crack() -> Effect:
    """The combo breaking: a jagged crack flashes across, splits into pieces, and they drop out."""
    r = _rng(5)
    xs = list(range(2, 75, 5))
    ys = [8 + (r.rand() - .5) * 6 for _ in xs]
    branches = [(i, -1 if r.rand() > .5 else 1) for i in range(1, len(xs) - 1, 2)]
    frames = []
    for f in range(6):
        img = new(78, 18)
        for i in range(len(xs) - 1):
            piece = i // 2
            fall = 0 if f < 2 else (f - 1) ** 2 * (.6 + .25 * (piece % 3))
            drift = 0 if f < 2 else (piece - 3.5) * (f - 1) * .6
            col = RED[-1] if f == 0 else RED[-2] if f == 1 else RED[2]
            if f >= 2 and i % 2 == 1 and f > 3:
                continue
            seg(img, xs[i] + drift, ys[i] + fall, xs[i + 1] + drift, ys[i + 1] + fall, col, 2 if f == 0 else 1)
            if f <= 1:
                seg(img, xs[i], ys[i] + 1, xs[i + 1], ys[i + 1] + 1, RED[0])
        if f <= 2:
            for i, side in branches:
                seg(img, xs[i], ys[i], xs[i] + 2, ys[i] + side * 4, RED[1] if f else RED[3])
        frames.append(dissolve(img, max(0, f - 3) * .3, f))
    return Effect(frames, (.5, .5), 16)


# ---------------------------------------------------------------------------------------------------------- ability

def glint(ramp, reach: int = 6) -> Effect:
    """A glint: a cross that flares into an eight-point star and shrinks back to a point. reach: its arms at full
    flare, in texels; the bigger ones get a two-texel core."""
    frames = []
    c = reach
    k = reach / 6
    for arm, diag in [(2, 0), (5, 1), (6, 3), (3, 2), (1, 0)]:
        arm, diag = max(1, round(arm * k)), round(diag * k)
        img = new(reach * 2 + 1, reach * 2 + 1)
        for n in range(1, arm + 1):
            col = ramp[-1] if n <= max(1, arm // 3) else ramp[-2] if n < arm * .75 else ramp[-3]
            for x, y in [(c + n, c), (c - n, c), (c, c + n), (c, c - n)]:
                put(img, x, y, col)
            if reach > 8 and n <= arm // 2:
                for x, y in [(c + n, c + 1), (c - n, c - 1), (c + 1, c - n), (c - 1, c + n)]:
                    put(img, x, y, ramp[-2])
        for n in range(1, diag + 1):
            col = ramp[-2] if n == 1 else ramp[-3]
            for x, y in [(c + n, c + n), (c - n, c - n), (c + n, c - n), (c - n, c + n)]:
                put(img, x, y, col)
        put(img, c, c, ramp[-1])
        frames.append(img)
    return Effect(frames, (.5, .5), 18, light=True)


def glow(ramp) -> Effect:
    """A held thing's glow as stepped bands, one frame per size (radius 4 to 26 texels): the game picks the size."""
    frames = []
    for r in range(4, 28, 2):
        img = new(54, 54)
        xs, ys = _grid(img)
        d = np.hypot(xs - 27, ys - 27)
        for i, rr in enumerate([r, r * .7, r * .4]):
            paint(img, d <= rr, ramp[1 + i])
        frames.append(img)
    return Effect(frames, (.5, .5), 1, light=True)


def bits(ramp) -> Effect:
    """A thrown bit of light: a lit 2x2, then one texel, then gone."""
    frames = [new(2, 2), new(2, 2), new(2, 2)]
    bit(frames[0], 0, 0, 2, ramp)
    put(frames[1], 0, 0, ramp[-1])
    put(frames[1], 1, 0, ramp[-2])
    put(frames[2], 0, 0, ramp[-2])
    return Effect(frames, (.5, .5), 10)


def trail(ramp) -> Effect:
    """A flying thing's trail, one frame per block size (7 texels down to 1): lit top left, dark underneath."""
    frames = []
    for size in range(7, 0, -1):
        mask = np.ones((size, size), bool)
        if size >= 4:
            for y, x in [(0, 0), (0, size - 1), (size - 1, 0), (size - 1, size - 1)]:
                mask[y, x] = False
        img = shade_mask(mask, ramp[1:]) if size > 1 else new(1, 1)
        if size == 1:
            put(img, 0, 0, ramp[-2])
        canvas = new(7, 7)
        o = (7 - size) // 2
        canvas[o:o + size, o:o + size] = img
        frames.append(canvas)
    return Effect(frames, (.5, .5), 1)


def alert() -> Effect:
    """The chaser's warning at the screen's left edge: a chunky red "!" lit on its left, with a white-hot second frame
    for its blink. A shadow on its right and under it keeps it readable on every level."""
    rows = [
        ".####.",
        "######",
        "######",
        "######",
        ".####.",
        ".####.",
        ".####.",
        "..##..",
        "..##..",
        "......",
        "..##..",
        ".####.",
        "..##..",
    ]
    # Drawn at half size, doubled, and shaded after: chunky, with one-texel light and dark edges
    mask = np.kron(np.array([[ch == "#" for ch in row] for row in rows]), np.ones((2, 2), bool))
    h, w = mask.shape
    frames = []
    for ramp in (ALERT[:4], [ALERT[2], ALERT[4], (255, 255, 255)]):
        img = new(w + 1, h + 1)
        shadow = np.zeros((h + 1, w + 1), bool)
        shadow[1:, 1:] = mask
        paint(img, shadow, (20, 6, 10))   # the drop shadow, down and right
        body = shade_mask(mask, ramp)
        solid = body[..., 3] > 0
        img[:h, :w][solid] = body[solid]
        frames.append(img)
    return Effect(frames, (.5, .5), 1)


SPRAY_REACH = 28   # texels of cloud that hurt: TIMINGS.spray.reach (56 px) in src/objects/obstacles/cast.ts
SPRAY_BILLOW = 3   # and how far it billows past them either side, looks only


def spray_cloud() -> tuple[Effect, Effect]:
    """The spray's cloud: a churning loop that fills exactly the stretch that hurts, from its first frame, and the
    three frames it thins out in. Its pivot is the right end of the hurting stretch (the can's front edge) on the
    ledge, so the game places it there."""
    w, h = SPRAY_REACH + SPRAY_BILLOW * 2, 34
    ramp = [(36, 74, 22), (92, 156, 38), (158, 222, 70), (212, 250, 128), (244, 255, 200)]
    # Few, big, overlapping balls: one bright mass with its dark side only along its base, not a bunch of grapes
    seeds = [(12.5, 6.5, 5.5, .8), (8, 13, 7.5, .5), (17.5, 12.5, 7.5, .15), (5.5, 23, 7.5, 0), (13, 22, 8.5, .33), (20.5, 23, 7.5, .66)]
    # Laid out for a 26-texel cloud: spread along the reach it has
    stretch = w / 26
    seeds = [(x * stretch, y, r * (1 + (stretch - 1) * .35), phase) for x, y, r, phase in seeds]
    loop, out = [], []
    for f in range(4):
        img = new(w, h)
        for x, y, r, phase in seeds:
            beat = math.sin(2 * math.pi * (f / 4 + phase))
            disc(img, x + beat * .5, y - beat * .5, r * (1 + .06 * beat), ramp, .35)
        loop.append(img)
    for f in range(3):
        img = new(w, h)
        for x, y, r, _ in seeds:
            disc(img, x, y - 2 - f * 2, r * (1.05 - f * .12), ramp[1:], .3)
        out.append(dissolve(img, .25 + f * .25, f))
    pivot = ((SPRAY_BILLOW + SPRAY_REACH) / w, 1.)
    return Effect(loop, pivot, 10, loop=True), Effect(out, pivot, 12)



def shield() -> Effect:
    frames = []
    for f in range(5):
        p = f / 4
        img = new(46, 46)
        r = 9 + 13 * ease_out(p)
        circle_ring(img, 23, 23, r, 3 if f == 0 else 2 if f < 3 else 1, CREAM[1:], broken=0 if f < 2 else .3 + .12 * f,
                    arcs=8, turn=p * .6)
        if f == 0:
            disc(img, 23, 23, 5, CREAM[3:], 1)
        frames.append(img)
    return Effect(frames, (.5, .5), 20, light=True)


def rays(ramp) -> Effect:
    """Sixteen rays turning behind the new power's icon: one sixteenth of a turn over the loop, each step drawn."""
    R = 96
    size = R * 2
    frames = []
    for f in range(6):
        img = new(size, size)
        xs, ys = _grid(img)
        dx, dy = xs - R, ys - R
        d = np.hypot(dx, dy)
        a = np.arctan2(dy, dx) + f * (2 * math.pi / 16) / 6
        period = 2 * math.pi / 16
        u = np.abs(((a + period / 2) % period) - period / 2)         # angle off the nearest ray's middle
        long = (np.floor((a + period / 2) / period) % 2) == 0
        reach = np.where(long, R, R * .78)
        width = .055 + 0 * d
        mask = (u < width + 1.2 / np.maximum(d, 1)) & (d > 10) & (d < reach)
        band = np.clip(np.floor(d / reach * 4), 0, 3).astype(int)
        index = np.clip(len(ramp) - 1 - band, 0, len(ramp) - 1)
        table = np.array(ramp, np.uint8)
        img[mask, :3] = table[index[mask]]
        img[mask, 3] = 255
        frames.append(img)
    return Effect(frames, (.5, .5), 12, loop=True, light=True)


def halo(ramp) -> Effect:
    """The glow behind the icon as stepped bands, breathing by one texel."""
    frames = []
    for f in range(2):
        img = new(100, 100)
        for i, r in enumerate([48, 40, 32]):
            xs, ys = _grid(img)
            mask = np.hypot(xs - 50, ys - 50) <= r + f
            paint(img, mask, ramp[i])
        frames.append(img)
    return Effect(frames, (.5, .5), 4, loop=True, light=True)


def _roach_frames() -> tuple[np.ndarray, dict]:
    atlas = np.asarray(Image.open(ROOT / "public/assets/sprites.webp").convert("RGBA"))
    meta = json.loads((ROOT / "public/assets/sprites.json").read_text())["frames"]
    return atlas, meta


def _cut(atlas, meta, name) -> tuple[np.ndarray, tuple[float, float]]:
    f = meta[name]["frame"]
    return atlas[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]], (meta[name]["pivot"]["x"], meta[name]["pivot"]["y"])


GHOSTS = {"run": 8, "dash": 4, "hop": 5}


def ghost(ramp, anim: str, scan: bool = True) -> Effect:
    """The roach's own silhouette in one colour, a frame for each of its frames, for afterimages and flashes: lit along
    its top, dark underneath, every third row left out so it reads as a smear."""
    atlas, meta = _roach_frames()
    frames, pivot = [], (.5, .5)
    for i in range(GHOSTS[anim]):
        cell, pivot = _cut(atlas, meta, f"roach-{anim}_{i}")
        mask = cell[..., 3] > 128
        img = shade_mask(mask, ramp)
        if scan:
            img[2::3] = 0
        frames.append(img)
    return Effect(frames, pivot, 1)


def shell() -> Effect:
    """The wylinka's shed skin: the roach's run frame in pale cream, its own shading kept, turned an eighth a frame."""
    atlas, meta = _roach_frames()
    cell, _ = _cut(atlas, meta, "roach-run_0")
    solid = cell[..., 3] > 128
    ys, xs = np.nonzero(solid)
    cell = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    lum = cell[..., :3].astype(float) @ np.array([.3, .59, .11])
    size = int(math.ceil(math.hypot(*cell.shape[:2]))) + 2
    frames = []
    for k in range(8):
        im = Image.fromarray(cell).rotate(-k * 45, resample=Image.NEAREST, expand=True)
        rotated = np.asarray(im)
        lum_r = np.asarray(Image.fromarray(lum.astype(np.uint8)).rotate(-k * 45, resample=Image.NEAREST, expand=True)).astype(float)
        mask = rotated[..., 3] > 128
        lo, hi = np.percentile(lum[cell[..., 3] > 128], [10, 90])
        level = np.clip((lum_r - lo) / max(hi - lo, 1), 0, 1)
        index = np.clip(np.floor(level * 3.2) + 1, 1, 4).astype(int)
        # its own top edge lit, its underside dark, whatever way up it is
        edges = shade_mask(mask, [CREAM[0], CREAM[1], CREAM[2], CREAM[4]])
        table = np.array(CREAM, np.uint8)
        img = np.zeros(rotated.shape, np.uint8)
        img[mask, :3] = table[index[mask]]
        img[mask, 3] = 255
        pad = np.pad(mask, 1)
        img[mask & ~pad[2:, 1:-1]] = edges[mask & ~pad[2:, 1:-1]]
        canvas = new(size, size)
        oy, ox = (size - img.shape[0]) // 2, (size - img.shape[1]) // 2
        canvas[oy:oy + img.shape[0], ox:ox + img.shape[1]] = img
        frames.append(canvas)
    return Effect(frames, (.5, .5), 16, loop=True)


# ------------------------------------------------------------------------------------------------------------ liquid

def splash(ramp) -> Effect:
    """A drop hitting: a crown thrown up, drops flying out and falling back, a ripple left."""
    frames = []
    drops = [(-7, -9, 2), (-3, -12, 1), (2, -13, 2), (6, -10, 1), (9, -7, 1)]
    for f in range(6):
        p = f / 5
        img = new(24, 18)
        cx, base = 12, 15
        if f == 0:
            disc(img, cx, base - 1, 4, ramp, .8, squash=.5)
        elif f <= 2:
            for side in (-1, 1):
                for k in range(4):
                    put(img, cx + side * (3 + k * .6 + f), base - k * (1.5 + f * .6), ramp[-1 if k < 2 else -2])
                    put(img, cx + side * (4 + k * .6 + f), base - k * (1.5 + f * .6), ramp[1])
            disc(img, cx, base, 3, ramp, .5, squash=.4)
        if f >= 1:
            for dx, dy, s in drops:
                t = p
                x = cx + dx * t * 1.1
                y = base + dy * 2.2 * t + 22 * t * t * .6
                if y < base:
                    bit(img, x, y, s if f < 4 else 1, ramp)
        if f >= 3:
            ellipse_ring(img, cx, base, 4 + f * 1.4, 1.6, 1, ramp[-2], ramp[1], broken=.2 * (f - 3))
        frames.append(img)
    return Effect(frames, (.5, .9), 18)


def drip() -> Effect:
    frames = []
    for f, (r, y, stretch) in enumerate([(1, 1.5, 1), (1.5, 2, 1.2), (1.8, 3, 1.6), (1.4, 6, 1.3), (1.3, 10, 1.4), (0, 0, 0)]):
        img = new(6, 15)
        if f < 5:
            disc(img, 3, y, r, WATER, .6, squash=stretch)
            if f == 2:
                put(img, 3, 0, WATER[2])
                put(img, 3, 1, WATER[2])
        else:
            for x, yy in [(1, 13), (4, 13), (2, 12), (5, 14), (0, 14)]:
                put(img, x, yy, WATER[2 if x % 2 else 3])
        frames.append(img)
    return Effect(frames, (.5, 0), 12)


def ripple() -> Effect:
    frames = []
    for f in range(5):
        p = f / 4
        img = new(30, 9)
        ellipse_ring(img, 15, 4.5, 3 + 11 * ease_out(p), 1.4 + 2.2 * p, 1, WATER[-1], WATER[1], broken=max(0, p - .5))
        if f >= 1:
            ellipse_ring(img, 15, 4.5, 2 + 7 * ease_out(max(0, p - .25)), 1 + 1.4 * p, 1, WATER[2], WATER[0])
        frames.append(img)
    return Effect(frames, (.5, .5), 12)


# -------------------------------------------------------------------------------------------------------- electric

def crackle() -> Effect:
    r = _rng(9)
    frames = []
    for f in range(4):
        img = new(18, 18)
        for k in range(3):
            a = r.rand() * 2 * math.pi
            x, y = 9., 9.
            pts = [(x, y)]
            for _ in range(3):
                a += (r.rand() - .5) * 1.6
                x += math.cos(a) * 2.6
                y += math.sin(a) * 2.6
                pts.append((x, y))
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                seg(img, x0 + 1, y0, x1 + 1, y1, ELEC[1])
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                seg(img, x0, y0, x1, y1, ELEC[-1] if f < 2 else ELEC[2])
        put(img, 9, 9, ELEC[-1])
        frames.append(img)
    return Effect(frames, (.5, .5), 20, loop=True, light=True)


def bolt() -> Effect:
    r = _rng(4)
    xs = [7]
    for _ in range(7):
        xs.append(int(np.clip(xs[-1] + r.randint(-3, 4), 2, 11)))
    frames = []
    for f in range(4):
        img = new(14, 32)
        for i in range(len(xs) - 1):
            if f == 2 and i % 2:
                continue
            if f == 3 and i % 3:
                continue
            y0, y1 = i * 4.4, (i + 1) * 4.4
            seg(img, xs[i] + 1, y0, xs[i + 1] + 1, y1, ELEC[1])
            seg(img, xs[i], y0, xs[i + 1], y1, ELEC[-1] if f == 0 else ELEC[2], 2 if f == 0 else 1)
        if f < 2:
            seg(img, xs[3], 13, xs[3] + 4, 18, ELEC[2])
            for x in (5, 7, 9):
                put(img, x, 31, ELEC[-1])
        frames.append(img)
    return Effect(frames, (.5, 1), 20, light=True)


# ---------------------------------------------------------------------------------------------------------------- UI

def press() -> Effect:
    frames = []
    for f in range(4):
        img = new(20, 20)
        d = 4 + f * 2.2
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            x, y = 10 + math.cos(a) * d, 10 + math.sin(a) * d
            arm = [1, 2, 1, 0][f]
            put(img, x, y, CREAM[-1])
            for j in range(1, arm + 1):
                for ox, oy in [(j, 0), (-j, 0), (0, j), (0, -j)]:
                    put(img, x + ox, y + oy, CREAM[3 - (j > 1)])
        frames.append(img)
    return Effect(frames, (.5, .5), 20, light=True)


def shine(h: int) -> Effect:
    """The sweep across a slab: a slanted band h texels tall, bright in its middle, one frame moved by the game."""
    img = new(h // 2 + 6, h)
    for y in range(h):
        x0 = h // 2 + 5 - y // 2
        for k in range(6):
            put(img, x0 - k, y, CREAM[4] if 1 <= k <= 2 else CREAM[2])
    return Effect([img], (.5, .5), 1, light=True)


def milestone(ramps, size, seed) -> Effect:
    """A score milestone: a flash star, a ring, rays thrown out that break up, sparkles left twinkling."""
    r = _rng(seed)
    c = size / 2
    rays_n = 12
    sparkles = [(r.rand() * 2 * math.pi, .55 + r.rand() * .4) for _ in range(10)]
    frames = []
    hot, main = ramps
    for f in range(7):
        p = f / 6
        img = new(size, size)
        if f == 0:
            star(img, c, c, c * .9, hot, .42)
            star(img, c, c, c * .5, hot, .5, diagonal=True)
        else:
            if f <= 4:
                circle_ring(img, c, c, c * (.35 + .55 * ease_out(p)), 3 if f < 2 else 2, main, broken=0 if f < 2 else .2 + .12 * f, arcs=10)
            r0 = c * (.2 + .55 * ease_out(p))
            r1 = min(c - 1, r0 + c * (.45 - .3 * p))
            for k in range(rays_n):
                a = k * 2 * math.pi / rays_n + (math.pi / rays_n if k % 2 else 0) * 0
                if f >= 4 and k % 2:
                    continue
                col = hot[-2] if k % 2 == 0 else main[-2]
                seg(img, c + math.cos(a) * r0, c + math.sin(a) * r0, c + math.cos(a) * r1, c + math.sin(a) * r1, col,
                    2 if f < 4 and k % 2 == 0 else 1)
            for a, rr in sparkles:
                if (f + int(a * 3)) % 3 == 0:
                    continue
                d = c * rr * (.6 + .4 * ease_out(p))
                x, y = c + math.cos(a) * d, c + math.sin(a) * d
                put(img, x, y, hot[-1])
                if f < 5:
                    for ox, oy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                        put(img, x + ox, y + oy, main[-2])
            if f == 1:
                disc(img, c, c, c * .22, hot[-3:], 1)
        frames.append(dissolve(img, max(0., p - .75) * 1.4, f))
    return Effect(frames, (.5, .5), 16, light=True)


def confetti(ramp) -> Effect:
    """A scrap of confetti fluttering: flat, edge-on, turned, flat again."""
    shapes = [["##", "##", "#."], ["###"], [".#", "##", "#."], ["#", "#", "#"]]
    frames = []
    for rows in shapes:
        img = new(4, 4)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == "#":
                    put(img, x, y, ramp[-1] if y == 0 else ramp[-2] if len(rows) > 1 else ramp[-1])
        frames.append(img)
    return Effect(frames, (.5, .5), 10, loop=True)


# --------------------------------------------------------------------------------------------------- combo exhaust

# The combo's flames are the roach's exhaust, not a bonfire on its back: rooted under its rear and streaming backwards
# (the run goes right, so to the left) in a tapering trail whose ripples travel along it, longer and hotter each tier:
# fire, then fire round a white-blue core, then a blue-white comet. From the second tier horizontal speed lines stream
# past the body, on the third a faint shock cone bows ahead of the head. The embers that break off and stay behind in
# the world are thrown at runtime (src/effects/VisualEffects.ts) from combo-ember-*. Layers: outer, mid, core, hot root.
EXHAUST_FIRE = [FIRE[1], FIRE[2], FIRE[3], FIRE[4]]
EXHAUST_HOT = [FIRE[1], FIRE[2], FIRE[4], BLUE[3]]
EXHAUST_COMET = [BLUE[1], BLUE[2], BLUE[3], BLUE[4]]


def exhaust(layers, length: int, thick: int, seed: int, fringe=None) -> Effect:
    """A flame trail lying along the run, its root at the right edge (the pivot), its tail breaking into blobs at the
    left. Its edges ripple and the ripples travel tailwards a few texels a frame; the white-hot part stays near the root.
    `fringe`, if given, is a colour for sparks flicked off its edges (the comet's)."""
    r = _rng(seed)
    F = 8
    tail_room = 14                      # past the tail: the wisps that come off it
    w, h = length + tail_room, thick + 6
    yc = h / 2 + .5
    wisps = [(r.rand(), (r.rand() - .5) * thick * .5, r.rand() * .5 + .5) for _ in range(5)]
    sparks = [(r.rand(), 1 if r.rand() > .5 else -1, r.rand()) for _ in range(6)]
    frames = []
    for f in range(F):
        img = new(w, h)
        xs, ys = _grid(img)
        u = (w - xs) / length                                   # 0 at the root, 1 at the tail
        flick = 1 + .07 * math.sin(2 * math.pi * f / F * 2)     # the whole trail breathes in length
        # Full at the root (tucked behind the abdomen), tapering to the tail
        half = thick / 2 * (.75 + .25 * np.clip(u * 5, 0, 1)) * np.clip(1 - u / flick, 0, 1) ** .9
        # Tongues on each edge, swept back like a flame in a headwind and running tailwards: the same crest is 1/F of a
        # wave further left each frame. A saw, not a sine: each tongue rises slowly from the front and drops off behind
        phase = f / F
        amp = 1. + 2.2 * u
        saw_top = ((xs / 8 + phase) % 1)
        saw_bot = ((xs / 10.5 + phase + .4) % 1)
        top = half + amp * (saw_top ** 1.6 - .35) + .6 * np.sin(2 * math.pi * (xs / 3.7 + 2 * phase))
        bottom = half * .85 + amp * .7 * (saw_bot ** 1.6 - .35)
        dy = ys - yc
        edge = np.where(dy < 0, top, bottom)
        d = np.abs(dy) / np.maximum(edge, .1)
        inside = (u >= 0) & (u <= 1.02) & (d <= 1) & (half > .2)
        # The far end breaks up into blobs that travel with the ripples
        blobs = np.sin(2 * math.pi * (xs / 7 + phase)) + .6 * np.sin(2 * math.pi * (xs / 3.1 + 2 * phase))
        inside &= ~((u > .62) & (blobs < (u - .62) * 4.2 - 1))
        # Layers: the hot root only near the nozzle, the core into the first half, the mid most of the way
        level = np.zeros_like(u, dtype=int)
        level = np.where((d < .78) & (u < .9), 1, level)
        level = np.where((d < .5) & (u < .58), 2, level)
        level = np.where((d < .3) & (u < .22), 3, level)
        # Lit from above: the top half's outer layer a step brighter where it is thick enough to show it
        level = np.where((level == 0) & (dy < -1) & (half > 2.5), 1, level)
        table = np.array(layers, np.uint8)
        img[inside, :3] = table[level[inside]]
        img[inside, 3] = 255
        # Wisps leaving the tail
        for p0, oy, size in wisps:
            p = (p0 + f / F) % 1
            x = w - length - 1 - p * (tail_room - 2)
            if p < .7:
                put(img, x, yc + oy, layers[1] if p < .35 else layers[0])
                if size > .75 and p < .35:
                    put(img, x - 1, yc + oy, layers[0])
        if fringe is not None:
            for p0, side, k in sparks:
                p = (p0 + f / F) % 1
                x = w - 6 - p * length * .8
                uu = (w - x) / length
                y = yc + side * (thick / 2 * (1 - uu) + 1.5 + k)
                if p < .8:
                    put(img, x, y, fringe)
        frames.append(img)
    return Effect(frames, (1., yc / h), 16, loop=True)


def combo_lines(count: int, seed: int) -> Effect:
    """Speed lines streaming back past the roach's body, horizontal, light: thin streaks at a few heights, each moving
    tailwards fast and wrapping round. Laid behind the roach, so they show round its body; the right edge (the pivot)
    is its head, so nothing reaches ahead of it."""
    r = _rng(seed)
    F = 6
    w, h = 100, 44
    lines = []
    for i in range(count):
        y = int(3 + (h - 6) * (i + .5) / count + (r.rand() - .5) * 3)
        lines.append((y, r.rand(), int(14 + r.rand() * 18), 1 + r.rand() * .6))
    frames = []
    for f in range(F):
        img = new(w, h)
        for y, phase, length, speed in lines:
            head = w - ((phase + speed * f / F) % 1) * (w + length)
            for x in range(int(head), int(head + length)):
                if 0 <= x < w:
                    u = (x - head) / length               # 0 at the streak's front-most texel on the left
                    colour = BLUE[3] if u < .12 else BLUE[2] if u < .45 else BLUE[1]
                    put(img, x, y, colour)
        frames.append(img)
    return Effect(frames, (1., .5), 20, loop=True, light=True)


def combo_cone() -> Effect:
    """A faint shock cone bowing ahead of the head on the third tier: a curved line of light, flickering."""
    F = 4
    w, h = 9, 22
    frames = []
    for f in range(F):
        img = new(w, h)
        for y in range(h):
            v = (y - h / 2 + .5) / (h / 2)
            x = 7.5 - 6 * v * v                                # the bow's nose at the right, its arms swept back
            if abs(v) > .95 or (f % 2 and abs(v) > .75):
                continue
            put(img, x, y, BLUE[1] if abs(v) > .55 else BLUE[2])
            if abs(v) < .3 and f != 3:
                put(img, x, y, BLUE[3])
        frames.append(img)
    return Effect(frames, (1., .5), 12, loop=True, light=True)


def combo_ember(ramp) -> Effect:
    """An ember broken off the exhaust, left behind: a hot speck that cools and shrinks."""
    frames = []
    for size, colour in [(3, ramp[-1]), (2, ramp[-2]), (2, ramp[-3]), (1, ramp[-3]), (1, ramp[1])]:
        img = new(3, 3)
        o = (3 - size) // 2
        for y in range(size):
            for x in range(size):
                if size == 3 and (x, y) in [(0, 0), (2, 0), (0, 2), (2, 2)]:
                    continue
                put(img, o + x, o + y, colour)
        frames.append(img)
    return Effect(frames, (.5, .5), 10)


EFFECTS = {
    "dust": dust_step,
    "dust-land": dust_land,
    "skid": skid,
    "smoke": smoke,
    "wisp": wisp,
    "cloud-toxic": lambda: cloud(TOXIC),
    "ring": lambda: ring(CREAM[3], CREAM[1]),
    "ring-teal": lambda: ring(TEAL[3], TEAL[1]),
    "ring-pink": lambda: ring(PINK[3], PINK[1]),
    "streak-teal": lambda: streak(TEAL),
    "streak-pink": lambda: streak(PINK),
    "streak-cyan": lambda: streak(CYAN),
    "spark": lambda: spark(FIRE),
    "spark-big": lambda: spark(FIRE, 30),
    "spark-blue": lambda: spark(ELEC + [(255, 255, 255)]),
    "muzzle": muzzle,
    "poof": poof,
    "chunk-wood": lambda: chunk(WOOD, 1),
    "chunk-stone": lambda: chunk(STONE, 2),
    "chunk-shell": lambda: chunk(CREAM[1:], 3),
    "twinkle": lambda: twinkle(GOLD),
    "twinkle-teal": lambda: twinkle(TEAL),
    "twinkle-pink": lambda: twinkle(PINK),
    "twinkle-violet": lambda: twinkle(VIOLET),
    "collect-apple": lambda: _grown(collect_apple(), COLLECT_SIZE),
    "collect-beer": lambda: _grown(collect_beer(), COLLECT_SIZE),
    "collect-pill": lambda: _grown(collect_pill(), COLLECT_SIZE),
    "cord": cord,
    "lamp-mount": lamp_mount,
    "zone-warn": lambda: zone("warn", "tile"),
    "zone-warn-end": lambda: zone("warn", "cap"),
    "zone-kill": lambda: zone("kill", "tile"),
    "zone-kill-end": lambda: zone("kill", "cap"),
    **{f"land-{look}-{stage}{suffix}": (lambda look=look, stage=stage, part=part: landing(look, stage, part))
       for look in ("warm", "pink") for stage in range(LANDING_STAGES)
       for suffix, part in (("-l", "left"), ("", "tile"), ("-r", "right"))},
    "plate": lambda: plate(GOLD),
    "plate-red": lambda: plate(RED),
    "aura-1": lambda: exhaust(EXHAUST_FIRE, 58, 16, 1),
    "aura-2": lambda: exhaust(EXHAUST_HOT, 80, 18, 2),
    "aura-3": lambda: exhaust(EXHAUST_COMET, 112, 21, 3, fringe=FIRE[3]),
    "combo-lines-2": lambda: combo_lines(6, 5),
    "combo-lines-3": lambda: combo_lines(10, 6),
    "combo-cone": combo_cone,
    "combo-ember-1": lambda: combo_ember(FIRE),
    "combo-ember-2": lambda: combo_ember(EXHAUST_HOT + [BLUE[4]]),
    "combo-ember-3": lambda: combo_ember(BLUE),
    "aura-pill": lambda: aura([PINK, CYAN], 52, 30, 6, 4),
    "multup": multup,
    "crack": crack,
    "glint": lambda: glint(TEAL),
    "glint-gold": lambda: glint(GOLD),
    "glint-white": lambda: glint(FAMILIES["white"]),
    "glint-pink": lambda: glint(PINK),
    "glint-green": lambda: glint(FAMILIES["green"]),
    "alert": alert,
    "spray-cloud": lambda: spray_cloud()[0],
    "spray-cloud-out": lambda: spray_cloud()[1],
    **{f"{kind}-{name}": (lambda make=make, ramp=ramp: make(ramp)) for name, ramp in FAMILIES.items()
       for kind, make in [("glow", glow), ("flare", lambda r: glint(r, 8)), ("flare-big", lambda r: glint(r, 14)),
                          ("bit", bits), ("trail", trail)]},
    "shell": shell,
    "shield": shield,
    "rays-teal": lambda: rays(TEAL),
    "rays-red": lambda: rays(RED),
    "rays-cream": lambda: rays(CREAM),
    "halo-teal": lambda: halo(TEAL),
    "halo-red": lambda: halo(RED),
    "halo-cream": lambda: halo(CREAM),
    "splash": lambda: splash(WATER),
    "splash-toxic": lambda: splash(TOXIC),
    "drip": drip,
    "ripple": ripple,
    "crackle": crackle,
    "bolt": bolt,
    "press": press,
    "shine": lambda: shine(22),
    "shine-s": lambda: shine(12),
    "milestone-1": lambda: milestone((GOLD, GOLD), 48, 1),
    "milestone-2": lambda: milestone((FIRE, GOLD), 64, 2),
    "milestone-3": lambda: milestone((CREAM, MAGENTA), 80, 3),
    **{f"confetti-{n}": (lambda ramp=ramp: confetti(ramp)) for n, ramp in
       {"pink": PINK, "cyan": CYAN, "gold": GOLD, "leaf": LEAF}.items()},
    **{f"ghost-{colour}-{anim}": (lambda ramp=ramp, anim=anim, scan=scan: ghost(ramp, anim, scan))
       for colour, ramp, scan in [("teal", TEAL[:4], True), ("pink", PINK[1:], True), ("cyan", CYAN[1:], True),
                                  ("tint", [(150, 150, 150), (205, 205, 205), (255, 255, 255)], True),
                                  ("white", [CREAM[3], CREAM[4], (255, 255, 255)], False)]
       for anim in GHOSTS},
}
