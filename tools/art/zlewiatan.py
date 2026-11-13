"""Zlewiatan, the third boss: the three painted heads (public/boss/face1-3) on drain-pipe necks out of one drain hole.

The heads are the game's own head art, read at their painted grid (the tower 94 px, the pierog 57, the carp 51) and
drawn at the size the fight shows them today: the tower one painted px per texel, the pierog 1.35 texels, the carp
1.6. They are posed at 8x after a Scale2x upscale and sampled back per texel (RotSprite), so a turned or squashed
head stays crisp. Each head's mouth opens with a warp of its own painting: the tower's and the pierog's lower jaw
drops (the chin under it squeezes up so the head's outline below stays put), the carp's lower lip swings down about
the corner of its mouth; the gap is the mouth's own dark inside, its tongue or gum at the bottom.

The necks are drawn per frame: thick segmented drain pipes in the portrait's colours (slimy green, the pierog's
ochre with slime), lit from ahead and above like the heads, with collars, slime runs and drips, each a smooth curve
from the drain hole to its head and into it. The drain hole sits under the bottom ledge, its front lip drawn over
the pipes, and everything that sinks below that lip is gone (the defeat drains it away).

Design coordinates are the game's screen in texels (2 world px each) at 16:9: 455 x 256, the bottom lane's floor at
y 204, the top's at 136. The heads sit where the fight shows them, the tower's mouth on the top lane, the carp's on
the bottom one, the pierog forward between them.

What it spits is drawn here too, each head's own: a slab of prefab wall from the tower, skwarki from the pierog,
fishbones from the carp, the radiator nothing stops, the carp's bubble and the pierog's sour cream with its puddle and
landing mark. Each is shaped per frame at native size and lit on screen from the creature's light.

Every frame is checked: each neck covers the point where it enters its head and the head covers it too, each neck
reaches into the hole, and the creature is one piece (steam, drips, spray and bubbles may float).
`python3 tools/art/zlewiatan.py OUT_DIR` writes the previews; `python3 tools/art/bake_bosses.py zlewiatan` bakes the
atlas the game uses (bake_zlewiatan.py).
"""
import json
import math
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

sys.path.insert(0, str(Path(__file__).parent))
from lodzia import _scale2x  # noqa: E402

K = 8
ROOT = Path(__file__).resolve().parents[2]

# Canvas: screen texels x 260..484, y 28..262
X0, Y0 = 260, 28
CW, CH = 224, 234

# The fight's lanes, screen texels: where shots fly (lane y) and the floors' tops
TOP_LANE, BOTTOM_LANE = (272 - 25) / 2, (408 - 25) / 2
TOP_FLOOR, BOTTOM_FLOOR = 136, 204
# The boss container today (cam.width - 95, bossY), screen texels: the frames' pivot
CONTAINER = (455 - 47.5, 157.5)

# Drain hole: centre, radii
HOLE = (400.0, 247.0, 34.0, 6.0)
LIGHT = np.array([-.55, -.62, .56])
LIGHT /= np.linalg.norm(LIGHT)


def _big(rgba: np.ndarray) -> np.ndarray:
    a = rgba.copy()
    a[a[..., 3] < 128] = 0
    for _ in range(3):
        a = _scale2x(a)
    return a


def _rot(deg: float) -> np.ndarray:
    a = math.radians(deg)
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


def _smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- heads

@dataclass
class Mouth:
    kind: str                 # "drop": the lower jaw drops; "hinge": the lower lip swings about the mouth's corner
    at: tuple                 # drop: (x0, x1, y) the mouth line; hinge: the corner
    size: float               # drop: px the jaw drops when wide open; hinge: degrees
    jaw: float = 6            # drop: rows that move with the jaw; hinge: the jaw's wedge, degrees
    give: float = 20          # drop: rows under the jaw that squeeze; hinge: degrees of the squeeze past the wedge
    reach: float = 14         # hinge: the lip's length
    tip: tuple = (-1.0, 0.0)  # hinge: towards the lip's tip
    down: tuple = (0.0, 1.0)  # hinge: towards the jaw
    inside: tuple = (15, 15, 28)
    tongue: tuple = (66, 34, 41)


@dataclass
class HeadSpec:
    name: str
    file: str
    cells: int                # the painting's grid: cells across the 512 px image
    phase: tuple              # where the grid starts, image px
    scale: float              # texels per painted px
    attach: tuple             # where the neck goes in, painted px
    exit: tuple               # the neck's way out of the head, head-local
    mouth: Mouth
    rest: tuple               # the attach point at rest, screen texels
    base: tuple               # where the neck leaves the hole, screen texels
    neck: tuple               # half widths: at the hole, at the head
    material: str = "green"
    lane: str = "top"
    inset: float = 5.0        # texels from where the neck goes in to the head's edge: the flange sits past it


SPECS = [
    HeadSpec("block", "public/boss/face1.webp", 94, (0.68, 0.68), 1.0, (42.0, 89.0), (0.0, 1.0),
             Mouth("drop", (23.5, 55.5, 55.5), 7, jaw=10, give=26, inside=(15, 15, 28), tongue=(66, 34, 41)),
             rest=(414.0, 163.0), base=(422.0, 252.0), neck=(13.0, 10.0), lane="top"),
    HeadSpec("pierog", "public/boss/face2.webp", 57, (5.61, 0.0), 1.35, (49.0, 40.0), (1.0, 0.25),
             Mouth("drop", (12.5, 38.5, 36.5), 5, jaw=7, give=12, inside=(17, 15, 27), tongue=(178, 64, 52)),
             rest=(368.0, 152.0), base=(399.0, 252.0), neck=(11.5, 8.5), material="ochre", lane="both", inset=6.0),
    HeadSpec("carp", "public/boss/face3.webp", 51, (0.0, 5.02), 1.6, (36.0, 40.0), (0.55, 1.0),
             Mouth("hinge", (12.5, 23.5), 30, jaw=64, give=50, reach=14, inside=(26, 12, 22), tongue=(124, 58, 66)),
             rest=(356.0, 222.0), base=(378.0, 252.0), neck=(12.5, 9.5), lane="bottom", inset=8.0),
]
ORDER = ["block", "pierog", "carp"]
# back to front: the tower behind, the carp, the pierog's neck over the carp's back and the pierog in front
DRAW = ["neck_block", "block", "neck_carp", "carp", "neck_pierog", "pierog"]
NAMES = {s.name: s for s in SPECS}


class Head:
    def __init__(self, spec: HeadSpec):
        self.spec = spec
        a = np.asarray(Image.open(ROOT / spec.file).convert("RGBA"))
        p = 512 / spec.cells
        xs = spec.phase[0] + p * (np.arange(-1, spec.cells + 1) + .5)
        ys = spec.phase[1] + p * (np.arange(-1, spec.cells + 1) + .5)
        xs = xs[(xs >= 0) & (xs < 512)].astype(int)
        ys = ys[(ys >= 0) & (ys < 512)].astype(int)
        native = a[ys][:, xs].copy()
        solid = native[..., 3] > 128
        labels, count = ni.label(solid, structure=np.ones((3, 3)))
        sizes = ni.sum(solid, labels, range(1, count + 1))
        main = labels == (int(np.argmax(sizes)) + 1)
        self.steam = None
        if count > 1:                                   # the pierog's steam: its own layer, it floats
            steam = native.copy()
            steam[main | ~solid, 3] = 0
            self.steam = _big(steam)
            native[~main, 3] = 0
        self.native = native
        self.solid = native[..., 3] > 128
        self.big = _big(native)
        self.h, self.w = native.shape[:2]

    # painted px -> painted px, for the mouth opened by jaw 0..1; and which px are the mouth's inside
    def jaw(self, px, py, jaw):
        m = self.spec.mouth
        cav = np.zeros(px.shape, bool)
        shade = np.zeros(px.shape)
        if jaw <= 0:
            return px, py, cav, shade
        if m.kind == "drop":
            x0, x1, ym = m.at
            edge = 4.0
            prof = _smooth(np.minimum(px - x0, x1 - px) / edge)
            d = m.size * jaw * prof
            rel = py - ym
            sy = py.copy()
            cav = (rel >= 0) & (rel < d) & (d > .35)
            rigid = (rel >= d) & (rel < d + m.jaw)
            sy[rigid] = py[rigid] - d[rigid]
            sq = (rel >= d + m.jaw) & (rel < m.jaw + m.give)
            sy[sq] = ym + m.jaw + (rel[sq] - d[sq] - m.jaw) * m.give / (m.give - d[sq])
            line = self._solid_at(px, np.full(px.shape, ym))
            cav &= line
            shade = np.where(d > 0, rel / np.maximum(d, 1e-6), 0)
            return px, sy, cav, shade
        hx, hy = m.at
        u_dir, v_dir = np.array(m.tip, float), np.array(m.down, float)
        rx, ry = px - hx, py - hy
        u = rx * u_dir[0] + ry * u_dir[1]
        v = rx * v_dir[0] + ry * v_dir[1]
        r = np.hypot(u, v)
        a = np.degrees(np.arctan2(v, u))
        th = m.size * jaw
        src = a.copy()
        cav = (a >= 0) & (a < th) & (r < m.reach + .5)
        rigid = (a >= th) & (a < m.jaw + th)
        src[rigid] = a[rigid] - th
        sq = (a >= m.jaw + th) & (a < m.jaw + m.give)
        src[sq] = m.jaw + (a[sq] - m.jaw - th) * m.give / (m.give - th)
        out = (a >= 0) & (a < th) & ~cav
        src[out] = a[out] - th
        rad = np.radians(src)
        sx = hx + r * (np.cos(rad) * u_dir[0] + np.sin(rad) * v_dir[0])
        sy = hy + r * (np.cos(rad) * u_dir[1] + np.sin(rad) * v_dir[1])
        line = self._solid_at(hx + r * u_dir[0], hy + r * u_dir[1])
        cav &= line
        shade = np.where(th > 0, a / max(th, 1e-6), 0)
        return sx, sy, cav, shade

    def _solid_at(self, px, py):
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        ok = (ix >= 0) & (ix < self.w) & (iy >= 0) & (iy < self.h)
        out = np.zeros(px.shape, bool)
        out[ok] = self.solid[iy[ok], ix[ok]]
        return out


HEADS = None


def heads() -> dict:
    global HEADS
    if HEADS is None:
        HEADS = {s.name: Head(s) for s in SPECS}
    return HEADS


# ---------------------------------------------------------------- poses

@dataclass
class HP:
    """One head and its neck. off: the head moved from rest (texels). rot: turned clockwise (degrees). sx, sy: squash
    along the head's own axes, about where the neck goes in. jaw: the mouth, 0 shut (as painted) to 1 wide open.
    bend: the neck's curve pushed sideways (texels, at its middle). slack: how far the neck's ends carry their
    direction (more = a rounder, lazier curve). width: the pipe's thickness. sink: the head gone into the hole (no
    joint check)."""
    off: tuple = (0.0, 0.0)
    rot: float = 0.0
    sx: float = 1.0
    sy: float = 1.0
    jaw: float = 0.0
    bend: tuple = (0.0, 0.0)
    slack: float = 1.0
    width: float = 1.0
    sink: bool = False


@dataclass
class Pose:
    heads: dict = field(default_factory=lambda: {n: HP() for n in ORDER})
    heat: float = 0.0          # rage: red-hot
    flash: float = 0.0         # hurt: pale
    shift: tuple = (0.0, 0.0)  # every head moved (the charge's lean)
    fx: list = field(default_factory=list)
    fire: tuple = ()           # heads whose shot leaves on this frame
    draw: tuple = ()           # back to front, when not DRAW


def pose(fx=None, fire=(), heat=0.0, flash=0.0, shift=(0.0, 0.0), draw=(), **heads_kw) -> Pose:
    hs = {n: HP() for n in ORDER}
    for name, kw in heads_kw.items():
        hs[name] = replace(HP(), **kw)
    return Pose(hs, heat, flash, shift, fx or [], tuple(fire), tuple(draw))


# ---------------------------------------------------------------- drawing

def _grid():
    ys, xs = np.mgrid[0:CH, 0:CW].astype(np.float64)
    return xs + .5 + X0, ys + .5 + Y0


GX, GY = _grid()


def _head_place(spec: HeadSpec, hp: HP, shift):
    pos = np.array(spec.rest) + np.array(hp.off) + np.array(shift)
    return pos


def _head_layer(head: Head, hp: HP, pos):
    s = head.spec
    rinv = _rot(-hp.rot)
    qx, qy = GX - pos[0], GY - pos[1]
    lx = rinv[0, 0] * qx + rinv[0, 1] * qy
    ly = rinv[1, 0] * qx + rinv[1, 1] * qy
    px = s.attach[0] + lx / (s.scale * hp.sx)
    py = s.attach[1] + ly / (s.scale * hp.sy)
    sx, sy, cav, shade = head.jaw(px, py, hp.jaw)
    ix, iy = np.floor(sx * K).astype(int), np.floor(sy * K).astype(int)
    ok = (ix >= 0) & (ix < head.w * K) & (iy >= 0) & (iy < head.h * K)
    out = np.zeros((CH, CW, 4), np.uint8)
    out[ok] = head.big[iy[ok], ix[ok]]
    if cav.any():
        m = s.mouth
        inside = np.array(m.inside, float)
        col = np.zeros((CH, CW, 3))
        col[:] = inside
        deep = (shade > .25) & (shade < .7)
        col[deep] = inside * .7
        low = shade >= .62
        col[low] = np.array(m.tongue, float)
        col[(shade >= .62) & (shade < .78)] = np.array(m.tongue, float) * .72 + inside * .28
        out[cav, :3] = col[cav].astype(np.uint8)
        out[cav, 3] = 255
    steam = None
    if head.steam is not None:
        # the steam rises off the head, it doesn't turn with it
        bx, by = GX - pos[0], GY - pos[1]
        px2 = s.attach[0] + bx / s.scale
        py2 = s.attach[1] + by / s.scale
        ix, iy = np.floor(px2 * K).astype(int), np.floor(py2 * K).astype(int)
        ok = (ix >= 0) & (ix < head.w * K) & (iy >= 0) & (iy < head.h * K)
        steam = np.zeros((CH, CW, 4), np.uint8)
        steam[ok] = head.steam[iy[ok], ix[ok]]
    return out, cav, steam


GREEN = np.array([(18, 26, 24), (30, 42, 36), (41, 56, 46), (52, 70, 56), (66, 86, 68), (84, 106, 86),
                  (118, 146, 136), (176, 198, 190)], float)
OCHRE = np.array([(36, 34, 24), (58, 54, 38), (83, 80, 56), (104, 100, 72), (124, 118, 86), (146, 138, 98),
                  (176, 168, 122), (214, 206, 160)], float)
SLIME = np.array([(40, 46, 26), (60, 68, 32), (82, 90, 40), (104, 110, 48), (124, 128, 58), (144, 146, 70),
                  (174, 172, 98), (206, 200, 138)], float)
COLLAR = np.array([(20, 22, 18), (34, 36, 28), (48, 50, 36), (64, 64, 44), (82, 80, 52), (104, 100, 64),
                   (132, 126, 84), (170, 162, 110)], float)


def _hash(a, b=0):
    v = np.sin(np.asarray(a, float) * 12.9898 + b * 78.233) * 43758.5453
    return v - np.floor(v)


@dataclass
class Neck:
    points: np.ndarray
    tangents: np.ndarray
    s: np.ndarray
    length: float
    collars: list          # arc length of each collar's middle, the head's flange first
    lengths: list          # each collar's half length along the pipe


def _neck_curve(spec: HeadSpec, hp: HP, pos) -> Neck:
    a = np.array(spec.base, float)
    r = _rot(hp.rot)
    ex = np.array(spec.exit, float)
    ex /= np.linalg.norm(ex)
    down = r @ ex
    # into the head: the pipe runs on a few px past where it goes in, hidden by the head
    end = pos - down * 4.0
    span = float(np.linalg.norm(end - a))
    p1 = a + np.array([0.0, -1.0]) * span * .42 * hp.slack + np.array(hp.bend) * .6
    p2 = pos + down * span * .38 * hp.slack + np.array(hp.bend) * .6
    t = np.linspace(0, 1, 260)[:, None]
    pts = (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * end
    tan = np.gradient(pts, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True) + 1e-9
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    length = float(s[-1])
    # few, heavy joints: a bolted flange just under the head, one where the pipe leaves the drain, and a collar in the
    # middle of a long run
    collars, lengths = [length - 4.0 - spec.inset - 2.0], [3.0]
    if length > 34:
        collars.append(13.0)
        lengths.append(3.0)
    if length > 80:
        collars.append(length * .5)
        lengths.append(2.2)
    return Neck(pts, tan, s, length, collars, lengths)


def _neck_layer(spec: HeadSpec, hp: HP, neck: Neck, heat: float):
    """A drain pipe: smooth lengths with a strong lit edge towards the light and a dark underside, a wet highlight,
    grime, slime running down from the joints, and heavy bolted flanges."""
    pts = neck.points
    half0, half1 = spec.neck
    lo = pts.min(0) - 18
    hi = pts.max(0) + 18
    x0, y0 = max(0, int(lo[0] - X0)), max(0, int(lo[1] - Y0))
    x1, y1 = min(CW, int(hi[0] - X0) + 1), min(CH, int(hi[1] - Y0) + 1)
    out = np.zeros((CH, CW, 4), np.uint8)
    collar_mask = np.zeros((CH, CW), bool)
    if x1 <= x0 or y1 <= y0:
        return out, collar_mask
    qx, qy = GX[y0:y1, x0:x1], GY[y0:y1, x0:x1]
    q = np.stack([qx.ravel(), qy.ravel()], 1)
    d2 = ((q[:, None, :] - pts[None, ::2, :]) ** 2).sum(2)
    idx = d2.argmin(1) * 2
    best = idx.copy()
    bestd = ((q - pts[idx]) ** 2).sum(1)
    for off in (-1, 1):
        j = np.clip(idx + off, 0, len(pts) - 1)
        dj = ((q - pts[j]) ** 2).sum(1)
        better = dj < bestd
        best[better], bestd[better] = j[better], dj[better]
    p, tan, s = pts[best], neck.tangents[best], neck.s[best]
    n = np.stack([-tan[:, 1], tan[:, 0]], 1)
    rel = q - p
    along = (rel * tan).sum(1)
    v = (rel * n).sum(1)
    frac = s / max(neck.length, 1)
    body_half = (half0 + (half1 - half0) * frac) * hp.width
    in_collar = np.zeros(len(q), bool)
    cpos = np.zeros(len(q))
    clen = np.ones(len(q))
    shadow = np.zeros(len(q), bool)
    for c, hl in zip(neck.collars, neck.lengths):
        hit = np.abs(s - c) <= hl
        in_collar |= hit
        cpos[hit] = s[hit] - c
        clen[hit] = hl
        shadow |= (c - s > hl) & (c - s <= hl + 2.0)       # the ring of shade the collar casts down the pipe
    half = body_half + in_collar * 2.3
    ends = ((best == 0) & (along < -.5)) | ((best == len(pts) - 1) & (along > .5))
    inside = (np.abs(v) <= half) & ~ends
    t = np.clip(v / np.maximum(half, 1), -1, 1)
    facing = n[:, 0] * LIGHT[0] + n[:, 1] * LIGHT[1]
    lit_side = np.sign(facing) * t                          # +1 at the edge towards the light
    nz = np.sqrt(1 - t ** 2)
    lam = t * facing + nz * LIGHT[2]
    ramp = GREEN if spec.material == "green" else OCHRE
    name_k = ORDER.index(spec.name)
    level = np.clip((lam + .1) * 3.2, 0, 3).astype(int) + 1    # 1..4 across the smooth length
    grime = _hash(np.floor(s / 7.0) * 7 + np.floor((t + 1) * 2), 11 + name_k) < .16
    level = level - grime - shadow
    colour = ramp[np.clip(level, 0, 7)].copy()
    edge = np.abs(v) > half - 1.6
    colour[edge & (lit_side > 0)] = ramp[6]                  # the lit top edge
    colour[edge & (lit_side < 0)] = ramp[0]                  # the dark underside
    colour[(np.abs(v) > half - 3.0) & ~edge & (lit_side < 0)] = ramp[1]
    spec_line = (np.abs(lit_side - .5) * half < .7) & ~grime & (_hash(np.floor(s / 4.0), 3 + name_k) > .25)
    colour[spec_line] = ramp[7]
    colour[spec_line & (_hash(np.floor(s / 2.0), 9 + name_k) > .6)] = ramp[6]
    # slime: streaks running down from each joint, a fat drop at each one's end
    slime = np.zeros(len(q), bool)
    bulb = np.zeros(len(q), bool)
    for k, (c, hl) in enumerate(zip(neck.collars, neck.lengths)):
        for j in range(3):
            col = (_hash(k * 5 + j, 21 + name_k) - .5) * 1.5      # where across the pipe, -0.75..0.75
            run = 5 + 12 * _hash(k * 5 + j, 31 + name_k)
            w = .8 + .7 * _hash(k * 5 + j, 41)
            below = c - hl - s
            on = (np.abs(t - col) * half < w) & (below > -.5) & (below < run)
            slime |= on
            bulb |= (np.abs(t - col) * half < w + .6) & (np.abs(below - run) < 1.2)
    sl = (slime | bulb) & ~edge
    colour[sl] = SLIME[np.clip(level[sl] + 2, 0, 7)]
    colour[bulb & ~edge & (lit_side > 0)] = SLIME[7]
    # the joints: heavy cast flanges, a lit lip towards the head, a dark seam under, bolts round them
    cl = in_collar
    clev = np.clip((lam + .1) * 3.2, 0, 3).astype(int) + 2
    colour[cl] = COLLAR[np.clip(clev[cl], 0, 7)]
    colour[cl & (cpos > clen - 1.1)] = COLLAR[np.clip(clev[cl & (cpos > clen - 1.1)] + 2, 0, 7)]
    colour[cl & (cpos < -clen + 1.1)] = COLLAR[0]
    colour[cl & edge & (lit_side < 0)] = COLLAR[0]
    colour[cl & edge & (lit_side > 0)] = COLLAR[6]
    bolt = np.zeros(len(q), bool)
    bolt_shade = np.zeros(len(q), bool)
    for tb in (-.6, 0.0, .6):
        near = np.abs(t - tb) * half < .8
        bolt |= cl & near & (np.abs(cpos) < .6)
        bolt_shade |= cl & near & (cpos < -.4) & (cpos > -1.6)
    colour[bolt_shade] = COLLAR[0]
    colour[bolt] = COLLAR[7]
    if heat > 0:
        glow = cl & (np.abs(cpos) <= clen - 1.1)
        colour[glow] = colour[glow] * (1 - heat) + np.array([255, 120, 40]) * heat
        colour[bolt] = colour[bolt] * (1 - heat) + np.array([255, 230, 150]) * heat
    block = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    flat = block.reshape(-1, 4)
    flat[inside, :3] = np.clip(colour[inside], 0, 255).astype(np.uint8)
    flat[inside, 3] = 255
    out[y0:y1, x0:x1] = block
    cm = np.zeros(len(q), bool)
    cm[inside & in_collar] = True
    collar_mask[y0:y1, x0:x1] = cm.reshape(y1 - y0, x1 - x0)
    return out, collar_mask


def _hole_layers():
    cx, cy, rx, ry = HOLE
    dx, dy = (GX - cx) / rx, (GY - cy) / ry
    r = dx ** 2 + dy ** 2
    back = np.zeros((CH, CW, 4), np.uint8)
    front = np.zeros((CH, CW, 4), np.uint8)
    rim_out = r <= 1.0
    opening = ((GX - cx) / (rx - 3)) ** 2 + ((GY - cy) / (ry - 1.6)) ** 2 <= 1.0
    ring = rim_out & ~opening
    back[opening] = (12, 14, 14, 255)
    back[opening & (GY < cy - 1)] = (20, 24, 22, 255)
    upper = ring & (GY < cy)
    back[upper] = (58, 62, 64, 255)
    back[upper & (GY < cy - ry + 1.4)] = (40, 44, 46, 255)
    lower = ring & (GY >= cy)
    front[lower] = (98, 104, 106, 255)
    front[lower & (GY > cy + ry - 1.3)] = (48, 52, 54, 255)
    front[lower & (GY < cy + 1.5) & (np.abs(GX - cx) < rx - 6)] = (150, 156, 156, 255)
    # a lick of slime over the lip
    for x0, w in ((cx - 14, 4), (cx + 6, 3), (cx + 20, 2)):
        lick = lower & (np.abs(GX - x0) < w / 2) & (GY < cy + ry - 1.3)
        front[lick] = (110, 112, 44, 255)
    gone = np.zeros((CH, CW), bool)
    lip = cy + ry * np.sqrt(np.clip(1 - dx ** 2, 0, 1))
    inner = np.abs(GX - cx) < rx
    gone[inner] = GY[inner] > lip[inner] - 1.2
    gone[~inner] = GY[~inner] > cy
    return back, front, gone, opening, rim_out


HOLE_BACK, HOLE_FRONT, GONE, OPENING, HOLE_ALL = _hole_layers()

FX_IDS = {"fx", "steam"}


@dataclass
class Drawn:
    image: Image.Image
    mouths: dict
    joints: dict
    failures: list
    masks: dict


def _mouth_point(head: Head, hp: HP, pos) -> np.ndarray:
    """The front of the mouth, screen texels: where a shot leaves."""
    m = head.spec.mouth
    if m.kind == "drop":
        x0, x1, ym = m.at
        p = np.array([(x0 + x1) / 2, ym + m.size * hp.jaw / 2])
    else:
        a = math.radians(m.size * hp.jaw / 2)
        u, v = np.array(m.tip), np.array(m.down)
        p = np.array(m.at) + m.reach * .85 * (math.cos(a) * u + math.sin(a) * v)
    s = head.spec
    local = (p - np.array(s.attach)) * s.scale * np.array([hp.sx, hp.sy])
    return pos + _rot(hp.rot) @ local


def draw(p: Pose) -> Drawn:
    hd = heads()
    layers = [("hole_back", HOLE_BACK)]
    masks = {}
    mouths, joints, necks, places, cavs = {}, {}, {}, {}, {}
    collars = np.zeros((CH, CW), bool)
    steam_layers = []
    made = {}
    for name in ORDER:
        head, hp = hd[name], p.heads[name]
        pos = _head_place(head.spec, hp, p.shift)
        places[name] = pos
        neck = _neck_curve(head.spec, hp, pos)
        necks[name] = neck
        nl, cm = _neck_layer(head.spec, hp, neck, p.heat)
        if hp.sink and pos[1] > HOLE[1] + 40:      # down the drain, neck and all
            nl, cm = np.zeros_like(nl), np.zeros_like(cm)
        collars |= cm
        made[f"neck_{name}"] = nl
        hl, cav, steam = _head_layer(head, hp, pos)
        cavs[name] = cav
        made[name] = hl
        if steam is not None:
            steam_layers.append(steam)
        mouths[name] = _mouth_point(head, hp, pos)
        joints[name] = pos
    layers += [(name, made[name]) for name in (p.draw or DRAW)]
    canvas = np.zeros((CH, CW, 4), np.uint8)
    owner = np.full((CH, CW), "", object)
    for name, layer in layers:
        solid = layer[..., 3] > 128
        if name != "hole_back":
            solid &= ~GONE
        masks[name] = solid
        canvas[solid] = layer[solid]
        owner[solid] = name
    front = HOLE_FRONT[..., 3] > 128
    canvas[front] = HOLE_FRONT[front]
    owner[front] = "hole_front"
    masks["hole_front"] = front
    creature = (owner != "") & (canvas[..., 3] > 128)
    body = creature & ~np.isin(owner, ["hole_back", "hole_front"])
    if p.heat > 0:
        _heat(canvas, body, p.heat, collars & body)
    if p.flash:
        canvas[body, :3] = (canvas[body, :3] * (1 - p.flash) + 255 * p.flash).astype(np.uint8)
    for steam in steam_layers:
        solid = (steam[..., 3] > 128) & ~GONE
        canvas[solid] = steam[solid]
        owner[solid] = "steam"
    for item in p.fx:
        _fx(canvas, owner, item, p, necks, places, mouths)

    failures = []
    for name in ORDER:
        hp = p.heads[name]
        if hp.sink:
            continue
        x, y = joints[name] - [X0, Y0]
        xi, yi = int(math.floor(x)), int(math.floor(y))
        for layer in (f"neck_{name}", name):
            win = masks[layer][max(0, yi - 1):yi + 2, max(0, xi - 1):xi + 2]
            if win.sum() < 5:
                failures.append(f"{name}: {layer} doesn't cover where the neck goes in ({win.sum()}/9)")
        # the neck reaches into the hole: it shows in the opening just over the front lip
        neck_mask = masks[f"neck_{name}"]
        bx = int(necks[name].points[0][0] - X0)
        col = neck_mask[:, max(0, bx - 2):bx + 3] & OPENING[:, max(0, bx - 2):bx + 3]
        if not col.any():
            failures.append(f"{name}: neck doesn't reach into the hole")
    figure = HOLE_ALL.copy()          # the hole is one thing, its back and front rims together
    for name, mask in masks.items():
        figure |= mask
    labels, count = ni.label(figure, structure=np.ones((3, 3)))
    if count > 1:
        sizes = ni.sum(figure, labels, range(1, count + 1))
        loose = sorted(int(v) for v in sizes)[:-1]
        if any(v >= 3 for v in loose):
            failures.append(f"creature in {count} pieces, loose sizes {loose}")
    for name in ORDER:
        masks[f"cav_{name}"] = cavs[name] & ~GONE
    return Drawn(Image.fromarray(canvas), {k: tuple(round(float(c), 1) for c in v) for k, v in mouths.items()},
                 {k: tuple(round(float(c), 1) for c in v) for k, v in joints.items()}, failures, masks)


def _heat(canvas, body, heat, collars):
    """Red-hot: every colour pulled onto a heat ramp by its brightness, the darks to blood red, the lights to orange,
    the collars glowing."""
    rgb = canvas[body, :3].astype(float)
    lum = (rgb @ np.array([.3, .59, .11])) / 255
    stops = np.array([0, .25, .5, .75, 1.0])
    ramp = np.array([(34, 2, 6), (132, 14, 12), (214, 44, 22), (255, 118, 42), (255, 214, 140)], float)
    hot = np.stack([np.interp(lum, stops, ramp[:, i]) for i in range(3)], 1)
    mix = .64 * heat
    canvas[body, :3] = np.clip(rgb * (1 - mix) + hot * mix, 0, 255).astype(np.uint8)
    canvas[collars, :3] = np.clip(canvas[collars, :3].astype(float) * (1 - .4 * heat) + np.array([255, 150, 60]) * .4 * heat, 0, 255).astype(np.uint8)


def _put(canvas, owner, x, y, colour):
    xi, yi = int(math.floor(x - X0)), int(math.floor(y - Y0))
    if 0 <= xi < CW and 0 <= yi < CH and not GONE[yi, xi]:
        canvas[yi, xi] = colour
        owner[yi, xi] = "fx"


def _blob(canvas, owner, x, y, r, colour, light=None):
    ri = int(math.ceil(r)) + 1
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            if dx * dx + dy * dy <= r * r + .3:
                c = colour
                if light is not None and dx + dy < -r * .6:
                    c = light
                _put(canvas, owner, x + dx, y + dy, c)


DRIP = [(84, 98, 26, 255), (150, 172, 48, 255), (222, 238, 120, 255)]


def _fx(canvas, owner, item, p, necks, places, mouths):
    kind = item[0]
    if kind == "drip":                # ("drip", head, collar k, phase 0..1): a slime drop forms under a collar, falls
        _, name, k, ph = item
        neck = necks[name]
        if k >= len(neck.collars):
            return
        c = neck.collars[k]
        i = int(np.searchsorted(neck.s, c))
        i = min(i, len(neck.points) - 1)
        pt, tan = neck.points[i], neck.tangents[i]
        n = np.array([-tan[1], tan[0]])
        half = NAMES[name].neck[0] * p.heads[name].width
        side = n if n[1] > 0 else -n     # the collar's lower side
        side = n if abs(n[1]) < .3 and n[0] < 0 else side
        under = pt + side * (half + 1.5)
        if ph < .5:
            # it gathers: a strand stretching, a fat drop at its end
            length = 1 + int(ph * 8)
            for t in range(length):
                _put(canvas, owner, under[0], under[1] + t, DRIP[1])
            _blob(canvas, owner, under[0], under[1] + length + .5, .6 + ph * 1.6, DRIP[1], DRIP[2])
            _put(canvas, owner, under[0] + 1, under[1] + length + 1, DRIP[0])
        else:
            fall = (ph - .5) * 2
            y = under[1] + 6 + fall * fall * 30
            _put(canvas, owner, under[0], y - 3, DRIP[0])
            _put(canvas, owner, under[0], y - 2, DRIP[1])
            _blob(canvas, owner, under[0], y, 1.4, DRIP[1], DRIP[2])
            _put(canvas, owner, under[0] + 1, y + 1, DRIP[0])
    elif kind == "spit":              # ("spit", head, size): the burst of slime at the mouth as the shot leaves
        _, name, size = item
        mx, my = mouths[name]
        rng = np.random.default_rng(ORDER.index(name) * 11 + int(size * 10))
        for _ in range(int(5 + 4 * size)):
            ang = math.radians(180 + rng.uniform(-50, 50))
            dist = rng.uniform(4, 9 + 6 * size)
            x, y = mx + math.cos(ang) * dist, my + math.sin(ang) * dist
            _blob(canvas, owner, x, y, rng.uniform(.4, 1.3), DRIP[1], DRIP[2])
        for t in range(int(3 + 3 * size)):
            _put(canvas, owner, mx - 3 - t * 2, my - 3 - t, (236, 240, 220, 255))
            _put(canvas, owner, mx - 3 - t * 2, my + 3 + t, (236, 240, 220, 255))
    elif kind == "puff":              # ("puff", x, y, size, phase): steam or smoke
        _, x, y, size, ph = item[:5]
        col =(208, 206, 200, 255) if len(item) < 6 else item[5]
        shade = (150, 148, 146, 255) if len(item) < 7 else item[6]
        y = y - ph * 8
        r = size * (.6 + ph * .7)
        _blob(canvas, owner, x, y, r, shade)
        _blob(canvas, owner, x - .5, y - .5, r * .7, col)
        _blob(canvas, owner, x + r * .9, y + r * .3, r * .6, shade)
    elif kind == "steam_head":        # ("steam_head", head, phase): steam whistling up off a head
        _, name, ph = item
        pos = places[name]
        s = NAMES[name]
        top = pos[1] - (s.attach[1] - 2) * s.scale * p.heads[name].sy
        for k, dx in enumerate((-16, 0, 14)):
            q = (ph + k * .37) % 1
            _fx(canvas, owner, ("puff", pos[0] + dx * s.scale * .7 + 3 * math.sin(q * 6 + k), top - 2 - q * 10,
                                2.2 + q * 2.2, 0.0, (240, 230, 224, 255), (184, 160, 158, 255)), p, necks, places, mouths)
    elif kind == "lines":             # ("lines", x, y, length): a knock
        _, x, y, length = item
        for ang in (-150, -110, -70, -30):
            a = math.radians(ang)
            for t in range(2, 2 + length):
                _put(canvas, owner, x + t * math.cos(a), y + t * math.sin(a), (255, 246, 220, 255))
    elif kind == "star":              # ("star", x, y, size): the glint of a head about to fire
        _, x, y, size = item
        for t in range(-size, size + 1):
            c = (255, 255, 255, 255) if abs(t) < size else (255, 226, 150, 255)
            _put(canvas, owner, x + t, y, c)
            _put(canvas, owner, x, y + t, c)
            if t and abs(t) < 3:
                _put(canvas, owner, x + t, y + 1, c)
                _put(canvas, owner, x + 1, y + t, c)
        for t in range(1, size // 2 + 1):
            for sx_, sy_ in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                _put(canvas, owner, x + sx_ * t, y + sy_ * t, (255, 226, 150, 255))
    elif kind == "burst":             # ("burst", head, collar k, size): a pipe joint bursts, slime spraying out
        _, name, k, size = item
        neck = necks[name]
        if k >= len(neck.collars):
            return
        i = min(int(np.searchsorted(neck.s, neck.collars[k])), len(neck.points) - 1)
        pt, tan = neck.points[i], neck.tangents[i]
        n = np.array([-tan[1], tan[0]])
        rng = np.random.default_rng(31 + ORDER.index(name) * 5 + k)
        for _ in range(int(10 * size)):
            side = n if rng.uniform() < .5 else -n
            dist = NAMES[name].neck[0] + rng.uniform(1, 6 + 8 * size)
            spread = tan * rng.uniform(-3, 3)
            x, y = pt + side * dist + spread + np.array([0, rng.uniform(-3, 2)])
            _blob(canvas, owner, x, y, rng.uniform(.4, 1.4), DRIP[rng.integers(0, 2)], DRIP[2])
        _blob(canvas, owner, pt[0] + n[0] * (NAMES[name].neck[0] + 1), pt[1] + n[1] * (NAMES[name].neck[0] + 1),
              1.5, (232, 226, 160, 255))
    elif kind == "bubble":            # ("bubble", x, y, r): a gurgle out of the drain
        _, x, y, r = item
        ri = int(math.ceil(r)) + 1
        for dy in range(-ri, ri + 1):
            for dx in range(-ri, ri + 1):
                d = math.hypot(dx, dy)
                if r - 1 <= d <= r + .4:
                    _put(canvas, owner, x + dx, y + dy, (150, 160, 70, 255) if dy > 0 else (200, 200, 110, 255))
                elif d < r - 1 and r > 2:
                    _put(canvas, owner, x + dx, y + dy, (88, 96, 44, 255))
        _put(canvas, owner, x - r * .4, y - r * .4, (240, 240, 200, 255))
    elif kind == "pop":               # ("pop", x, y, size): the last bubble bursts
        _, x, y, size = item
        for ang in range(0, 360, 45):
            a = math.radians(ang)
            for t in range(size, size + 3):
                _put(canvas, owner, x + t * math.cos(a), y + t * .6 * math.sin(a), (210, 206, 130, 255))
    elif kind == "swirl":             # ("swirl", phase): water spinning down the drain
        _, ph = item
        cx, cy, rx, ry = HOLE
        for k in range(3):
            for t in range(14):
                a = ph * math.tau + k * math.tau / 3 + t * .12
                rr = 1 - t / 18
                _put(canvas, owner, cx + math.cos(a) * (rx - 5) * rr, cy - 1 + math.sin(a) * (ry - 2) * rr,
                     (120, 140, 120, 255) if t < 8 else (70, 90, 72, 255))


# ---------------------------------------------------------------- animations

def _drips(i, n, phase=0.0):
    """The idle's drips: one under each neck's lower collars, out of step."""
    out = []
    for k, (name, collar) in enumerate((("block", 2), ("pierog", 0), ("carp", 0))):
        ph = ((i / n) + phase + k * .37) % 1
        out.append(("drip", name, collar, ph))
    return out


def idle():
    frames = []
    for i in range(8):
        t = i / 8 * math.tau
        frames.append(pose(
            block=dict(off=(1.5 * math.sin(t), 2.0 * math.sin(t + .6)), rot=2.5 * math.sin(t + .3),
                       bend=(3 * math.sin(t + 1.2), 0)),
            pierog=dict(off=(2.0 * math.sin(t + 2.1), 1.5 * math.sin(t + 2.8)), rot=4 * math.sin(t + 2.0) - 1,
                        bend=(-3 * math.sin(t + 2.6), 0)),
            carp=dict(off=(1.2 * math.sin(t + 4.2), 1.0 * math.sin(t + 4.6)), rot=3 * math.sin(t + 4.0),
                      sx=1 - .02 * max(0, math.sin(t + 4.0)), jaw=.12 * max(0.0, math.sin(2 * t))),
            fx=_drips(i, 8)))
    return frames


REST = pose()


def _spit(name: str, back: tuple, up_rot: float, fwd: tuple, others_lean: dict):
    """One head fires: it rears back (the tell: the others shy away from it), holds with a glint, snaps forward with
    its mouth wide on the release frame, recoils with the mouth still open and settles."""
    def with_others(k, **kw):
        out = {}
        for other in ORDER:
            if other == name:
                continue
            dx, dy = others_lean.get(other, (0, 0))
            out[other] = dict(off=(dx * k, dy * k), rot=0)
        out[name] = kw
        return out
    bx, by = back
    fx_, fy = fwd
    return [
        pose(**with_others(.6, off=(bx * .55, by * .55), rot=up_rot * .55, sy=1.09, sx=.93)),     # rears, inhaling
        pose(**with_others(1.0, off=(bx, by), rot=up_rot, sy=.92, sx=1.09, slack=1.15),            # the gulp: held
             fx=[("star_mouth", name)]),
        pose(**with_others(.6, off=(fx_, fy), rot=-up_rot * .55, sx=1.06, sy=.93, jaw=1.0, slack=.9),
             fx=[("spit", name, 1.0)], fire=(name,)),
        pose(**with_others(.3, off=(fx_ * .45, fy * .45), rot=-up_rot * .2, sx=1.02, sy=.98, jaw=.7)),
        pose(**with_others(.1, off=(bx * .12, by * .12), rot=up_rot * .1, jaw=.3)),
        pose(**with_others(0, off=(0, 0), rot=0, jaw=.05)),
    ]


def spit_block():
    return _spit("block", (9, -9), 13, (-9, 3), {"pierog": (-3, 4), "carp": (1, 2)})


def spit_pierog():
    return _spit("pierog", (17, -8), 20, (-12, 3), {"block": (4, -3), "carp": (2, 2)})


def spit_carp():
    return _spit("carp", (16, 3), 20, (-11, 0), {"block": (3, -3), "pierog": (-2, -4)})


def hurt():
    """Hit: the whole creature flinches back and away, mouths yelping, then sways forward and gathers itself."""
    return [
        pose(flash=.55, block=dict(off=(5, -3), rot=8, jaw=.5, sy=.95), pierog=dict(off=(6, -2), rot=10, jaw=.6, sx=.94),
             carp=dict(off=(4, 1), rot=7, jaw=.6, sx=.95)),
        pose(block=dict(off=(4, -2), rot=6, jaw=.35), pierog=dict(off=(5, -1), rot=7, jaw=.4),
             carp=dict(off=(3, 1), rot=5, jaw=.4)),
        pose(block=dict(off=(-2, 1), rot=-3, jaw=.1), pierog=dict(off=(-3, 1), rot=-4, jaw=.15),
             carp=dict(off=(-2, 0), rot=-3, jaw=.1)),
        pose(block=dict(off=(0, 0), rot=0), pierog=dict(off=(0, 0), rot=0), carp=dict(off=(0, 0), rot=0)),
    ]


RAGE_HOLD = dict(block=dict(off=(4, -9), rot=-4, jaw=.55, sy=1.04), pierog=dict(off=(-6, -6), rot=-8, jaw=.6),
                 carp=dict(off=(-3, 3), rot=6, jaw=.6))


def _rage_heads(k, shake=(0, 0, 0), jaw=None):
    out = {}
    for j, name in enumerate(ORDER):
        h = RAGE_HOLD[name]
        dx, dy = h["off"]
        s = shake[j]
        out[name] = dict(off=(dx * k + s, dy * k - abs(s) * .5), rot=h["rot"] * k + s * 1.5,
                         jaw=(h["jaw"] if jaw is None else jaw[j]) * k, sy=1 + (h.get("sy", 1) - 1) * k)
    return out


def rage_enter():
    """The heads rear and spread, roaring, as the creature heats up red: steam bursts off the collars."""
    puffs = lambda ph: [("steam_head", n, ph) for n in ORDER]  # noqa: E731
    return [
        pose(heat=.15, **_rage_heads(.3, jaw=(.2, .2, .2))),
        pose(heat=.4, **_rage_heads(.8, jaw=(.5, .5, .5)), fx=puffs(0)),
        pose(heat=.7, **_rage_heads(1.15, (1, -1, 1), jaw=(1, 1, 1)), fx=puffs(.25)),
        pose(heat=.9, **_rage_heads(1.05, (-1, 1, -1), jaw=(.9, .9, .9)), fx=puffs(.5)),
        pose(heat=1.0, **_rage_heads(1.0), fx=puffs(.75)),
    ]


def rage():
    frames = []
    shakes = [(1, -1, 1), (-1, 1, 0), (1, 0, -1), (0, -1, 1)]
    for i in range(4):
        frames.append(pose(heat=.92 + .08 * (i % 2), **_rage_heads(1.0, shakes[i], jaw=(.5, .6, .5)),
                           fx=[("steam_head", n, i / 4) for n in ORDER] + _drips(i, 4)))
    return frames


def rage_spit():
    """All three at once, the indestructible shot: they draw back together and snap forward, every mouth open."""
    def heads_at(back, rot, jaw, s=1.0):
        out = {}
        for name, (bx, by) in (("block", (5, -6)), ("pierog", (8, -3)), ("carp", (6, 3))):
            h = RAGE_HOLD[name]
            out[name] = dict(off=(h["off"][0] + bx * back, h["off"][1] + by * back), rot=h["rot"] + rot * (1 if name != "carp" else .8),
                             jaw=jaw, sy=s, sx=2 - s)
        return out
    puffs = lambda ph: [("steam_head", n, ph) for n in ORDER]  # noqa: E731
    return [
        pose(heat=1, **heads_at(.6, 5, .2, 1.03), fx=puffs(0)),
        pose(heat=1, **heads_at(1.0, 9, .1, 1.06), fx=puffs(.25) + [("star_mouth", n) for n in ORDER]),
        pose(heat=1, **heads_at(-1.3, -6, 1.0, .93), fx=[("spit", n, 1.2) for n in ORDER], fire=tuple(ORDER)),
        pose(heat=1, **heads_at(-.5, -2, .7, .98), fx=puffs(.5)),
        pose(heat=1, **heads_at(0, 0, .45), fx=puffs(.75)),
    ]


def charge():
    """Leaning in at the roach, necks stretched forward, the three heads snapping in turn."""
    frames = []
    for i in range(6):
        t = i / 6 * math.tau
        bite = [max(0.0, math.sin(t - k * math.tau / 3)) for k in range(3)]
        hs = {}
        for k, (name, (dx, dy), rot) in enumerate((("block", (-10, 4), -6), ("pierog", (-12, 1), -9),
                                                   ("carp", (-12, -2), -7))):
            snap = bite[k]
            hs[name] = dict(off=(dx - 4 * snap + 1.5 * math.sin(t + k), dy + 1.5 * math.sin(t * 2 + k)),
                            rot=rot - 5 * snap, jaw=.15 + .85 * snap, sx=1 + .05 * snap, sy=1 - .04 * snap,
                            slack=.85, bend=(-6, 0))
        frames.append(pose(**hs, fx=_drips(i, 6, .2)))
    return frames


# where each head's middle is, painted px: the drain takes the heads by their middles
MIDDLE = {"block": (47.0, 47.0), "pierog": (29.0, 30.0), "carp": (25.5, 26.0)}


def _centred(name, centre, rot=0.0, sx=1.0, sy=1.0, **kw):
    """A head's pose with its middle at centre (screen texels)."""
    s = NAMES[name]
    local = (np.array(MIDDLE[name]) - np.array(s.attach)) * s.scale * np.array([sx, sy])
    pos = np.array(centre) - _rot(rot) @ local
    return dict(off=tuple(pos - np.array(s.rest)), rot=rot, sx=sx, sy=sy, **kw)


FALLEN = ("neck_carp", "carp", "neck_pierog", "pierog", "neck_block", "block")


def defeat():
    """The last hit: all three shriek. The tower's neck gives out first and the block crashes down onto the pierog's
    head (bonk); the pierog buckles under it onto the carp (bonk), and the carp goes limp, tongue out. The pipe joints
    burst, spraying slime, and the heap is sucked down the drain spinning, squeezed thin, the tower's roof last.
    Bubbles, a gurgle, a pop."""
    f = []
    f.append(pose(flash=.55, block=dict(off=(5, -5), rot=7, jaw=1.0, sy=1.05), pierog=dict(off=(6, -4), rot=9, jaw=1.0),
                  carp=dict(off=(4, -1), rot=6, jaw=1.0)))
    f.append(pose(draw=FALLEN, block=dict(off=(-1, 2), rot=-16, jaw=.8, slack=1.2, bend=(-4, 0)),
                  pierog=dict(off=(2, -2), rot=4, jaw=.9), carp=dict(off=(2, 0), rot=3, jaw=.6)))
    f.append(pose(draw=FALLEN, block=dict(off=(-1, 5), rot=-31, jaw=.6, slack=1.3, bend=(-8, 2)),
                  pierog=dict(off=(-2, 6), rot=-8, jaw=.7, sy=.9, sx=1.06), carp=dict(off=(1, 1), rot=2, jaw=.6),
                  fx=[("lines", 346, 100, 5)]))
    f.append(pose(draw=FALLEN, block=dict(off=(-3, 15), rot=-36, jaw=.5, slack=1.4, bend=(-10, 6)),
                  pierog=dict(off=(-5, 12), rot=-16, jaw=.6, slack=1.3, bend=(0, 8)),
                  carp=dict(off=(-3, 12), rot=14, jaw=.8, sy=.88, sx=1.08), fx=[("lines", 318, 168, 4)]))
    burst = [("burst", "block", 0, 1.0), ("burst", "pierog", 0, 1.0), ("burst", "carp", 0, .8)]
    f.append(pose(draw=FALLEN, block=dict(off=(-4, 24), rot=-40, jaw=.4, slack=1.5, bend=(-10, 10), width=.8),
                  pierog=dict(off=(-5, 18), rot=-22, jaw=.5, slack=1.4, bend=(0, 10), width=.8),
                  carp=dict(off=(-3, 18), rot=24, jaw=1.0, slack=1.3, width=.8), fx=burst))
    # down the drain: the heads pulled to the hole's middle, spinning, squeezed thin, the lip swallowing them
    cx = HOLE[0]
    sink = [
        dict(block=((cx + 6, 196), -40, .85, .95), pierog=((cx - 16, 210), -40, .85, .95), carp=((cx - 2, 226), 26, .85, .95)),
        dict(block=((cx + 2, 220), -10, .62, .9), pierog=((cx - 8, 236), -70, .6, .9), carp=((cx + 4, 252), 50, .6, .9)),
        dict(block=((cx, 262), 15, .45, .85), pierog=((cx - 2, 290), -100, .4, .85), carp=((cx, 300), 80, .4, .85)),
    ]
    for k, frame in enumerate(sink):
        hs = {name: _centred(name, c, rot, sx, sy, jaw=.5, slack=.7, width=.7, sink=True)
              for name, (c, rot, sx, sy) in frame.items()}
        f.append(pose(draw=FALLEN, **hs, fx=[("swirl", k / 3)]))
    gone = dict(off=(0, 260), sink=True)
    empty = dict(block=gone, pierog=gone, carp=gone)
    f.append(pose(**empty, fx=[("swirl", .9), ("bubble", cx - 4, 240, 2), ("bubble", cx + 8, 236, 1.5)]))
    f.append(pose(**empty, fx=[("bubble", cx - 6, 228, 2), ("bubble", cx + 9, 222, 1.5), ("bubble", cx, 241, 5)]))
    f.append(pose(**empty, fx=[("bubble", cx, 237, 8), ("bubble", cx - 7, 214, 1.5)]))
    f.append(pose(**empty, fx=[("pop", cx, 237, 6)]))
    return f


def _rest_middle(name):
    s = NAMES[name]
    return np.array(s.rest) + (np.array(MIDDLE[name]) - np.array(s.attach)) * s.scale


def emerge():
    """The intro: the drain gurgles, then the heads surge up out of it one by one, carp, tower, pierog, each
    overshooting before it settles, and all three roar."""
    cx, cy = HOLE[0], HOLE[1]
    hidden = dict(off=(0, 260), sink=True)

    def up(name, k, rot=0.0, overshoot=0.0, **kw):
        """k 0..1 from the hole to rest, squeezed thin coming out of the drain."""
        rest = _rest_middle(name)
        start = np.array([cx + (rest[0] - cx) * .2, cy + 30])
        centre = start + (rest - start) * k + np.array([0, -overshoot])
        sx = .6 + .4 * min(1, k * 1.3)
        sy = 1.15 - .15 * min(1, k * 1.3)
        if k >= 1:
            sx, sy = 1 + overshoot * .004, 1 + overshoot * .01
        return _centred(name, tuple(centre), rot, sx, sy, sink=k < .8, slack=.8 + .2 * k, **kw)

    return [
        pose(block=hidden, pierog=hidden, carp=hidden, fx=[("bubble", cx - 6, 240, 2), ("bubble", cx + 7, 236, 1.5)]),
        pose(block=hidden, pierog=hidden, carp=hidden, fx=[("bubble", cx, 236, 7), ("bubble", cx - 9, 226, 1.5)]),
        pose(block=hidden, pierog=hidden, carp=up("carp", .45, -18, jaw=.6), fx=[("pop", cx, 236, 7)]),
        pose(block=up("block", .3), pierog=hidden, carp=up("carp", 1.0, -6, 7, jaw=.4)),
        pose(block=up("block", .75, 4), pierog=up("pierog", .3, -10), carp=up("carp", 1.0, 2, 0, jaw=.1)),
        pose(block=up("block", 1.0, -2, 9), pierog=up("pierog", .75, -6), carp=dict()),
        pose(block=up("block", 1.0, 1, 0), pierog=up("pierog", 1.0, 4, 8, jaw=.3), carp=dict()),
        pose(block=dict(off=(2, -3), jaw=.9, sy=1.04), pierog=dict(off=(-2, -2), rot=-4, jaw=1.0),
             carp=dict(off=(-2, -1), rot=-3, jaw=1.0), fx=[("steam_head", "pierog", .3)]),
        pose(block=dict(off=(1, -1), jaw=.5), pierog=dict(off=(-1, -1), jaw=.5), carp=dict(jaw=.5)),
        pose(block=dict(jaw=.05), pierog=dict(), carp=dict()),
    ]


ANIMATIONS = {
    # name: (make, fps, loop)
    "emerge": (emerge, 10, False),
    "idle": (idle, 8, True),
    "spit-block": (spit_block, 12, False),
    "spit-pierog": (spit_pierog, 12, False),
    "spit-carp": (spit_carp, 12, False),
    "hurt": (hurt, 12, False),
    "rage-enter": (rage_enter, 10, False),
    "rage": (rage, 10, True),
    "rage-spit": (rage_spit, 12, False),
    "charge": (charge, 10, True),
    "defeat": (defeat, 10, False),
}


def render(name: str) -> list[Drawn]:
    return [draw(p) for p in _with_glints(ANIMATIONS[name][0]())]


# where each head's glint goes from its mouth: out past the front of the face, where it shows
GLINT = {"block": (-6, -4), "pierog": (-26, -4), "carp": (-7, -4)}


def _with_glints(poses):
    """("star_mouth", head) is a glint at that head's mouth: resolved here, where the mouth is known."""
    out = []
    for p in poses:
        fx = []
        for item in p.fx:
            if item[0] == "star_mouth":
                head = heads()[item[1]]
                pos = _head_place(head.spec, p.heads[item[1]], p.shift)
                m = _mouth_point(head, p.heads[item[1]], pos)
                gx, gy = GLINT[item[1]]
                fx.append(("star", m[0] + gx, m[1] + gy, 5))
            else:
                fx.append(item)
        out.append(replace(p, fx=fx))
    return out


# ---------------------------------------------------------------- what it spits

# Every projectile is drawn per frame at native size: its shape turned to that frame's angle and sampled at pixel
# centres, its colours tied to the shape (so texture turns with it), then lit on screen from the creature's light:
# the edges facing up and left catch it, the ones facing down and right go dark. No outlines.

def _shape(size, angle, inside, colour, lit=None, dark=None, extra=None, rim=1):
    """size: (w, h) canvas; inside(u, v) -> bool mask and colour(u, v) -> HxWx3 in the shape's own coordinates
    (angle degrees, clockwise on screen); lit/dark: rim colours, rim px thick; extra(u, v) -> (mask, colour) drawn after
    the rim."""
    w, h = size
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    x, y = xs + .5 - w / 2, ys + .5 - h / 2
    a = math.radians(-angle)
    u, v = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    m = inside(u, v)
    rgb = np.zeros((h, w, 3))
    rgb[m] = colour(u, v)[m]
    if lit is not None:
        pad = np.pad(m, rim)
        up_left = np.zeros_like(m)
        down_right = np.zeros_like(m)
        h_, w_ = m.shape
        for t in range(1, rim + 1):
            up_left |= ~pad[rim - t:rim - t + h_, rim:rim + w_] | ~pad[rim:rim + h_, rim - t:rim - t + w_]
            down_right |= ~pad[rim + t:rim + t + h_, rim:rim + w_] | ~pad[rim:rim + h_, rim + t:rim + t + w_]
        rgb[m & down_right] = dark
        rgb[m & up_left & ~down_right] = lit
    if extra is not None:
        em, ec = extra(u, v)
        rgb[em] = ec[em] if np.ndim(ec) == 3 else ec
        m = m | em
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = m * 255
    return out


def _texture(u, v, k=0):
    return _hash(np.floor(u + 40) * 31 + np.floor(v + 40), k)


SLAB_S = 1.75      # the slab, the fishbone, the skwarka, the radiator: drawn this much bigger than first, to read in flight
BONE_S = 2.0
SKWARKA_S = 1.7
RADIATOR_S = 1.3


def slab(angle):
    """A slab of prefab concrete wall (wielka plyta) tumbling: a window hole through it with the frame's white edge,
    a broken corner with rebar out of it, a strip of the facade's tiles along one edge, a thick lit edge."""
    S = SLAB_S
    def inside(u, v):
        u, v = u / S, v / S
        body = (np.abs(u) < 11.5) & (np.abs(v) < 8)
        bite = (u > 5) & (v < -2) & ((u - 5) + (-2 - v) > 4)
        ragged = u > 11.5 - 2.2 * _hash(np.floor(v + 9), 3)
        ragged |= v > 8 - 1.6 * _hash(np.floor(u + 13), 5)
        hole = (u > -5) & (u < 2.5) & (v > -5) & (v < 1.5)
        return body & ~bite & ~ragged & ~hole
    def colour(u, v):
        n = _texture(u, v, 7)
        u, v = u / S, v / S
        c = np.zeros(u.shape + (3,))
        c[:] = (160, 160, 152)
        c[n < .2] = (130, 130, 124)
        c[n > .9] = (186, 186, 178)
        tiles = v > 4.5
        c[tiles] = (190, 150, 98)
        c[tiles & (np.floor((u + 40) * S) % 4 == 0)] = (138, 104, 66)
        frame = (u > -6.2) & (u < 3.7) & (v > -6.2) & (v < 2.7) & ~((u > -5) & (u < 2.5) & (v > -5) & (v < 1.5))
        c[frame] = (226, 234, 236)
        return c
    def rebar(u, v):
        uu, vv = u / S, v / S
        w = .9 / S
        m = ((uu > 6) & (uu < 13.5) & (np.abs(vv + 5.5) < w)) | ((uu > 8) & (uu < 12.5) & (np.abs(vv + 2.5 - (uu - 8) * .4) < w))
        m &= ~((np.abs(uu) < 11.5) & (np.abs(vv) < 8) & ~((uu > 5) & (vv < -2) & ((uu - 5) + (-2 - vv) > 4)))
        return m, np.array([176, 86, 44], float)
    return _shape((52, 52), angle, inside, colour, (236, 234, 226), (70, 70, 70), rebar, rim=2)


def radiator(angle):
    """A cast-iron radiator (kaloryfer): five ribbed columns joined top and bottom, dark gaps between them, peeling
    cream paint, rust, a valve knob on top. It rocks in the air but stays upright, so it can't be mistaken."""
    S = RADIATOR_S
    cols = np.array([-10.0, -5.0, 0.0, 5.0, 10.0])
    def inside(u, v):
        u, v = u / S, v / S
        m = np.zeros(u.shape, bool)
        for c in cols:
            m |= (np.abs(u - c) < 2.1) & (v > -9) & (v < 8) & ~((v < -8) & (np.abs(u - c) > 1.2))
        m |= (np.abs(u) < 12) & (((v > -7.2) & (v < -4.8)) | ((v > 4.8) & (v < 7.2)))
        m |= (np.abs(np.abs(u) - 8) < 1.1) & (v >= 8) & (v < 10.5)
        m |= (np.abs(u - 11.2) < 1.3) & (v > -11.5) & (v <= -8.5)      # the valve
        m |= (np.abs(u - 11.2) < 2.2) & (v > -12.5) & (v <= -11.2)
        return m
    def colour(u, v):
        n = _texture(u, v, 13)
        u, v = u / S, v / S
        c = np.zeros(u.shape + (3,))
        near = cols[np.argmin(np.abs(u[..., None] - cols), -1)]
        du = u - near
        c[:] = (210, 202, 176)
        c[du < -.7] = (240, 234, 210)
        c[du > .7] = (156, 148, 124)
        c[n < .1] = (160, 86, 42)
        c[(n > .1) & (n < .14)] = (66, 62, 58)
        c[(np.abs(u - 11.2) < 2.3) & (v < -8.4)] = (120, 116, 110)
        return c
    return _shape((44, 44), angle, inside, colour, (250, 246, 226), (84, 76, 64), rim=1)


def skwarka(frame):
    """A crackling, sizzling: a hot glowing core, crisp brown crust round it, fat spitting off it and a wisp of smoke
    curling up from it."""
    S = SKWARKA_S
    angle = frame * 90
    def inside(u, v):
        th = np.arctan2(v, u)
        r = 1 + .22 * _hash(np.floor((th + math.pi) * 1.6), 1)
        return (u / (4.4 * S)) ** 2 + (v / (3.2 * S)) ** 2 < r * r
    def colour(u, v):
        c = np.zeros(u.shape + (3,))
        c[:] = (204, 128, 50)
        c[_texture(u, v, 4) < .3] = (132, 68, 26)
        core = (u / (2.6 * S)) ** 2 + (v / (1.8 * S)) ** 2
        c[core < 1] = (255, 176, 70)
        c[core < .45] = (255, 226, 140)
        return c
    w, h = 25, 25
    out = _shape((w, h), angle, inside, colour, (255, 214, 120), (96, 46, 18), rim=1)
    # the core glows the same way up, whatever way the crust has turned
    for k, (x, y) in enumerate(((2, 9), (22, 10), (3, 19), (21, 18), (12, 6))):
        if (k + frame) % 2 == 0:
            out[y, x] = (255, 244, 190, 255)
    for t in range(6):                      # the wisp: a curl of smoke going up, swaying frame to frame
        x = int(12 + 2 * math.sin(t * 1.1 + frame * 1.6))
        y = 6 - t
        if 0 <= y < h:
            out[y, x] = (226, 222, 214, 255) if t < 4 else (170, 166, 160, 255)
    return out


def bone(frame):
    """A fishbone (osc): the skull ahead with its eye hole, a bright pale spine, ribs swept back, the tail; it flexes."""
    S = BONE_S
    lean = (.5, .7, .5, .3)[frame]
    angle = (-5, 0, 5, 0)[frame]
    def inside(u, v):
        u, v = u / S, v / S
        spine = (np.abs(v) < .55) & (u > -6) & (u < 7.5)
        skull = (u > -10.5) & (u < -5) & (np.abs(v) < np.minimum((u + 10.5) * .6, 3.0))
        eye = (u + 7.6) ** 2 + (v + .9) ** 2 < .7
        ribs = np.zeros(u.shape, bool)
        for k in range(6):
            u0 = -4.2 + k * 1.9
            reach = 3.4 - k * .3
            ribs |= (np.abs(v) > .5) & (np.abs(v) < reach) & (np.abs(u - (u0 + np.abs(v) * lean)) < .36)
        tail = (u > 7) & (u < 10.5) & (np.abs(np.abs(v) - (u - 7) * .9) < .5)
        return (spine | skull | ribs | tail) & ~eye
    def colour(u, v):
        c = np.zeros(u.shape + (3,))
        c[:] = (238, 234, 218)
        c[np.abs(v / S) < .3] = (255, 254, 246)
        return c
    return _shape((46, 28), angle, inside, colour, (255, 255, 252), (132, 128, 116), rim=1)


def bubble(frame):
    """A big wobbling bubble: a bold bright rim, a darker arc low on the right, a faint inner ring, the window glint."""
    sx, sy = ((1.07, .94), (1.0, 1.0), (.94, 1.07), (1.0, 1.0))[frame]
    w = h = 29
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = (xs + .5 - w / 2) / sx, (ys + .5 - h / 2) / sy
    d = np.hypot(u, v)
    r = 11.5
    out = np.zeros((h, w, 4), np.uint8)
    rim = (d < r) & (d > r - 2.0)
    upper = (u + v) < 0
    out[rim & upper] = (226, 248, 255, 255)
    out[rim & ~upper] = (110, 184, 208, 255)
    arc = (d < r - 2.0) & (d > r - 3.2) & (u + v > 7)
    out[arc] = (70, 130, 154, 255)
    inner = (d < r - 4.6) & (d > r - 5.4) & (u + v < -8)
    out[inner] = (170, 220, 236, 255)
    glint = ((u + 4.8) ** 2 + (v + 4.8) ** 2 < 4.2) | ((u + 1) ** 2 + (v + 7.6) ** 2 < 1.0)
    out[glint] = (255, 255, 255, 255)
    return out


def bubble_pop(frame):
    w = h = 35
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = xs + .5 - w / 2, ys + .5 - h / 2
    d, th = np.hypot(u, v), np.arctan2(v, u)
    out = np.zeros((h, w, 4), np.uint8)
    r = (12.5, 14.5, 16.5)[frame]
    seg = _hash(np.floor((th + math.pi) * 2.2), 7) > .45
    if frame < 2:
        out[(d < r) & (d > r - 2.0) & seg] = (226, 248, 255, 255)
    for k in range(8):
        a = k * math.tau / 8 + .3
        rr = r - 2 + frame * 2.5
        x, y = int(w / 2 + rr * math.cos(a)), int(h / 2 + rr * math.sin(a))
        if 0 <= x < w and 0 <= y < h:
            out[y, x] = (150, 200, 220, 255) if frame else (214, 242, 250, 255)
    return out


def smietana(frame):
    """A glob of sour cream, lobbed: white, wobbling, a curl on top."""
    angle = (0, 18, 0, -18)[frame]
    sq = (1.0, 1.08, 1.0, .93)[frame]
    S = 1.4
    def inside(u, v):
        u, v = u / S, v / S
        blob = (u / (5.2 * sq)) ** 2 + (v / (4.0 / sq)) ** 2 < 1
        curl = ((u + .8) ** 2 + (v + 4.4) ** 2 < 1.8) | ((u - .6) ** 2 + (v + 5.6) ** 2 < .7)
        return blob | curl
    def colour(u, v):
        u, v = u / S, v / S
        c = np.zeros(u.shape + (3,))
        c[:] = (240, 236, 222)
        c[(u + v) > 3] = (210, 204, 190)
        c[(u + 2.4) ** 2 + (v + 1.6) ** 2 < 1.4] = (255, 255, 255)
        return c
    return _shape((23, 23), angle, inside, colour, (255, 255, 250), (166, 160, 146), rim=1)


def puddle(frame):
    """Where the sour cream lands: a splat spreading (frames 0-2), then lying there, its sheen shifting (3-4)."""
    w, h = 42, 9
    width = (16, 28, 36, 36, 36)[frame]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = xs + .5 - w / 2, ys + .5 - 6.5
    out = np.zeros((h, w, 4), np.uint8)
    body = (u / (width / 2)) ** 2 + (v / 2.6) ** 2 < 1
    body &= v > -2.2
    out[body] = (238, 234, 220, 255)
    out[body & (v > 1.2)] = (196, 190, 176, 255)
    out[body & (v < -1.2)] = (255, 255, 250, 255)
    if frame >= 3:
        for k in range(3):
            x = int(w / 2 - width / 3 + k * width / 3 + (frame - 3) * 3)
            out[6, min(w - 1, max(0, x))] = (255, 255, 255, 255)
    else:
        for k, x in enumerate((-1, 1)):
            dx = int(w / 2 + x * (width / 2 + 2 + frame))
            dy = 3 - frame
            if 0 <= dx < w and 0 <= dy < h:
                out[dy, dx] = (238, 234, 220, 255)
    return out


def mark(frame):
    """Where the sour cream will land: a dashed red-and-white ring on the floor."""
    w, h = 26, 9
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = xs + .5 - w / 2, ys + .5 - 6.5
    rx, ry = (11, 9)[frame], (2.6, 2.1)[frame]
    d = (u / rx) ** 2 + (v / ry) ** 2
    ring = (d < 1) & (d > .45)
    th = np.arctan2(v / ry, u / rx)
    dash = np.floor((th + math.pi) * 3) % 2 == 0
    out = np.zeros((h, w, 4), np.uint8)
    out[ring & dash] = (232, 60, 48, 255)
    out[ring & ~dash] = (255, 240, 230, 255)
    return out


def spark(frame):
    """A bullet glancing off the radiator."""
    w = h = 15
    out = np.zeros((h, w, 4), np.uint8)
    length = (3, 6, 4)[frame]
    for k, a in enumerate((-150, -100, -60, 160, 120, -20)):
        r = math.radians(a)
        for t in range(1 + frame, length + 1):
            x, y = int(7.5 + t * math.cos(r)), int(7.5 + t * math.sin(r))
            if 0 <= x < w and 0 <= y < h:
                out[y, x] = (255, 255, 230, 255) if t < length else (255, 190, 80, 255)
    if frame < 2:
        out[6:9, 6:9] = (255, 250, 210, 255)
    return out


# name: (frames, fps, loop, pivot): pivots are the middle, but the puddle's and the mark's sit on the floor
PROJECTILES = {
    "slab": ([slab(-k * 30) for k in range(12)], 8, True, (.5, .5)),
    "radiator": ([radiator(14 * math.sin(k / 8 * math.tau)) for k in range(8)], 8, True, (.5, .5)),
    "skwarka": ([skwarka(k) for k in range(4)], 12, True, (.5, .5)),
    "bone": ([bone(k) for k in range(4)], 12, True, (.5, .5)),
    "bubble": ([bubble(k) for k in range(4)], 6, True, (.5, .5)),
    "bubble-pop": ([bubble_pop(k) for k in range(3)], 16, False, (.5, .5)),
    "smietana": ([smietana(k) for k in range(4)], 10, True, (.5, .5)),
    "puddle": ([puddle(k) for k in range(5)], 12, False, (.5, 6.5 / 9)),
    "mark": ([mark(k) for k in range(2)], 6, True, (.5, 6.5 / 9)),
    "spark": ([spark(k) for k in range(3)], 20, False, (.5, .5)),
}


# ---------------------------------------------------------------- the solo fight's frames

# The solo fight (ZlewiatanSoloFight) knocks the heads off one at a time. It needs the creature with two heads and with
# one (a gone head's neck pulled down into the drain with it), those heads ducking into the drain and rising out of it
# again (`rise-*`, played backwards to duck), a pale frame for a hit, the empty drain gurgling at the end, and each head
# on its own, off its neck: the block and the pierog rolling, the carp flopping. All of it from the same heads, necks
# and drain as the frames above, which stay exactly as they were (a match still plays them).

SETS = {"bp": ("block", "pierog"), "bc": ("block", "carp"), "pc": ("pierog", "carp"),
        "b": ("block",), "p": ("pierog",), "c": ("carp",)}
HIDDEN = dict(off=(0.0, 260.0), sink=True)
# Where the heads left sit, texels from their rest: with the carp gone the pierog drops into its place, so each lane has
# a head to shoot; the last head moves to the middle, where it fills both lanes
SHIFT = {"bp": {"pierog": (-2.0, 61.0)}, "b": {"block": (0.0, 30.0)}, "p": {"pierog": (0.0, 14.0)}, "c": {"carp": (0.0, -48.0)}}


def _shift(key: str, name: str) -> np.ndarray:
    return np.array(SHIFT.get(key, {}).get(name, (0.0, 0.0)))


def _only(poses, keep, key="", upto=None):
    """The same poses with every head not in `keep` gone down the drain, and whatever it did with it; the heads kept
    moved to where set `key` has them (on the first `upto` poses, when the rest are placed on their own)."""
    out = []
    for i, p in enumerate(poses):
        hs = {}
        for n in ORDER:
            if n not in keep:
                hs[n] = replace(HP(), **HIDDEN)
                continue
            d = _shift(key, n) if upto is None or i < upto else np.zeros(2)
            hs[n] = replace(p.heads[n], off=tuple(np.array(p.heads[n].off) + d))
        fx = [item for item in p.fx if not (len(item) > 1 and item[1] in ORDER and item[1] not in keep)]
        out.append(replace(p, heads=hs, fx=fx, fire=tuple(h for h in p.fire if h in keep)))
    return out


def _rise(keep, key=""):
    """The heads left surge back up out of the drain, one a frame behind the other, overshoot and settle."""
    cx, cy = HOLE[0], HOLE[1]
    seq = [0.0, .4, .8, 1.0, 1.0, 1.0, 1.0, 1.0]
    over = [0, 0, 0, 8, 2, 0, 0, 0]

    def up(name, f):
        k = seq[min(len(seq) - 1, max(0, f))]
        if k <= 0:
            return dict(HIDDEN)
        rest = _rest_middle(name) + _shift(key, name)
        start = np.array([cx + (rest[0] - cx) * .2, cy + 30])
        o = over[min(len(over) - 1, max(0, f))] if k >= 1 else 0
        centre = start + (rest - start) * k + np.array([0, -o])
        sx, sy = .6 + .4 * min(1, k * 1.3), 1.15 - .15 * min(1, k * 1.3)
        if k >= 1:
            sx, sy = 1 + o * .004, 1 + o * .01
        return _centred(name, tuple(centre), 0.0, sx, sy, sink=k < .8, slack=.8 + .2 * k, jaw=.5 if 0 < o else 0.0)

    frames = []
    for f in range(8):
        hs = {name: dict(HIDDEN) for name in ORDER}
        hs.update({name: up(name, f - j) for j, name in enumerate(keep)})
        fx = [("bubble", cx - 6, 240, 2), ("bubble", cx + 7, 236, 1.5)] if f < 2 else []
        frames.append(pose(fx=fx, **hs))
    return frames


def _flash(keep, key=""):
    return [replace(_only(idle(), keep, key)[0], flash=.6)]


SOLO = {"flash-bpc": (lambda: _flash(ORDER), 12, False),
        "drain": (lambda: defeat()[8:], 10, False)}
for _set, _keep in SETS.items():
    SOLO[f"idle-{_set}"] = ((lambda k=_keep, s=_set: _only(idle(), k, s)), 8, True)
    for _head in _keep:
        SOLO[f"spit-{_head}-{_set}"] = ((lambda k=_keep, h=_head, s=_set: _only(ANIMATIONS[f"spit-{h}"][0](), k, s)), 12, False)
    SOLO[f"flash-{_set}"] = ((lambda k=_keep, s=_set: _flash(k, s)), 12, False)
    SOLO[f"rise-{_set}"] = ((lambda k=_keep, s=_set: _rise(k, s)), 14, False)
    if len(_keep) == 1:
        # The last head goes down with the creature: the old defeat, its shriek and crash from where it sits, then
        # sucked down the drain spinning, bubbles and a pop
        SOLO[f"defeat-{_set}"] = ((lambda k=_keep, s=_set: _only(defeat(), k, s, upto=5)), 10, False)
ANIMATIONS.update(SOLO)

LOOSE_CELL = 80
# Off its neck a head is fought on one lane, so it is drawn about 45 texels tall (the lanes are 68 apart): the tower
# block at under half its size on the body, the others a little over half. The puff it pops off in hides the change.
LOOSE_SCALE = {"block": .46, "pierog": .6, "carp": .55}


def _loose(name, rot, jaw=0.0, sx=1.0, sy=1.0) -> np.ndarray:
    """One head off its neck, turned `rot` degrees clockwise about its middle, on a square cell centred on it."""
    head = heads()[name]
    centre = (X0 + CW / 2, Y0 + CH / 2)
    k = LOOSE_SCALE[name]
    hp = replace(HP(), **_centred(name, centre, rot, sx * k, sy * k, jaw=jaw))
    layer, _, _ = _head_layer(head, hp, _head_place(head.spec, hp, (0.0, 0.0)))
    x0, y0 = int(CW / 2 - LOOSE_CELL / 2), int(CH / 2 - LOOSE_CELL / 2)
    out = layer[y0:y0 + LOOSE_CELL, x0:x0 + LOOSE_CELL].copy()
    out[out[..., 3] < 128] = 0
    return out


# Rolling left at the roach turns them anticlockwise; the carp flops instead, its mouth gasping
# The pierog's boomerang: a little pieróg spinning (its own face, a third of its size on the body)
PROJECTILES["pierogi"] = ([_loose("pierog", -k * 45, jaw=.4, sx=.55, sy=.55) for k in range(8)], 16, True, (.5, .5))
PROJECTILES["roll-block"] = ([_loose("block", -k * 45) for k in range(8)], 12, True, (.5, .5))
PROJECTILES["roll-pierog"] = ([_loose("pierog", -k * 45, jaw=.35) for k in range(8)], 14, True, (.5, .5))
PROJECTILES["flop-carp"] = ([_loose("carp", 38 * math.sin(k / 8 * math.tau), jaw=.5 + .5 * math.sin(k / 8 * math.tau * 2),
                                   sx=1 + .06 * math.cos(k / 8 * math.tau * 2), sy=1 - .06 * math.cos(k / 8 * math.tau * 2))
                             for k in range(8)], 16, True, (.5, .5))


def projectiles_sheet(path: Path) -> None:
    zoom = 6
    rows = list(PROJECTILES.items())
    cw = max(f[0].shape[1] for f, *_ in PROJECTILES.values())
    chh = max(f[0].shape[0] for f, *_ in PROJECTILES.values())
    width = 110 + max(len(f) for f, *_ in PROJECTILES.values()) * (cw * zoom + 6)
    sheet = Image.new("RGBA", (width, len(rows) * (chh * zoom + 8)), (30, 32, 38, 255))
    d = ImageDraw.Draw(sheet)
    for r, (name, (frames, fps, loop, _)) in enumerate(rows):
        y = r * (chh * zoom + 8)
        d.text((4, y + 4), f"{name}\n{fps} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        for i, fr in enumerate(frames):
            tile = Image.new("RGBA", (fr.shape[1], fr.shape[0]), BG)
            tile.alpha_composite(Image.fromarray(fr))
            sheet.alpha_composite(tile.resize((fr.shape[1] * zoom, fr.shape[0] * zoom), Image.NEAREST),
                                  (110 + i * (cw * zoom + 6), y))
    # and at 1x, on the game's own dark, as they'd read
    sheet.save(path)


# ---------------------------------------------------------------- previews

BG = (52, 56, 66, 255)
LANE = (84, 92, 104, 255)
HOLD_MS = {"spit-block": 250, "spit-pierog": 250, "spit-carp": 250, "hurt": 150, "rage-enter": 120, "rage-spit": 200,
           "defeat": 1200}


def _crop_box(frames) -> tuple:
    box = [CW, CH, 0, 0]
    for d in frames:
        b = d.image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
        if b:
            box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    return (box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 1)


def _staged(image: Image.Image, box, zoom, left=0, lanes=True) -> Image.Image:
    """On the mid-dark ground, the two floors and the two lanes' shot heights marked faintly; left: room to the left
    for shots to fly."""
    w, h = box[2] - box[0] + left, box[3] - box[1]
    out = Image.new("RGBA", (w, h), BG)
    if lanes:
        d = ImageDraw.Draw(out)
        for y in (TOP_FLOOR, BOTTOM_FLOOR):
            yy = y - Y0 - box[1]
            d.line([(0, yy), (w, yy)], fill=LANE)
        for y in (TOP_LANE, BOTTOM_LANE):
            yy = round(y - Y0 - box[1])
            for x in range(0, w, 4):
                d.point((x, yy), fill=LANE)
    out.alpha_composite(image.crop(box), (left, 0))
    return out.resize((w * zoom, h * zoom), Image.NEAREST)


def _gif(path, images, durations):
    images[0].save(path, save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2,
                   optimize=False)


def _projectile(name, t: int) -> Image.Image:
    frames = PROJECTILES[name][0]
    return Image.fromarray(frames[t % len(frames)])


# what each head spits in the previews: kind, how many in a row, speed against today's, texels apart
SHOTS = {"block": ("slab", 1, .8, 0), "pierog": ("skwarka", 3, 1.1, 13), "carp": ("bone", 1, 1.2, 0)}


def _launch(shots, head, mx, my, lane_y, rage=False):
    kind, count, speed, gap = ("radiator", 1, .8, 0) if rage else SHOTS[head]
    for k in range(count):
        shots.append([mx + k * gap, my, lane_y, kind, speed])


def previews(out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    rendered = {name: render(name) for name in ANIMATIONS}
    failures = [f"{name}[{i}] {f}" for name, frames in rendered.items() for i, d in enumerate(frames) for f in d.failures]
    box = _crop_box([d for frames in rendered.values() for d in frames])
    for name, frames in rendered.items():
        _, fps, loop = ANIMATIONS[name]
        step = round(1000 / fps)
        images = [_staged(d.image, box, 4) for d in frames]
        durations = [step] * len(images)
        if loop:
            images, durations = images * 3, durations * 3
        else:
            durations[-1] = HOLD_MS.get(name, 300)
        _gif(out / f"{name}.gif", images, durations)
    _sheet(out / "sheet.png", rendered, box)
    _fight(out / "fight.gif", rendered, box)
    pivot = (CONTAINER[0] - X0 - box[0], CONTAINER[1] - Y0 - box[1])
    anchors = {}
    for name, frames in rendered.items():
        anchors[name] = [{**{h: [round(d.mouths[h][0] - X0 - box[0], 1), round(d.mouths[h][1] - Y0 - box[1], 1)]
                             for h in ORDER}, "fire": list(p.fire)}
                         for d, p in zip(frames, ANIMATIONS[name][0]())]
    cell = (box[2] - box[0], box[3] - box[1])
    (out / "anchors.json").write_text(json.dumps({"cell": cell, "pivot": pivot, "fps": {n: a[1] for n, a in ANIMATIONS.items()},
                                                  "mouths": anchors}, indent=1))
    (out / "box.txt").write_text(f"canvas box {box} cell {cell} pivot (the boss container's point) {pivot}\n")
    _cells(out / "cells", rendered, box)
    projectiles_sheet(out / "projectiles.png")
    return failures


def _cells(path: Path, rendered, box):
    path.mkdir(exist_ok=True)
    for name, frames in rendered.items():
        for i, d in enumerate(frames):
            d.image.crop(box).save(path / f"{name}-{i}.png")


def _sheet(path, rendered, box):
    cell = (box[2] - box[0], box[3] - box[1])
    zoom = 2
    rows = list(rendered.items())
    width = max(len(f) for _, f in rows) * (cell[0] * zoom + 4) + 90
    sheet = Image.new("RGBA", (width, len(rows) * (cell[1] * zoom + 14)), (30, 32, 38, 255))
    d = ImageDraw.Draw(sheet)
    for r, (name, frames) in enumerate(rows):
        y = r * (cell[1] * zoom + 14)
        d.text((4, y + 4), f"{name}\n{ANIMATIONS[name][1]} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        poses = ANIMATIONS[name][0]()
        for i, fr in enumerate(frames):
            x = 90 + i * (cell[0] * zoom + 4)
            sheet.alpha_composite(_staged(fr.image, box, zoom), (x, y))
            bad = " !" if fr.failures else ""
            fire = " fire:" + ",".join(poses[i].fire) if poses[i].fire else ""
            d.text((x + 2, y + cell[1] * zoom + 1), f"{i}{bad}{fire}",
                   fill=(255, 120, 120, 255) if bad else (160, 160, 160, 255))
    sheet.save(path)


def _fight(path, rendered, box):
    """idle, spit-block, idle, spit-carp, spit-pierog, hurt, rage (enter, loop), rage-spit, idle, charge, hurt, defeat:
    the shots fly out of the mouths and along their lanes."""
    zoom, left = 3, 150
    shots = []        # [x, y, lane y, kind, speed]
    seq, durs = [], []
    lanes = {"block": TOP_LANE, "carp": BOTTOM_LANE}
    count = [0]
    shift = [0.0]

    def frame_image(d: Drawn, ms: float):
        img = Image.new("RGBA", (box[2] - box[0] + left, box[3] - box[1]), (0, 0, 0, 0))
        img.alpha_composite(d.image.crop(box), (left, 0))
        if shift[0]:
            moved = Image.new("RGBA", img.size, (0, 0, 0, 0))
            moved.alpha_composite(img, (int(round(shift[0])), 0))
            img = moved
        for s in shots:
            s[0] -= 150 * s[4] * ms / 1000            # 300 world px/s, times the kind's own speed
            s[1] += (s[2] - s[1]) * min(1, ms / 140)
            im = _projectile(s[3], count[0])
            x = s[0] - X0 - box[0] + left - im.width / 2
            y = s[1] - Y0 - box[1] - im.height / 2
            img.alpha_composite(im, (int(round(x)), int(round(y))))
        shots[:] = [s for s in shots if s[0] - X0 - box[0] + left > -40]
        bg = _staged(Image.new("RGBA", (CW, CH)), box, 1, left)
        bg.alpha_composite(img)
        return bg.resize((bg.width * zoom, bg.height * zoom), Image.NEAREST)

    def play(name, times=1, hold=None, lane_for_pierog="top", rage_lane="top"):
        _, fps, _ = ANIMATIONS[name]
        poses = ANIMATIONS[name][0]()
        ms = 1000 / fps
        for _ in range(times):
            for i, fr in enumerate(rendered[name]):
                for h in poses[i].fire:
                    mx, my = fr.mouths[h]
                    mx += shift[0]
                    if name == "rage-spit":
                        if h == "block":
                            _launch(shots, h, mx, my, TOP_LANE if rage_lane == "top" else BOTTOM_LANE, rage=True)
                        continue
                    _launch(shots, h, mx, my, lanes.get(h, TOP_LANE if lane_for_pierog == "top" else BOTTOM_LANE))
                count[0] += 1
                seq.append(frame_image(fr, ms))
                durs.append(round(ms))
        if hold:
            durs[-1] = hold

    play("idle")
    play("spit-block")
    play("idle")
    play("spit-carp")
    play("spit-pierog", lane_for_pierog="bottom")
    play("idle")
    play("hurt")
    play("rage-enter")
    play("rage", 2)
    play("rage-spit", rage_lane="bottom")
    play("rage", 1)
    play("rage-spit", rage_lane="top")
    play("idle")
    for _ in range(3):
        shift[0] -= 4
        play("charge")
    play("hurt")
    play("defeat", hold=1500)
    _gif(path, seq, durs)


SCREEN_PX = 720 / 256          # screenshot px per texel: the 1280x720 captures show the 256 texel tall world


def ingame(out: Path, shots: Path) -> None:
    """Key frames at true scale over a real fight capture, next to today's: the old floating heads painted out with
    the same spot from before the boss came in, the roach where it stands in the fight."""
    today = Image.open(shots / "03-aim-bottom.png").convert("RGBA")
    before = Image.open(shots / "01-rear.png").convert("RGBA")
    clean = today.copy()
    clean.paste(before.crop((940, 100, 1280, 662)), (940, 100))

    def over(d: Drawn, shots_in_air=()) -> Image.Image:
        img = clean.copy()
        big = d.image.resize((round(CW * SCREEN_PX), round(CH * SCREEN_PX)), Image.NEAREST)
        img.alpha_composite(big, (round(X0 * SCREEN_PX), round(Y0 * SCREEN_PX)))
        for x, y, im in shots_in_air:
            b = im.resize((round(im.width * SCREEN_PX), round(im.height * SCREEN_PX)), Image.NEAREST)
            img.alpha_composite(b, (round(x * SCREEN_PX - b.width / 2), round(y * SCREEN_PX - b.height / 2)))
        return img

    keys = [("today", None), ("idle", render("idle")[0]), ("spit-block release", render("spit-block")[2]),
            ("spit-carp release", render("spit-carp")[2]), ("rage", render("rage")[0]),
            ("charge", render("charge")[1])]
    w, h = today.size
    half = (w // 2, h // 2)
    sheet = Image.new("RGBA", (half[0] * 2 + 8, (half[1] + 8) * 3), (20, 20, 24, 255))
    d = ImageDraw.Draw(sheet)
    for k, (label, fr) in enumerate(keys):
        img = today if fr is None else over(fr)
        x, y = (k % 2) * (half[0] + 8), (k // 2) * (half[1] + 8)
        sheet.alpha_composite(img.resize(half, Image.LANCZOS), (x, y))
        d.text((x + 8, y + 8), label, fill=(255, 255, 0, 255))
    sheet.save(out / "ingame.png")
    over(render("idle")[0]).save(out / "ingame-idle-full.png")
    today.save(out / "ingame-today-full.png")

    lanes = {"block": TOP_LANE, "carp": BOTTOM_LANE, "pierog": BOTTOM_LANE}
    flying, seq, durs = [], [], []
    for name in ("idle", "spit-block", "idle", "spit-carp", "spit-pierog", "idle", "hurt", "rage-enter", "rage",
                 "rage-spit", "rage", "charge", "charge", "defeat"):
        _, fps, _ = ANIMATIONS[name]
        poses = ANIMATIONS[name][0]()
        for i, fr in enumerate(render(name)):
            for head in poses[i].fire:
                if name == "rage-spit" and head != "block":
                    continue
                _launch(flying, head, *fr.mouths[head], lanes[head], rage=name == "rage-spit")
            for s in flying:
                s[0] -= 150 * s[4] / fps
                s[1] += (s[2] - s[1]) * min(1, 1000 / fps / 140)
            flying[:] = [s for s in flying if s[0] > -20]
            tick = len(seq)
            seq.append(over(fr, [(s[0], s[1], _projectile(s[3], tick)) for s in flying]).convert("RGB")
                       .resize((960, 540), Image.NEAREST))
            durs.append(round(1000 / fps))
    durs[-1] = 1500
    seq[0].save(out / "ingame.gif", save_all=True, append_images=seq[1:], duration=durs, loop=0, optimize=False)


if __name__ == "__main__":
    problems = previews(Path(sys.argv[1]))
    if len(sys.argv) > 2:
        ingame(Path(sys.argv[1]), Path(sys.argv[2]))
    print("\n".join(problems) if problems else "every neck holds its head and reaches the hole, every frame in one piece")
    sys.exit(1 if problems else 0)
