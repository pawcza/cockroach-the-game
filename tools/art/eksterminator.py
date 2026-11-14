"""Eksterminator, the last boss: the owner's still (art/sprites/bosses/eksterminator-figure) cut into parts and posed per frame.

Built like lodzia.py and on its shared pieces (bossrig.py). The render is pixel art on the same exact 8 px grid, so it
is read at that grid: 128 native px, one painted pixel per game texel. He stands 122 native px from the top of his
mask to his soles, a fifth taller than Lodzia: any other size resamples the painting, and the last boss may loom.

Parts: head (gas mask and its filter), body (overalls; it bends at the hips, squashes and breathes as one warped
piece), the near arm (the big puffed sleeve, forearm and glove; it turns at the shoulder), the tank with its strap
loop (riding his back, it bobs and swells), both legs, and the nozzle. The wand's pole and the hose are drawn per frame
in the painting's own colours: the pole between the nozzle and the wand's back end, the hose as a hanging curve of
fixed length between the wand's back end and the tank's outlet, so neither can ever come apart. The far arm, hidden
behind him in the painting, is drawn per frame in the overalls' cloth when it throws. Everything behind a cut part is
filled from the paint round it, and the painted rim light is put back per frame on the edges facing ahead, as in
lodzia.py.

Every frame is checked: each joint lies on both parts it joins (the hose on the wand and on the tank), and the figure
is one connected piece. `python3 tools/art/eksterminator.py OUT_DIR` writes the previews.
"""
import math
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ni

sys.path.insert(0, str(Path(__file__).parent))
import bossrig as br  # noqa: E402
from bossrig import K, Part, poly, rot, smooth  # noqa: E402
from rig import cut_white  # noqa: E402

SOURCE = "art/sprites/bosses/eksterminator-figure.png"
FLOOR = 126            # the first row under his soles, painting px
OX, OY = 56, 30        # where the painting's (0, 0) sits on the canvas, native px
CANVAS = br.Canvas(OX, OY, 216, 166)

# Joints, painting px
HIP = (76.0, 96.0)           # the body bends about this point
NECK = (70.0, 30.0)
SHOULDER = (87.0, 34.0)      # the near arm turns here, at the top of the puffed sleeve
GRIP = (51.0, 68.5)          # where the glove closes on the wand
BACK = (94.0, 34.0)          # where the tank rides his back, under the straps
LEG_HIPS = {"leg_near": (64.0, 88.0), "leg_far": (90.0, 88.0)}

# The wand: its line in the painting, the nozzle's neck and the back end where the hose goes on
NECK_N = (17.0, 57.5)
REAR = (72.0, 75.5)
TANK_OUT = (110.0, 73.0)     # where the hose leaves the tank's bracket, pointing down
HOSE = [(72, 76), (80, 82), (88, 86), (98, 88), (108, 88), (112, 84), (112, 77)]

# Cut lines, painting px
HEAD = [(50, 0), (72, 0), (83, 3), (85, 12), (84, 21), (79, 27), (74, 31), (68, 35), (62, 39), (52, 40), (45, 37),
        (43, 30), (47, 22), (49, 10)]
ARM = [(75, 31), (80, 28), (87, 26), (95, 28), (100, 35), (101, 48), (100, 60), (97, 67), (88, 71), (80, 75),
       (74, 77), (68, 74), (64.5, 77), (62.5, 80.5), (55, 80.5), (52, 75), (45, 73.5), (42, 69), (43, 63.5), (48, 62),
       (54, 58), (58, 55.5), (65, 56), (70, 58.5), (74, 58), (74.5, 40)]
NOZZLE = [(2, 46), (20, 46), (20, 62), (2, 62)]
TANK = [(85, 1), (98, 1), (108, 4), (115, 12), (115, 23), (119, 24), (124, 32), (124, 52), (120, 62), (124, 64),
        (125, 77), (100, 78), (97, 70), (97, 30), (86, 27)]
TANK_FULL = [(88, 4), (98, 4), (106, 8), (111, 16), (112, 30), (111, 70), (100, 76), (86, 74), (81, 66), (80, 30),
             (84, 26), (86, 12)]
BODY_FULL = [(58, 34), (64, 30), (74, 27), (86, 25), (97, 29), (101, 40), (101, 64), (103, 78), (102, 96), (56, 96),
             (55, 84), (58, 74), (57, 60)]

LENS = (61.5, 19.5, 3.4)     # the mask's eye glass: centre and radius
FILTER = (49.0, 37.0)        # the mouth of the mask's filter, where his breath comes out
TANK_C = (100.0, 40.0)       # the tank swells about its middle
CLIP = (102.0, 9.0)          # the spare canister clipped on the tank's shoulder (its base)
FAR_SHOULDER = (90.0, 33.0)  # the far arm, hidden behind him in the painting
UPPER, FORE = 21.0, 21.0
UPPER_W, FORE_W = 9.0, 8.0
TEX = (88.0, 40.0)           # where the drawn sleeve takes its cloth: the near sleeve's puffed side

NAVY = np.array([16, 18, 30])
GAS = [(226, 255, 150, 255), (170, 232, 70, 255), (112, 190, 52, 255), (62, 132, 54, 255)]   # light to dark
FUME = [(176, 206, 120, 255), (132, 170, 92, 255), (96, 132, 76, 255), (70, 100, 66, 255)]   # his gas, out of the tank
SMOKE = [(214, 232, 196, 255), (166, 196, 150, 255), (118, 150, 112, 255)]


@dataclass
class Rig:
    native: np.ndarray
    palette: np.ndarray
    parts: dict
    hose_len: float
    pole: tuple            # (core, light) colours of the wand's pole
    hose: tuple            # (core, light) colours of the hose
    cloth: np.ndarray      # the overalls' cloth at 8x, for the drawn far arm
    lens: np.ndarray       # the mask's eye glass, painting px
    glove: tuple = ()      # the gloves' brown rubber


def _line_dist(points, xs, ys):
    """Distance from each pixel centre to a polyline."""
    best = np.full(xs.shape, np.inf)
    for (x0, y0), (x1, y1) in zip(points[:-1], points[1:]):
        d = np.array([x1 - x0, y1 - y0], float)
        length = np.hypot(*d)
        u = np.clip(((xs - x0) * d[0] + (ys - y0) * d[1]) / length ** 2, 0, 1)
        best = np.minimum(best, np.hypot(xs - (x0 + u * d[0]), ys - (y0 + u * d[1])))
    return best


def _rim_of(native, mask) -> tuple:
    """A part's painted rim colour, for a part that keeps its painted rim (it never turns far enough to carry it
    round to its dark side)."""
    px = native[mask & br.is_rim(native[..., :3])][:, :3]
    if not len(px):
        return (236, 120, 80, 255)
    return tuple(int(v) for v in np.median(px, 0)) + (255,)


def _keep_big(mask, least=3):
    """A cut without the loose specks the cut line leaves."""
    from scipy import ndimage as ni
    labels, count = ni.label(mask, structure=np.ones((3, 3)))
    sizes = ni.sum(mask, labels, range(1, count + 1))
    return np.isin(labels, [i + 1 for i, v in enumerate(sizes) if v >= least])


def build(source: str = SOURCE) -> Rig:
    full = cut_white(source, erode=1)
    native = full[K // 2::K, K // 2::K].copy()
    white = native[..., :3].min(2) > 225
    native[white, 3] = 0                                      # the holes inside the hose loops and under his arm
    solid = native[..., 3] > 128
    ys, xs = np.mgrid[0:128, 0:128] + .5
    pal = br.palette(native[solid][:, :3])
    dark = native[..., :3].astype(int).sum(2) < 170
    warm = native[..., 0].astype(int) - native[..., 2].astype(int) > 40

    nozzle = poly(NOZZLE) & solid
    pole_d = _line_dist([NECK_N, REAR], xs, ys)
    pole_px = solid & ~poly(NOZZLE) & (((pole_d < 3.6) & (xs < 44)) | ((pole_d < 2.0) & (xs > 55)))
    hose_d = _line_dist(HOSE, xs, ys)
    hose_px = solid & (((hose_d < 2.2) & dark) | ((hose_d < 2.8) & (xs > 109)))
    head = poly(HEAD) & solid
    ahead = solid & (xs < 56) & (ys > 55) & (ys < 77) & ~nozzle & ~pole_px   # glove and wand bits ahead of his chest
    arm = _keep_big((poly(ARM) | ahead) & solid & ~pole_px & ~head)
    tank = _keep_big(poly(TANK) & solid & ~head & ~arm & ~hose_px)
    legs = solid & (ys >= 94) & ~hose_px & ~arm
    near = legs & (xs < 79)
    far = legs & ~near
    body = _keep_big(solid & ~nozzle & ~head & ~arm & ~tank & ~legs & ~pole_px & ~hose_px
                     & ~((xs > 101) & (ys > 77)), 20)                    # not the hose's fringe behind his hip

    rigx = Rig(native, pal, {}, 0.0, (), (), None, None)

    def cut(mask, fill=None, known=None, strip=True) -> Part:
        rgba = native.copy()
        rgba[~mask, 3] = 0
        if strip:
            rgba, rim, rim_px = br.strip(native, rgba, mask, pal)
        else:
            rim, rim_px = _rim_of(native, mask), np.zeros_like(mask)
        if fill is not None and fill.any():
            rgba = br.fill(rgba, (mask if known is None else known) & ~fill & ~rim_px, fill, pal)
        keep = mask | (fill if fill is not None else False)
        rgba[~keep, 3] = 0
        return Part("", rgba, rim=rim)

    def leg(mask, top, strip=True) -> Part:
        """A leg and its boot, its trouser carried up under the body so it never shows a gap when the body lifts or
        the leg turns."""
        part = cut(mask) if strip else Part("", np.where(mask[..., None], native, 0).astype(np.uint8))
        img = part.image
        cols = np.nonzero(img[top, :, 3] > 128)[0]
        for y in range(top - 12, top):
            img[y, cols] = img[top, cols]
        return part

    tank_fill = poly(TANK_FULL) & ~tank & solid
    body_fill = poly(BODY_FULL) & solid & ~body & ~tank & ~legs & ~nozzle
    rigx.parts = {
        "head": Part("head", np.where(head[..., None], native, 0).astype(np.uint8), rim=_rim_of(native, head)),
        "arm": cut(arm),
        "nozzle": cut(nozzle),
        "tank": cut(tank, fill=tank_fill, known=tank & ~warm, strip=False),  # filled from its steel, not its rims
        "leg_near": leg(near, 94),
        "leg_far": leg(far, 94, strip=False),
    }
    body_rgba = native.copy()
    body_rgba[~body, 3] = 0
    body_rgba = br.fill(body_rgba, body & ~br.is_rim(native[..., :3]), body_fill, pal)  # from the cloth, not its rim
    body_rgba[~(body | body_fill), 3] = 0
    rigx.parts["body"] = Part("body", body_rgba, rim=_rim_of(native, body))
    for name, part in rigx.parts.items():
        part.name = name
        part.big = br.big(part.image)

    def two_tone(mask):
        px = native[mask][:, :3].astype(int)
        order = np.argsort(px.sum(1))
        return tuple(int(v) for v in px[order[len(order) // 4]]), tuple(int(v) for v in px[order[int(len(order) * .9)]])
    rigx.pole = two_tone(pole_px & dark)
    rigx.hose = two_tone(hose_px)
    rigx.hose_len = sum(math.dist(a, b) for a, b in zip(HOSE[:-1], HOSE[1:]))
    rigx.cloth = br.big(native)
    rigx.lens = np.hypot(xs - LENS[0], ys - LENS[1]) < LENS[2]
    rigx.glove = tuple(int(v) for v in np.median(native[54:60, 76:84][..., :3].reshape(-1, 3), 0))
    return rigx


RIG = None


def rig() -> Rig:
    global RIG
    if RIG is None:
        RIG = build()
    return RIG


# ---------------------------------------------------------------- the canister

def _canister() -> np.ndarray:
    """The spare gas canister, 7 x 11 native px, in the tank's steel and cap red with an overalls-yellow band: base
    centre at (3.5, 11). Light from ahead (its left) and above, as in the painting."""
    r = rig()
    n = r.native.astype(int)
    tank = r.parts["tank"].image[..., 3] > 128
    rgb = n[..., :3]
    grey = tank & (np.abs(rgb[..., 0] - rgb[..., 2]) < 25) & (rgb.sum(2) > 150)
    steel = sorted((tuple(int(v) for v in c) for c in rgb[grey]), key=sum)
    dark, mid, light = steel[len(steel) // 10], steel[len(steel) // 2], steel[int(len(steel) * .95)]
    capish = tank & (rgb[..., 0] > rgb[..., 1] + 30) & (rgb[..., 0] > 70)
    capish[14:] = False
    red = tuple(int(v) for v in np.median(rgb[capish], 0))
    band = tuple(int(v) for v in np.median(n[44:50, 84:92][..., :3].reshape(-1, 3), 0))
    nav = tuple(int(v) for v in NAVY)
    rows = [
        "  NRN  ",
        "  RRR  ",
        " DMMMD ",
        "DLMMMDD",
        "DLMMMDD",
        "DYYYYYD",
        "DYYYYYD",
        "DLMMMDD",
        "DLMMMDD",
        "DLMMDDD",
        " DDDDD ",
    ]
    colours = {"N": nav, "R": red, "D": dark, "M": mid, "L": light, "Y": band}
    out = np.zeros((11, 7, 4), np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != " ":
                out[y, x] = (*colours[ch], 255)
    return out


CAN_BASE = (3.5, 11.0)
CAN_GRIP = (3.5, 8.5)


# ---------------------------------------------------------------- poses

@dataclass
class Pose:
    """lean: the upper body's bend forward (degrees; negative leans back), about HIP, fading out down the hips.
    sy: vertical squash over the floor (sx follows to keep his volume). lift: the body raised over the legs.
    breathe: the chest's swell. heave: the shoulders raised, px. nod: the head forward (degrees).
    arm: the near arm turned at the shoulder (degrees, clockwise: the hand comes up and ahead). wand: the wand turned
    in the glove (degrees, clockwise: the nozzle up). slide: the wand slid back through the glove, px (pumping). tank: (dx, dy, degrees, swell) on his back. move: the whole
    figure. legs: per leg (dx, dy, degrees clockwise about its hip). turn/about: the whole figure turned about a
    painting point. flip: his width scaled through his middle (a spin). far: where the far hand goes (painting px), the
    far arm drawn only then; far_elbow: its elbow's side. held: the spare canister in the far hand. clipped: the spare
    canister on the tank. free: the wand out of his hand, its grip point and turn. fog: the mask's glass misted.
    flash: the whole figure flashed pale. gauge: the pressure gauge on the tank's side, 0 empty to 1 (from .8 its
    needle is in the red). heat: the tank straining hot, its steel glowing at the edges, 0..1. fx: effects drawn
    over him."""
    lean: float = 0
    sy: float = 1
    lift: float = 0
    breathe: float = 0
    heave: float = 0
    nod: float = 0
    arm: float = 0
    wand: float = 0
    slide: float = 0
    tank: tuple = (0.0, 0.0, 0.0, 0.0)
    move: tuple = (0.0, 0.0)
    legs: dict = field(default_factory=dict)
    turn: float = 0
    about: tuple = (78.0, 126.0)
    flip: float = 1.0
    far: tuple | None = None
    far_elbow: int = -1
    held: bool = False
    clipped: bool = True
    free: tuple | None = None
    fog: float = 0
    flash: float = 0
    gauge: float = .4
    heat: float = 0
    fx: list = field(default_factory=list)


def _weight(y):
    return smooth((HIP[1] - y) / 50.0)


def _about(point, deg, scale=1.0) -> np.ndarray:
    m = np.eye(3)
    lin = rot(deg) * scale
    m[:2, :2] = lin
    m[:2, 2] = np.array(point) - lin @ np.array(point)
    return m


def _shift(dx, dy) -> np.ndarray:
    m = np.eye(3)
    m[:2, 2] = dx, dy
    return m


def _apply(m, pt) -> np.ndarray:
    return m[:2, :2] @ np.array(pt, float) + m[:2, 2]


class Frame:
    """A pose worked out: the body's warp and every part's transform."""

    def __init__(self, pose: Pose):
        self.p = pose
        sx = 1 / math.sqrt(pose.sy)
        self.sq = np.diag([sx, pose.sy])
        about = np.array(pose.about, float)
        flip = np.eye(3)
        flip[0, 0] = pose.flip
        flip[0, 2] = 78 - pose.flip * 78
        turn = np.eye(3)
        turn[:2, :2] = rot(pose.turn)
        turn[:2, 2] = about - rot(pose.turn) @ about
        self.g = turn @ flip
        self.arm_m = self.on_body(SHOULDER, pose.arm)
        if pose.free is None:
            back = np.array(REAR) - np.array(NECK_N)
            back = back / np.linalg.norm(back) * pose.slide
            self.wand_m = self.arm_m @ _shift(*back) @ _about(GRIP, pose.wand)
        else:
            (gx, gy), deg = pose.free
            self.wand_m = _shift(gx - GRIP[0], gy - GRIP[1]) @ _about(GRIP, deg)
        dx, dy, deg, swell = pose.tank
        self.tank_m = self.on_body(BACK, deg) @ _shift(dx, dy) @ _about(TANK_C, 0, 1 + swell)

    def warp(self, x, y):
        p = self.p
        x = 80 + (x - 80) * (1 + p.breathe * np.exp(-((y - 50) / 18.0) ** 2))
        y = y - p.heave * smooth((HIP[1] - y) / 50.0)
        a = np.radians(-p.lean * _weight(y))
        dx, dy = x - HIP[0], y - HIP[1]
        x, y = HIP[0] + dx * np.cos(a) - dy * np.sin(a), HIP[1] + dx * np.sin(a) + dy * np.cos(a)
        x = HIP[0] + (x - HIP[0]) * self.sq[0, 0]
        y = FLOOR + (y - FLOOR) * self.sq[1, 1] - p.lift
        return x + p.move[0], y + p.move[1]

    def at(self, point) -> np.ndarray:
        x, y = self.warp(np.float64(point[0]), np.float64(point[1]))
        return np.array([float(x), float(y)])

    def on_body(self, joint, own: float = 0.0) -> np.ndarray:
        """3x3 affine (painting px -> before G) for a part riding the body at joint, turned own degrees more."""
        lin = self.sq @ rot(-self.p.lean * float(_weight(joint[1])) + own)
        m = np.eye(3)
        m[:2, :2] = lin
        m[:2, 2] = self.at(joint) - lin @ np.array(joint)
        return m

    def leg_matrix(self, name) -> np.ndarray:
        dx, dy, deg = self.p.legs.get(name, (0, 0, 0))
        hip = np.array(LEG_HIPS[name])
        m = np.eye(3)
        m[:2, :2] = rot(deg)
        m[:2, 2] = hip + np.array([dx + self.p.move[0], dy + self.p.move[1]]) - rot(deg) @ hip
        return m

    def head_matrix(self) -> np.ndarray:
        return self.on_body(NECK, -self.p.nod)

    def hose(self, steps=48) -> np.ndarray:
        """The hose, before G: from the wand's back end, leaving along the wand, to the tank's outlet, leaving it
        downwards, hanging with its painted length (taut and straight only if pulled further than that)."""
        p0 = _apply(self.wand_m, REAR)
        p3 = _apply(self.tank_m, TANK_OUT)
        t0 = self.wand_m[:2, :2] @ (np.array(REAR) - np.array(NECK_N))
        t0 /= np.linalg.norm(t0)
        t3 = self.tank_m[:2, :2] @ np.array([0.0, 1.0])
        t3 /= np.linalg.norm(t3)
        u = np.linspace(0, 1, steps)[:, None]

        def curve(a):
            c1 = p0 + .6 * a * t0 + [0, .9 * a]
            c2 = p3 + .6 * a * t3 + [0, .9 * a]
            return (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * c1 + 3 * (1 - u) * u ** 2 * c2 + u ** 3 * p3

        def length(pts):
            return float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())

        lo, hi = 0.0, 90.0
        if length(curve(lo)) >= rig().hose_len:
            return curve(lo)
        for _ in range(30):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if length(curve(mid)) < rig().hose_len else (lo, mid)
        return curve(lo)

    def far_arm(self):
        """Far shoulder, elbow and wrist before G."""
        s = self.at(FAR_SHOULDER)
        e, w, _ = br.two_bone(s, self.p.far, UPPER, FORE, self.p.far_elbow, 1.25)
        return s, e, w


# ---------------------------------------------------------------- drawing

def _line_layer(points, thick, core, light) -> np.ndarray:
    """A pole or hose at native size along canvas points: its core colour, its top edge lit from above."""
    out = np.zeros((CANVAS.h, CANVAS.w, 4), np.uint8)
    pts = np.int32(np.round(np.asarray(points) * 16))
    cv2.polylines(out, [pts], False, (*core, 255), thick, cv2.LINE_8, 4)
    solid = out[..., 3] > 0
    above = np.pad(solid, ((1, 0), (0, 0)))[:-1]
    top = solid & ~above
    out[top, :3] = light
    return out


def _sleeve(frame: Frame, s, e, w) -> np.ndarray:
    """The far arm: two capsules in the overalls' painted cloth, darker on the side away from the light with a navy
    edge there, and a glove in his gloves' rubber at the wrist."""
    r = rig()
    px, py = CANVAS.centres(frame.g)
    rgb = np.zeros(px.shape + (3,), np.float64)
    alpha = np.zeros(px.shape, bool)
    light = np.array([-.6, -.8])
    for a, b, width, tex_v in ((s, e, UPPER_W, 0.0), (e, w, FORE_W, 9.0)):
        d = b - a
        length = float(np.linalg.norm(d))
        u_dir = d / length
        n_dir = np.array([-u_dir[1], u_dir[0]])
        rx, ry = px - a[0], py - a[1]
        u = rx * u_dir[0] + ry * u_dir[1]
        v = rx * n_dir[0] + ry * n_dir[1]
        uc = np.clip(u, 0, length)
        dist = np.hypot(rx - uc * u_dir[0], ry - uc * u_dir[1])
        half = width / 2
        inside = dist <= half
        tx = TEX[0] + v
        ty = TEX[1] + tex_v + np.mod(u, 14)
        cloth = r.cloth[np.clip((ty * K).astype(int), 0, 1023), np.clip((tx * K).astype(int), 0, 1023), :3]
        colour = cloth.astype(np.float64)
        side = np.sign(v)[..., None] * n_dir
        facing = (side @ light) * np.clip(np.abs(v) / half, 0, 1)
        colour *= (1 + .16 * facing)[..., None]
        colour[(dist > half - 1.0) & (facing < -.2)] = NAVY
        rgb[inside] = colour[inside]
        alpha |= inside
    # the glove
    dist = np.hypot(px - w[0], py - w[1])
    glove = dist <= 3.3
    g = np.array(r.glove, float)
    shade = np.clip(1 + .25 * (-(px - w[0]) * .6 - (py - w[1]) * .8) / 3.3, .6, 1.3)
    rgb[glove] = (g[None, :] * shade[glove][:, None])
    rgb[glove & (dist > 2.4) & ((px - w[0]) * .6 + (py - w[1]) * .8 > 1)] = NAVY
    alpha |= glove
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


FX_IDS = {"fx"}
PAINTED = {"body", "head", "tank", "leg_far"}   # keep the painting's own rim light, never relit
RIMS = {"pole": "nozzle", "hose": "nozzle", "far_arm": "arm", "canister": "nozzle"}
JOINTS = {
    "neck": ("body", "head"),
    "shoulder": ("body", "arm"),
    "grip": ("arm", "pole"),
    "nozzle": ("pole", "nozzle"),
    "rear": ("pole", "hose"),
    "outlet": ("tank", "hose"),
    "back": ("body", "tank"),
    "hip_near": ("body", "leg_near"),
    "hip_far": ("body", "leg_far"),
    "far_shoulder": ("body", "far_arm"),
    "far_hand": ("far_arm", "canister"),
    "clip": ("tank", "canister"),
}


@dataclass
class Drawn:
    image: Image.Image
    joints: dict
    failures: list
    masks: dict | None = None
    tip: tuple = None          # the nozzle's mouth, canvas px
    aim: float = 0.0           # the nozzle's direction, degrees (180 = straight ahead)
    hand: tuple = None         # the far hand, canvas px


CAN = None


def _can_big():
    global CAN
    if CAN is None:
        CAN = br.big(_canister())
    return CAN


TIP = (5.0, 53.5)            # the nozzle's mouth


def draw(pose: Pose) -> Drawn:
    r = rig()
    f = Frame(pose)
    parts = r.parts
    g = f.g
    pt = lambda p: CANVAS.point(g, p)  # noqa: E731
    layers = []

    for name in ("leg_far",):
        layers.append((name, CANVAS.warp(parts[name].big, g @ f.leg_matrix(name))))
    layers.append(("tank", CANVAS.warp(parts["tank"].big, g @ f.tank_m)))
    clip_m = f.tank_m @ _shift(CLIP[0] - CAN_BASE[0], CLIP[1] - CAN_BASE[1]) @ _about(CAN_BASE, 22)
    if pose.clipped:
        layers.append(("canister", CANVAS.warp(_can_big(), g @ clip_m)))
    hand = None
    if pose.far is not None:
        s, e, w = f.far_arm()
        layers.append(("far_arm", _sleeve(f, s, e, w)))
        hand = w
        if pose.held:
            d = w - e
            deg = math.degrees(math.atan2(d[1], d[0])) + 90
            m = _shift(w[0] - CAN_GRIP[0], w[1] - CAN_GRIP[1]) @ _about(CAN_GRIP, deg)
            layers.append(("canister", CANVAS.warp(_can_big(), g @ m)))
            layers.append(("far_hand", _sleeve(f, w + (w - e) * .01, w + (w - e) * .02, w)))
    layers.append(("leg_near", CANVAS.warp(parts["leg_near"].big, g @ f.leg_matrix("leg_near"))))
    body = CANVAS.body(g, lambda x, y: br.unwarp(f.warp, x, y), parts["body"].big)
    layers.append(("body", body))
    hose_pts = np.array([pt(p) for p in f.hose()])
    hose_pts[:, 1] = np.minimum(hose_pts[:, 1], FLOOR + OY - 1.0)
    layers.append(("hose", _line_layer(hose_pts, 2, r.hose[0], r.hose[1])))
    layers.append(("pole", _line_layer([pt(_apply(f.wand_m, NECK_N)), pt(_apply(f.wand_m, REAR))], 2, r.pole[0],
                                       r.pole[1])))
    layers.append(("nozzle", CANVAS.warp(parts["nozzle"].big, g @ f.wand_m)))
    head_m = f.head_matrix()
    layers.append(("head", CANVAS.warp(parts["head"].big, g @ head_m)))
    layers.append(("arm", CANVAS.warp(parts["arm"].big, g @ f.arm_m)))

    canvas, owner, masks = br.composite(layers, (CANVAS.h, CANVAS.w))
    order = [n for n, _ in layers]
    br.relight(canvas, owner, order, lambda n: parts[RIMS.get(n, n) if n != "far_hand" else "arm"].rim,
               FX_IDS | PAINTED)
    if pose.fog:
        lens = np.zeros((128, 128, 4), np.uint8)
        lens[r.lens] = (190, 214, 176, 255)
        lens_c = CANVAS.warp(br.big(lens), g @ head_m)[..., 3] > 128
        lens_c &= owner == "head"
        canvas[lens_c, :3] = (canvas[lens_c, :3] * (1 - pose.fog) + np.array([190, 214, 176]) * pose.fog).astype(np.uint8)
    if pose.heat:
        tank = owner == "tank"
        rim = tank & ~ni.binary_erosion(tank, iterations=2)
        c = canvas[..., :3].astype(float)
        c[tank] = c[tank] * (1 - .22 * pose.heat) + np.array(HEAT[0]) * .22 * pose.heat
        c[rim] = c[rim] * (1 - .7 * pose.heat) + np.array(HEAT[1]) * .7 * pose.heat
        canvas[..., :3] = np.clip(c, 0, 255).astype(np.uint8)
    _gauge(canvas, owner, g, f.tank_m, pose.gauge)
    if pose.flash:
        him = np.isin(owner, [n for n in order if n not in FX_IDS]) & (canvas[..., 3] > 128)
        canvas[him, :3] = (canvas[him, :3] * (1 - pose.flash) + 255 * pose.flash).astype(np.uint8)
    for item in pose.fx:
        _fx(canvas, owner, f, item)

    joints = {
        "neck": pt(f.at(NECK)),
        "shoulder": pt(f.at(SHOULDER)),
        "nozzle": pt(_apply(f.wand_m, NECK_N)),
        "rear": pt(_apply(f.wand_m, REAR)),
        "outlet": pt(_apply(f.tank_m, TANK_OUT)),
        "back": pt(f.at(BACK)),
        "hip_near": pt(_apply(f.leg_matrix("leg_near"), LEG_HIPS["leg_near"])),
        "hip_far": pt(_apply(f.leg_matrix("leg_far"), LEG_HIPS["leg_far"])),
    }
    if pose.free is None:
        joints["grip"] = pt(_apply(f.arm_m, GRIP))
    if pose.far is not None:
        joints["far_shoulder"] = pt(f.far_arm()[0])
        if pose.held:
            joints["far_hand"] = pt(hand)
    if pose.clipped:
        joints["clip"] = pt(_apply(clip_m, (CAN_BASE[0], CAN_BASE[1] - 1.5)))
    failures = br.check(joints, JOINTS, masks, FX_IDS, (CANVAS.h, CANVAS.w), thin={"pole", "hose"})
    tip_dir = f.wand_m[:2, :2] @ (np.array(TIP) - np.array(NECK_N))
    tip_dir = g[:2, :2] @ tip_dir
    return Drawn(Image.fromarray(canvas), {k: tuple(round(float(c), 1) for c in v) for k, v in joints.items()},
                 failures, masks, tuple(pt(_apply(f.wand_m, TIP))), math.degrees(math.atan2(tip_dir[1], tip_dir[0])),
                 None if hand is None else tuple(pt(hand)))


GAUGE = (113.0, 44.0)         # the pressure gauge's middle, on the tank's side facing us (tank px)
HEAT = [(200, 60, 30), (255, 150, 60)]


def _gauge(canvas, owner, g, tank_m, level) -> None:
    """The pressure gauge riding the tank: a round dial, cream face and navy rim, its last quarter red; the needle
    from up-left (empty) round to the right (full), in the red from .8. Only over the tank, never over his arm."""
    cx, cy = CANVAS.point(g, _apply(tank_m, GAUGE))
    red_zone = level >= .8
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            d = math.hypot(dx, dy)
            x, y = int(math.floor(cx)) + dx, int(math.floor(cy)) + dy
            if d > 3.2 or not (0 <= x < CANVAS.w and 0 <= y < CANVAS.h) or owner[y, x] != "tank":
                continue
            if d > 2.3:
                c = (16, 18, 30)
            else:
                a = math.degrees(math.atan2(dy, dx))
                c = (226, 220, 200)
                if -60 < a < 20 and d > 1.2:
                    c = (210, 50, 40) if not red_zone else (255, 90, 60)
            canvas[y, x, :3] = c
    a = math.radians(-150 + 170 * min(1.0, level))
    for t in (1, 2):
        x, y = int(math.floor(cx + .5 + t * math.cos(a))), int(math.floor(cy + .5 + t * math.sin(a)))
        if 0 <= x < CANVAS.w and 0 <= y < CANVAS.h and owner[y, x] == "tank":
            canvas[y, x, :3] = (20, 20, 26) if not red_zone else (255, 255, 255)
    x, y = int(math.floor(cx)), int(math.floor(cy))
    if owner[y, x] == "tank":
        canvas[y, x, :3] = (20, 20, 26)


# ---------------------------------------------------------------- effects

def _blob(canvas, owner, cx, cy, radius, shades) -> None:
    """A round puff of gas or smoke, lit from ahead and above: light on its upper left, dark on its lower right."""
    rad = max(radius, .6)
    for dy in range(-int(rad) - 1, int(rad) + 2):
        for dx in range(-int(rad) - 1, int(rad) + 2):
            if dx * dx + dy * dy > rad * rad + .4:
                continue
            k = (dx + dy) / rad
            shade = shades[0] if k < -.55 else shades[-1] if k > .55 else shades[1 if len(shades) > 2 else 0]
            br.put(canvas, owner, int(math.floor(cx + .5)) + dx, int(math.floor(cy + .5)) + dy, shade)


def _fx(canvas, owner, f: Frame, item) -> None:
    kind = item[0]
    pt = lambda p: CANVAS.point(f.g, p)  # noqa: E731
    put = lambda x, y, c: br.put(canvas, owner, int(math.floor(x + .5)), int(math.floor(y + .5)), c)  # noqa: E731
    if kind == "puff":             # ("puff", radius, dx, dy): his breath out of the filter
        _, rad, dx, dy = item
        x, y = pt(_apply(f.head_matrix(), FILTER))
        _blob(canvas, owner, x + dx, y + dy, rad, SMOKE)
    elif kind == "star":           # ("star", size): the glint that says now, at the nozzle
        _, size = item
        x, y = pt(_apply(f.wand_m, TIP)) + [-1, -4]
        for t in range(-size, size + 1):
            c = (255, 255, 255, 255) if abs(t) < size else (255, 226, 150, 255)
            put(x + t, y, c)
            put(x, y + t, c)
    elif kind == "hiss":           # ("hiss", length): pressure whistling out round the tank's cap
        _, length = item
        x, y = pt(_apply(f.tank_m, (95.0, 2.0)))
        for ang in (-150, -110, -70, -30):
            a = math.radians(ang)
            for t in range(2, 2 + length):
                put(x + t * math.cos(a), y + t * math.sin(a), (236, 246, 230, 255))
    elif kind == "steam":          # ("steam", phase): steam boiling off round the tank's cap, rising
        _, phase = item
        x, y = pt(_apply(f.tank_m, (95.0, 2.0)))
        for k in range(3):
            t = (phase + k / 3) % 1
            _blob(canvas, owner, x - 3 + 4 * k + 2 * math.sin(t * 5 + k), y - 3 - 9 * t, .8 + 1.6 * t, SMOKE)
    elif kind == "vent":           # ("vent", length, phase[, spread]): a jet of gas out of the tank, up and back
        _, length, phase = item[:3]
        spread = item[3] if len(item) > 3 else 1.0
        base = _apply(f.tank_m, (104.0, 8.0))
        d = f.tank_m[:2, :2] @ np.array([.55, -.85])
        d /= np.linalg.norm(d)
        for k in range(length):
            t = k * 3.0 + phase
            x, y = pt(base + d * t)
            wob = math.sin(k * 1.7 + phase) * min(2.0, t * .15) * spread
            shades = GAS[:3] if k < 2 else GAS[1:]
            _blob(canvas, owner, x + wob, y, (1.2 + t * .16) * spread, shades)
    elif kind == "cloud":          # ("cloud", x, y, radius, phase): gas boiling round a painting point, behind him
        _, x, y, rad, phase = item
        cx, cy = pt((x, y))
        layer, lowner = np.zeros_like(canvas), np.full(owner.shape, "", object)
        for k in range(7):
            a = phase + k * math.tau / 7
            rr = rad * (.5 + .18 * math.sin(k * 2.3 + phase))
            _blob(layer, lowner, cx + rad * .75 * math.cos(a), cy + rad * .5 * math.sin(a), rr, FUME[1:])
        _blob(layer, lowner, cx - rad * .2, cy - rad * .2, rad * .5, FUME[:3])
        free = (layer[..., 3] > 0) & ((owner == "") | (owner == "fx"))
        canvas[free] = layer[free]
        owner[free] = "fx"
    elif kind == "dust":           # ("dust", x, y, size): puffs sitting on the floor, out to both sides
        _, x, y, size = item
        x, y = x + OX, y + OY
        dust = [(236, 226, 210, 255), (196, 186, 172, 255)]
        for side in (-1, 1):
            for k in range(size + 1):
                rr = 1 + k * .8
                cx, cy = x + side * (2 + k * 3.5), y - rr
                for dy in range(-int(rr) - 1, int(rr) + 2):
                    for dx in range(-int(rr) - 1, int(rr) + 2):
                        if dx * dx + dy * dy <= rr * rr + .5 and cy + dy < y:
                            put(cx + dx, cy + dy, dust[0] if dy < 0 else dust[1])
    elif kind == "lines":          # ("lines", x, y, length, angles): impact lines out of a canvas point
        _, x, y, length, angles = item
        for ang in angles:
            a = math.radians(ang)
            for t in range(3, 3 + length):
                put(x + OX + t * math.cos(a), y + OY + t * math.sin(a), (255, 246, 220, 255))


# ---------------------------------------------------------------- his own sprites: the stream, the canister, the cloud
# Separate from his frames, so the game can stretch the stream down a lane and throw the canister. Native px, drawn in
# the same toxic greens; the stream flows to the left, away from him.

JET_H, JET_TILE = 17, 16
JET_C = 8                    # the stream's middle row


def _jet_column(out, x, u, k_wave=0.0):
    """One column of the stream at texture position u (it repeats every JET_TILE): a fat toxic tube, its edges
    churning, a hot core with streaks racing along it."""
    ph = math.tau * u / JET_TILE
    top = JET_C - 5 + round(math.sin(ph + k_wave) * 1.2)
    bot = JET_C + 5 + round(math.sin(ph * 2 + 2.1 + k_wave) * 1.0)
    for y in range(top, bot + 1):
        d = y - JET_C
        if y in (top, bot):
            c = GAS[3]
        elif y == top + 1:
            c = GAS[1]                                    # lit from above along its top
        elif y >= bot - 1:
            c = GAS[3] if (u + y) % 3 else GAS[2]         # its shaded underside
        elif abs(d) <= 1:
            c = GAS[0] if (u + 3 * d) % 8 < 4 else GAS[1]
        else:
            c = GAS[2] if (u * 5 + y) % 7 else GAS[1]
        out[y, x] = c
    if (u * 7) % JET_TILE == 3:
        out[max(0, top - 2), x] = GAS[2]
    if (u * 11) % JET_TILE == 9:
        out[min(JET_H - 1, bot + 2), x] = GAS[3]


def jet(k: int) -> np.ndarray:
    """The stream's tile, frame k of 4: tiles side by side; its texture runs left 4 px a frame, so it loops."""
    out = np.zeros((JET_H, JET_TILE, 4), np.uint8)
    for x in range(JET_TILE):
        _jet_column(out, x, (x + 4 * k) % JET_TILE)
    return out


def _canvas_fx(w, h):
    return np.zeros((h, w, 4), np.uint8), np.full((h, w), "", object)


def burst(k: int) -> np.ndarray:
    """Where the stream leaves the nozzle, frame k of 3: 12 x JET_H, its right edge at the nozzle's mouth and its
    middle row on the stream's. Narrow and bright at the mouth, opening to the stream's full width."""
    w = 12
    out, owner = _canvas_fx(w, JET_H)
    for x in range(w):
        f = x / (w - 1)                                  # 0 where it joins the stream, 1 at the mouth
        half = 5.4 - 3.6 * f
        for y in range(JET_H):
            d = abs(y - JET_C)
            if d <= half:
                c = GAS[0] if d <= half * .45 or f > .8 else GAS[1] if d <= half * .8 else GAS[2]
                out[y, x] = c
    flare = [(w - 2, JET_C - 2), (w - 3, JET_C + 2), (w - 1, JET_C - 1), (w - 1, JET_C + 1)]
    for i, (x, y) in enumerate(flare):
        if (i + k) % 3:
            out[y, x] = (255, 255, 230, 255)
    for x, y in ((7 - k * 2, JET_C - 6 - k % 2), (4 - k, JET_C + 6), (9 - k, JET_C + 5 + k % 2)):
        if 0 <= x < w and 0 <= y < JET_H:
            out[y, x] = GAS[1]
    return out


DIVE_W = 22


def dive_drop() -> int:
    """How far the bottom spray's stream falls from the nozzle's mouth to its lane, px."""
    return max(2, round(JET_Y["bottom"] - (draw(pose(**LOW_HOLD)).tip[1] - OY)))


def dive(k: int, drop: int | None = None) -> np.ndarray:
    """The stream poured down from the nozzle onto the bottom lane, frame k of 3: DIVE_W wide, the nozzle's mouth at
    its top right corner (DIVE_W, 3), the stream leaving its left edge level, its middle row drop px lower."""
    drop = dive_drop() if drop is None else drop
    DIVE_H = 3 + drop + JET_H - JET_C
    out, owner = _canvas_fx(DIVE_W, DIVE_H)
    y_end = DIVE_H - JET_H + JET_C
    p0, p1, p2 = np.array([DIVE_W - .5, 3.0]), np.array([DIVE_W * .45, y_end + 1.0]), np.array([0.0, y_end])
    ts = np.linspace(0, 1, 80)
    curve = ((1 - ts) ** 2)[:, None] * p0 + (2 * (1 - ts) * ts)[:, None] * p1 + (ts ** 2)[:, None] * p2
    ys, xs = np.mgrid[0:DIVE_H, 0:DIVE_W] + .5
    d = np.full(xs.shape, np.inf)
    tt = np.zeros(xs.shape)
    for t, (cx, cy) in zip(ts, curve):
        dd = np.hypot(xs - cx, ys - cy)
        better = dd < d
        d[better], tt[better] = dd[better], t
    half = 2.0 + 3.6 * tt
    wave = np.sin(xs * .8 + k * math.tau / 3) * .5
    core = d <= half * .45 + wave * .3
    mid = d <= half * .8
    edge = d <= half + wave
    out[edge] = GAS[3]
    out[mid] = GAS[2]
    out[core] = GAS[0]
    out[mid & ~core & ((xs.astype(int) + k * 2) % 5 == 0)] = GAS[1]
    # where it hits the floor: a kick of droplets off the lane
    for x, y in ((6 + k, y_end - 5), (9 - k, y_end - 6 + k % 2), (3 + k * 2, y_end - 4)):
        if 0 <= x < DIVE_W and 0 <= y < DIVE_H:
            out[y, x] = GAS[1]
    return out


def splash(k: int) -> np.ndarray:
    """The far end, where the stream hits: 18 x 23, the stream coming in at its right edge on row 11 (its middle row
    lines up with the stream's), splattering up, down and back."""
    w, h = 18, 23
    out, owner = _canvas_fx(w, h)
    cy = 11
    pulse = (0, 1, 0)[k]
    _blob(out, owner, 10 - k, cy, 5.0 + pulse, GAS[:3])
    _blob(out, owner, 6 - k, cy - 4 + k, 3.0, GAS[1:])
    _blob(out, owner, 6 - k, cy + 4 - k % 2, 2.8, GAS[1:])
    for i, (dx, dy) in enumerate(((-7, -8), (-3, -10), (-10, 0), (-6, 8), (-2, 9), (1, -9))):
        t = (k + i) % 3
        x, y = 11 + dx - t * 2, cy + dy + (t if dy > 0 else -t)
        if 0 <= x < w and 0 <= y < h:
            out[y, x] = GAS[0] if i % 2 else GAS[1]
    return out


def canister_spin(k: int) -> np.ndarray:
    """The thrown canister, frame k of 3 (it turns a third of a turn a frame), 13 x 13, centred."""
    m = _shift(6.5 - CAN_BASE[0], 6.5 - 5.5) @ _about((CAN_BASE[0], 5.5), 120 * k)
    lin, t = m[:2, :2], m[:2, 2]
    aff = np.zeros((2, 3))
    aff[:, :2] = lin / K
    aff[:, 2] = lin @ np.array([.5 / K, .5 / K]) + t - .5
    return cv2.warpAffine(_can_big(), aff, (13, 13), flags=cv2.INTER_NEAREST)


MINE_ROWS = [
    "       DD         ",
    "      DLLD        ",
    "  DDDDDMMDDDDDDD  ",
    " RDLLLLLLLLLLLMDD ",
    "RrDLMMMMMMMMMMMDDD",
    "RrDYYKKYYKKYYKKDDD",
    "RrDKYYKKYYKKYYKDDD",
    "RRDMMMMMMMMMMMDDDD",
    " RDDMMMMMMMMMDDDD ",
    "  DDDDDDDDDDDDDD  ",
]


def _palette() -> dict:
    """The canister's steel (dark, mid, light) and cap red, read off its drawing; hazard tape's yellow and black."""
    can = _canister()
    pick = lambda y, x: tuple(int(v) for v in can[y, x, :3])  # noqa: E731
    return {"D": pick(10, 3), "M": pick(3, 2), "L": pick(3, 1), "R": pick(1, 3), "Y": (236, 196, 52), "K": (28, 28, 34)}


def mine(k: int) -> np.ndarray:
    """A gas mine: the spare canister laid down on its side and armed, 18 x 13 with its bottom on the lane. A fat
    steel drum with a valve on top, a yellow-and-black hazard band round it, the red cap ahead (to the left) with its
    lamp. Frame 0 the lamp is dark, 1 it flashes hot with a glint, 2 it is lit and gas whistles out of the valve."""
    pal = _palette()
    out = np.zeros((13, 18, 4), np.uint8)
    lamp = {0: (120, 26, 22), 1: (255, 110, 80), 2: (255, 70, 50)}[k]
    for y, row in enumerate(MINE_ROWS):
        for x, ch in enumerate(row):
            if ch == " ":
                continue
            out[y + 3, x] = (*(lamp if ch == "r" else pal[ch]), 255)
    if k == 1:                                     # the lamp's glint
        for x, y in ((0, 6), (1, 5), (0, 9)):
            out[y, x] = (255, 236, 200, 255)
    if k == 2:                                     # a wisp whistling up off the valve
        for t, (x, y) in enumerate(((8, 2), (9, 1), (9, 0))):
            out[y, x] = GAS[1] if t else (236, 246, 230, 255)
        out[2, 6] = GAS[2]
    return out


def _can_turned(deg: float, size: int, centre) -> np.ndarray:
    """The canister turned deg degrees about its middle, onto a size x size canvas with its middle at centre."""
    m = _shift(centre[0] - CAN_BASE[0], centre[1] - 5.5) @ _about((CAN_BASE[0], 5.5), deg)
    lin, t = m[:2, :2], m[:2, 2]
    aff = np.zeros((2, 3))
    aff[:, :2] = lin / K
    aff[:, 2] = lin @ np.array([.5 / K, .5 / K]) + t - .5
    return cv2.warpAffine(_can_big(), aff, (size, size), flags=cv2.INTER_NEAREST)


def grenade(k: int) -> np.ndarray:
    """The bouncing grenade: the canister with its cap knocked loose, tumbling a quarter turn a frame, its fuse spitting
    sparks out of the cap and its lamp blinking red on every other frame. 17 x 17, centred."""
    deg = 90 * k
    out = _can_turned(deg, 17, (8.5, 8.5))
    a = math.radians(deg)
    cap = np.array([8.5, 8.5]) + np.array([5.0 * math.sin(a), -5.0 * math.cos(a)])
    rng = np.random.default_rng(60 + k)
    for _ in range(4):
        ang = a - math.pi / 2 + rng.uniform(-1.0, 1.0)
        for t in range(1, int(rng.integers(2, 4))):
            x, y = int(cap[0] + t * math.cos(ang)), int(cap[1] + t * math.sin(ang))
            if 0 <= x < 17 and 0 <= y < 17:
                out[y, x] = (255, 250, 200, 255) if t == 1 else (255, 170, 60, 255)
    if k % 2 == 0:
        x, y = int(cap[0]), int(cap[1])
        out[max(0, y - 1):y + 1, max(0, x - 1):x + 1] = (255, 70, 50, 255)
    return out


CHAIN_W, CHAIN_H = 27, 15
CHAIN_C = (7.5, 7.5)


def chained(k: int) -> np.ndarray:
    """The chained canister, swung along a lane: the canister swinging on the end of its chain (it rocks, it doesn't
    spin), the chain's links trailing back behind it (to the right: it flies left; flipped on the way back). 27 x 15,
    the canister's middle at (7.5, 7.5)."""
    deg = (-18, -6, 10, -2)[k]
    out = np.zeros((CHAIN_H, CHAIN_W, 4), np.uint8)
    can = _can_turned(90 + deg, 15, CHAIN_C)
    pal = _palette()
    # the links: from the canister's base out to the right, a slack curve that ripples frame to frame
    base = np.array(CHAIN_C) + 5.5 * np.array([math.cos(math.radians(deg)), math.sin(math.radians(deg))])
    for i in range(6):
        x = base[0] + 1 + i * 3
        y = base[1] + .9 * math.sin(i * 1.1 + k * 1.6) + .12 * i * i * .5
        xi, yi = int(round(x)), int(round(y))
        if i % 2 == 0:                             # a link side on: a ring
            for dx, dy in ((0, -1), (1, -1), (-1, 0), (2, 0), (0, 1), (1, 1)):
                if 0 <= xi + dx < CHAIN_W and 0 <= yi + dy < CHAIN_H:
                    out[yi + dy, xi + dx] = (*(pal["L"] if dy < 0 else pal["D"]), 255)
        else:                                      # a link edge on: a bar
            for dx in range(0, 3):
                if 0 <= xi + dx < CHAIN_W and 0 <= yi < CHAIN_H:
                    out[yi, xi + dx] = (*pal["M"], 255)
    solid = can[..., 3] > 0
    out[:, :15][solid] = can[solid]
    return out


CLOUD_W, CLOUD_H = 48, 34
# The cloud's own greens, light to dark: billows lit from above, their undersides in shadow
CLOUD = [(222, 248, 160, 255), (172, 222, 92, 255), (122, 184, 66, 255), (80, 136, 60, 255), (50, 92, 54, 255)]


def _billow(out, cx, cy, r, lift=0) -> None:
    """One round billow of gas: its top lit, its belly in shadow, a dark rim along its lower edge where it sits on
    whatever is behind it. lift brightens a billow in front, below 0 darkens one behind."""
    for dy in range(-int(r) - 1, int(r) + 2):
        for dx in range(-int(r) - 1, int(r) + 2):
            d2 = dx * dx + dy * dy
            if d2 > r * r + .4:
                continue
            x, y = int(math.floor(cx + .5)) + dx, int(math.floor(cy + .5)) + dy
            if not (0 <= x < out.shape[1] and 0 <= y < out.shape[0]):
                continue
            v = (dy + .35 * dx) / r                        # -1 at the lit top left, 1 at the shaded bottom right
            edge = d2 > (r - 1.1) ** 2
            if edge and v > .1:
                shade = 4
            elif v < -.55:
                shade = 0
            elif v < -.1:
                shade = 1
            elif v < .45:
                shade = 2
            else:
                shade = 3
            if y >= out.shape[0] - 5:
                shade += 1                                 # the cloud's flat belly, in its own shadow
            out[y, x] = CLOUD[min(4, max(0, shade - lift))]


def cloud(k: int, frames: int = 6) -> np.ndarray:
    """The gas cloud the canister leaves, frame k of 6, looping: CLOUD_W x CLOUD_H, its bottom on the lane. Billows
    piled up like a cauliflower, back ones first and darker, each lit on top and shaded underneath; they swell in turn
    and the top ones roll over, so it boils without moving off its spot."""
    out = np.zeros((CLOUD_H, CLOUD_W, 4), np.uint8)
    ph = math.tau * k / frames
    cx = CLOUD_W / 2
    base = CLOUD_H - 6
    # (x, y, radius, phase offset, front): the low wide skirt, the body, the crown
    layout = [(-16, 0, 6.5, 0.0, 0), (16, 0, 6.5, 2.1, 0), (-8, -3, 8.0, 4.2, 0), (8, -4, 8.0, 1.3, 0),
              (0, -10, 8.5, 3.0, 0), (-11, -11, 6.0, 5.0, 0), (11, -12, 6.0, .7, 0),
              (-4, -17, 6.0, 2.6, 1), (6, -18, 5.0, 4.6, 1), (-14, 2, 5.0, 1.9, 1), (14, 2, 5.0, 3.7, 1),
              (0, 0, 7.5, 5.6, 1)]
    for x, y, r, off, front in sorted(layout, key=lambda b: (b[4], b[1])):
        swell = math.sin(ph + off)
        roll = math.cos(ph + off) * (1.2 if y < -8 else .5)
        _billow(out, cx + x + roll, base + y - .8 * max(0.0, swell), r + .9 * swell, lift=front - 1)
    for i in range(3):                                   # wisps curling off the crown
        a = ph + i * math.tau / 3
        x = int(cx + (-10 + 10 * i) + 1.5 * math.sin(a))
        y = int(4 - 2.5 * math.sin(a) + i % 2)
        for dx in (0, 1):
            if 0 <= y < CLOUD_H and 0 <= x + dx < CLOUD_W:
                out[y, x + dx] = CLOUD[2]
    out[CLOUD_H - 1:, :] = 0
    return out


# ---------------------------------------------------------------- animations

REST = Pose()


def pose(**kw) -> Pose:
    return replace(REST, **kw)


def idle():
    """Heavy breathing through the mask: the shoulders heave up on the breath in and the head tips back, the wand
    rises a little with them and its nozzle lags; on the breath out a puff leaves the filter. The tank settles a beat
    after his back."""
    frames = []
    for i in range(8):
        t = i / 8 * math.tau
        b = math.sin(t)
        puffs = {5: [("puff", 1, -1, 1)], 6: [("puff", 1.6, -3, 2)], 7: [("puff", 2.0, -5, 2), ("puff", 1, -2, 1)]}
        frames.append(pose(
            heave=1.4 * b, breathe=.03 * b, nod=-3 * b + 1, lean=.8 * math.sin(t - .4),
            arm=1.8 * math.sin(t + .3), wand=-1.2 * math.sin(t - .5),
            tank=(0, -1.0 * math.sin(t - .9), .8 * math.sin(t - 1.2), 0), fx=puffs.get(i, [])))
    return frames


def walk():
    """A slow, heavy advance: each step lands with his weight, the body dips, the tank thumps down a beat later and
    sways with the stride; the nozzle stays on target."""
    frames = []
    for i in range(8):
        t = i / 8 * math.tau
        near = 9 * math.sin(t)
        far = -9 * math.sin(t)
        frames.append(pose(
            lift=1.3 * math.cos(2 * t) - .3, lean=4 + 1.2 * math.cos(2 * t + .5), sy=1 - .015 * math.cos(2 * t),
            nod=3 + 1.5 * math.cos(2 * t + .8), heave=.6 * math.cos(2 * t),
            arm=2 + 1.2 * math.sin(2 * t + .6), wand=-1.5 * math.sin(2 * t + 1.4),
            legs={"leg_near": (0, -3.2 * max(0.0, math.cos(t)), near), "leg_far": (0, -3.2 * max(0.0, -math.cos(t)), far)},
            tank=(.6 * math.sin(t), -1.4 * math.cos(2 * t - 1.0), 2.0 * math.sin(t - .6), 0)))
    return frames


def charge():
    """His charge along a lane: bent right over, head down behind the mask, the wand couched like a lance, legs at a
    run; his walk, leaned into and lengthened."""
    frames = []
    for i, p in enumerate(walk()):
        t = i / 8 * math.tau
        legs = {k: (dx, dy * 1.6, deg * 2.2) for k, (dx, dy, deg) in p.legs.items()}
        frames.append(replace(p, lean=p.lean + 16, nod=p.nod + 6, arm=p.arm - 8, wand=p.wand + 6, legs=legs,
                              lift=p.lift + 1.5 * abs(math.sin(t))))
    return frames


def pump():
    """The telegraph: he pumps the wand like a shotgun, twice, the tank swelling and hissing harder with each stroke;
    then braces with the nozzle levelled and it glints."""
    return [
        pose(slide=5, arm=-6, lean=-2, heave=1, nod=-2, tank=(0, 0, 0, .02)),                                # pull
        pose(slide=-2, arm=4, lean=4, nod=3, wand=-2, tank=(-.5, 1, -2, .045), fx=[("hiss", 2)]),            # push
        pose(slide=5, arm=-7, lean=-2, heave=1.2, nod=-3, tank=(.5, -.5, 1, .06)),                            # pull
        pose(slide=-2, arm=5, lean=5, nod=4, wand=-3, tank=(-1, 1, -3, .09), fx=[("hiss", 4)]),             # push
        pose(arm=8, wand=-8, lean=-4, sy=1.02, heave=1.5, nod=-3, tank=(.6, -.6, 2, .11), fx=[("hiss", 5)]),  # braced
        pose(arm=6, wand=-7, lean=-3, sy=1.01, heave=1, nod=-2, tank=(0, 0, 0, .1), fx=[("hiss", 3), ("star", 3)]),
    ]


# The two sprays hold on these. Top lane: standing tall, leaning back, the wand raised level at the top lane's height
# (its mouth 10 px over the ledge). Bottom lane: bent over, the wand pointed down at the floor ahead, pouring along it.
TOP_HOLD = dict(lean=-6, sy=1.03, lift=2, arm=10, wand=-27, heave=1, nod=-4,
                legs={"leg_near": (-1, 0, 3), "leg_far": (1, 0, -3)})
LOW_HOLD = dict(lean=14, sy=.9, arm=-36, wand=0, nod=6, legs={"leg_near": (0, 0, 6), "leg_far": (2, 0, -4)})


def spray_top_windup():
    return [
        pose(sy=.96, lean=3, arm=-5, wand=2, heave=-1, nod=3),                               # gathers
        pose(lean=-2, sy=1.01, lift=1, arm=0, wand=-9, nod=-2),                             # comes up
        pose(**{**TOP_HOLD, "lean": -9, "sy": 1.05, "lift": 3, "arm": 14, "wand": -31}),    # overshoots
        pose(**TOP_HOLD),                                                                   # aimed: held
    ]


def spray_top():
    """The stream's kick shoves him back a little each beat; the nozzle's mouth stays put on the lane."""
    out = []
    for i, (mx, tk) in enumerate(((1, .6), (2, -.4), (1, .5), (2, -.5))):
        out.append(pose(**{**TOP_HOLD, "nod": -4 + (i % 2)}, move=(mx, 0),
                        tank=(tk, -.4 * (i % 2), tk, .04)))
    return out


def spray_top_release():
    return [
        pose(**{**TOP_HOLD, "lean": -9, "arm": 15, "wand": -16, "nod": -6}, move=(2, 0)),     # the kick lifts the wand
        pose(lean=-2, arm=3, wand=-4, nod=-1, move=(1, 0)),
        pose(lean=1, arm=0, wand=-1, nod=1),
    ]


def spray_bottom_windup():
    return [
        pose(lean=-4, lift=1, arm=6, wand=4, nod=-3, heave=1),                               # rises first
        pose(lean=6, sy=.95, arm=-14, wand=1, nod=3),                                       # drops
        pose(**{**LOW_HOLD, "lean": 17, "sy": .87, "arm": -42, "wand": 3, "nod": 8}),       # overshoots
        pose(**LOW_HOLD),                                                                   # aimed: held
    ]


def spray_bottom():
    out = []
    for i, (mx, tk) in enumerate(((1, .6), (2, -.4), (1, .5), (2, -.5))):
        out.append(pose(**{**LOW_HOLD, "nod": 6 + (i % 2)}, move=(mx, 0), tank=(tk, -.5 * (i % 2), tk, .04)))
    return out


def spray_bottom_release():
    return [
        pose(**{**LOW_HOLD, "lean": 11, "arm": -24, "wand": 6, "nod": 3}, move=(2, 0)),      # the kick lifts the wand
        pose(lean=5, sy=.96, arm=-9, wand=2, nod=2, move=(1, 0)),
        pose(lean=1, arm=-1, nod=1),
    ]


def lob():
    """He reaches over his shoulder for the spare canister on the tank, cocks it back behind his head, and lobs it
    overarm; the arm follows through and drops back behind him. The canister leaves the hand on frame 3."""
    return [
        pose(lean=-3, nod=-5, arm=-3, far=(101, 4), far_elbow=1, heave=1),                                    # reach
        pose(lean=-8, sy=1.03, heave=1.5, nod=-6, arm=-5, far=(100, -6), far_elbow=1, held=True,
             clipped=False),                                                                                    # cock
        pose(lean=4, nod=2, arm=-8, far=(58, -6), far_elbow=1, held=True, clipped=False),                     # whip
        pose(lean=12, sy=.96, nod=7, arm=-10, far=(34, 22), far_elbow=1, clipped=False),                      # release
        pose(lean=9, sy=.97, nod=5, arm=-7, far=(40, 54), far_elbow=1, clipped=False),                        # follows
        pose(lean=3, nod=1, arm=-2, clipped=False),                                                            # settles
    ]


def stagger():
    """Shot in the tank: he jerks back, the wand flung up, and the tank vents a jet of gas; he rocks forward and
    gathers himself. The first frame is flashed pale."""
    return [
        pose(lean=-13, sy=.95, move=(4, 0), nod=-12, arm=14, wand=10, tank=(3, -1, 11, 0), flash=.55,
             fx=[("vent", 5, 0.0, 1.3)]),
        pose(lean=-10, sy=.97, move=(4, 0), nod=-9, arm=11, wand=8, tank=(2, 0, 7, 0), fx=[("vent", 8, 1.5, 1.4)]),
        pose(lean=7, sy=.97, move=(2, 0), nod=8, arm=-6, wand=-3, tank=(-1, 1, -4, 0), fx=[("vent", 7, 3.0, 1.3)]),
        pose(lean=2, move=(1, 0), nod=2, arm=-1, tank=(0, 0, -1, 0), fx=[("vent", 4, 4.5, 1.1)]),
        pose(lean=0, nod=0, fx=[("vent", 2, 6.0)]),
    ]


def idle_hot():
    """Breathing as in idle, the tank under pressure: swollen and straining on its straps, its steel glowing hot at
    the edges and pulsing, the gauge's needle shivering in the red, steam boiling off round the cap and whistling.
    The tell that bullets count triple now."""
    frames = []
    for i, p in enumerate(idle()):
        t = i / 8 * math.tau
        dx, dy, deg, _ = p.tank
        frames.append(replace(p, tank=(dx + .4 * (i % 2) - .2, dy - .4, deg, .085 + .02 * math.sin(2 * t)),
                              heat=.55 + .35 * (.5 + .5 * math.sin(2 * t)), gauge=.9 + .06 * (i % 2),
                              fx=[("hiss", 2 + (i % 3)), ("steam", i / 8)] + p.fx))
    return frames


def brace():
    """Before his charge: crouched low on the lane he will run, head down behind the mask, the wand couched, the back
    boot pawing the floor twice. Held while he braces."""
    out = []
    for i in range(4):
        paw = (0, 4, 0, 4)[i]
        out.append(pose(lean=20, sy=.92, lift=-2, nod=9, arm=-12, wand=8, heave=-1, tank=(0, 1, -3, 0),
                        legs={"leg_near": (-2, 0, 8), "leg_far": (3 + paw, -paw * .5, -10 - paw * 2)},
                        fx=[("dust", 96, FLOOR, 1)] if paw else []))
    return out


def knocked():
    """A dash into him as he winds up: the wand is knocked up out of his glove and tumbles on its hose while he reels
    back, his arm flung up; it comes down and he fumbles it back. The first frame is flashed pale."""
    return [
        pose(lean=-12, sy=.96, move=(3, 0), nod=-12, arm=20, wand=30, flash=.5, tank=(2, -1, 8, 0),
             fx=[("lines", 4, 52, 4, (-160, -120, -80))]),
        pose(lean=-14, move=(4, 0), nod=-14, arm=32, free=((50, 46), 28), tank=(2, -1, 9, 0)),
        pose(lean=-11, move=(4, 0), nod=-10, arm=30, free=((50, 34), 52), tank=(1, -1, 6, 0)),
        pose(lean=-6, move=(3, 0), nod=-4, arm=18, free=((50, 32), 64), tank=(0, 0, 3, 0)),
        pose(lean=-1, move=(2, 0), nod=2, arm=6, free=((50, 48), 34), tank=(0, 0, 0, 0)),
        pose(lean=4, move=(1, 0), nod=5, arm=-6, wand=-8, heave=1, fx=[("puff", 1.6, -3, 2)]),
    ]


def shoved():
    """Dashed into: shoved back on his heels, boots skidding with dust kicked up, the wand flung up; he catches his
    balance leaning forward again. The first frame is flashed pale."""
    return [
        pose(lean=-16, sy=.96, move=(3, 0), nod=-14, arm=18, wand=14, flash=.4, tank=(3, -1, 9, 0),
             legs={"leg_near": (5, 0, -14), "leg_far": (2, 0, -4)}, fx=[("dust", 60, FLOOR, 1)]),
        pose(lean=-18, move=(5, 0), nod=-12, arm=24, wand=20, tank=(3, -1, 10, 0),
             legs={"leg_near": (8, -1, -20), "leg_far": (4, 0, -6)}, fx=[("dust", 64, FLOOR, 2)]),
        pose(lean=-12, move=(4, 0), nod=-8, arm=16, wand=12, tank=(2, 0, 6, 0),
             legs={"leg_near": (6, 0, -12), "leg_far": (3, 0, -4)}, fx=[("dust", 66, FLOOR, 1)]),
        pose(lean=-4, move=(2, 0), nod=-2, arm=6, wand=4, tank=(1, 0, 2, 0),
             legs={"leg_near": (3, 0, -5)}),
        pose(lean=3, move=(1, 0), nod=3, arm=-2, wand=-2, heave=1, tank=(0, 1, -1, 0)),
    ]


def panic():
    """Nearly empty and leaking: he can't keep still. Hunched, the mask jerking round to look at the tank, his far
    hand slapping at its cap to stop it, the wand dangling forgotten, a jet of gas spurting out past his hand and his
    breath coming fast and fogging the glass, his boots jittering. 10 fps, looping."""
    frames = []
    for i in range(8):
        t = i / 8 * math.tau
        slap = i % 2
        frames.append(pose(
            lean=6 + 2 * math.sin(2 * t), sy=.97, nod=(-10 if slap else 4) + 2 * math.sin(t), heave=1.2 * slap,
            move=((-1, 1)[slap], 0), arm=-16 + 2 * math.sin(t), wand=22 + 3 * math.sin(t + 1),
            far=(103, 2) if slap else (96, 12), far_elbow=1, fog=.35 + .15 * math.sin(t),
            tank=(.5 * (1 - 2 * slap), .5, 2 * math.sin(2 * t), -.04), gauge=.05 + .05 * slap,
            legs={"leg_near": (0, -1.5 * slap, 3 * math.sin(2 * t)), "leg_far": (0, -1.5 * (1 - slap), -3 * math.sin(2 * t))},
            fx=[("vent", 4 + 2 * slap, i * .8, 1.1)] + ([("puff", 1.4, -3, 2)] if i % 4 == 3 else [])))
    return frames


def defeat():
    """The tank ruptures: he's thrown upright in his own gas and whirls round flailing, the mask fogging up; he wobbles,
    tips over backwards and sits down hard. The wand flies out of his hands, spins and clatters onto the floor, still
    on its hose; the tank sags empty and one last puff leaves the filter."""
    back_heel = (100.0, 126.0)
    sit = dict(lift=-15, sy=.92, lean=-9, legs={"leg_near": (0, 15, 72), "leg_far": (-4, 7, 62)})
    slumped = dict(sit, nod=14, arm=-30, fog=1.0, tank=(0, 1, -4, -.12), clipped=False)
    lying = ((58.0, 121.0), 342)
    return [
        pose(lean=-10, lift=2, nod=-14, arm=22, wand=14, tank=(3, -2, 12, .08), flash=.45,
             fx=[("cloud", 106, 20, 18, 0.0), ("vent", 4, 0.0, 1.6)]),                                                                 # struck
        pose(lean=-6, lift=3, nod=-10, arm=28, wand=22, flip=-1, fog=.4, tank=(2, -1, 8, .02),
             fx=[("cloud", 96, 26, 26, .8), ("cloud", 66, 60, 16, 2.0), ("vent", 6, 1.5, 1.6)]),                                     # whirls
        pose(lean=7, lift=1, nod=8, arm=-22, wand=-10, fog=.7, tank=(0, 0, -4, -.04),
             fx=[("cloud", 92, 36, 28, 1.6), ("cloud", 52, 76, 16, 3.0), ("vent", 5, 3.0, 1.3)]),                                    # round
        pose(lean=-8, lift=1, nod=-10, arm=26, wand=20, flip=-1, fog=1.0, tank=(0, 0, 4, -.07),
             fx=[("cloud", 84, 48, 26, 2.4), ("cloud", 110, 84, 14, .4), ("vent", 3, 4.5, 1.2)]),                                     # again
        pose(lean=-12, nod=-12, arm=20, turn=9, about=back_heel, fog=1.0, tank=(0, 0, 3, -.09),
             free=((46, 36), 40), fx=[("cloud", 80, 62, 22, 3.1)]),                                           # loses it
        pose(lean=-16, nod=-14, arm=26, turn=19, about=back_heel, fog=1.0, tank=(0, 0, 4, -.1),
             free=((62, 66), 130), fx=[("cloud", 76, 80, 16, 3.8)]),                                           # tips over
        pose(**{**slumped, "sy": .84, "nod": 6, "arm": -10}, free=((50, 100), 315),
             fx=[("cloud", 96, 104, 12, 4.4), ("dust", 60, FLOOR, 2), ("dust", 100, FLOOR, 1)]),                                           # sits hard
        pose(**{**slumped, "lift": -12, "sy": .95, "nod": 10, "arm": -20}, free=lying,
             fx=[("lines", 16, 120, 3, (-160, -120, -60))]),                                                  # clatter
        pose(**slumped, free=((58, 118), 350)),                                                               # bounces
        pose(**{**slumped, "nod": 17}, free=lying),
        pose(**{**slumped, "nod": 18}, free=lying, fx=[("puff", 1.5, -2, 2)]),
        pose(**{**slumped, "nod": 19, "sy": .91}, free=lying, fx=[("puff", 2.6, -6, 3), ("puff", 1.4, -2, 1)]),  # pfff
    ]


ANIMATIONS = {
    # name: (make, fps, loop)
    "idle": (idle, 6, True),
    "idle-hot": (idle_hot, 6, True),
    "walk": (walk, 8, True),
    "pump": (pump, 10, False),
    "spray-top-windup": (spray_top_windup, 10, False),
    "spray-top": (spray_top, 14, True),
    "spray-top-release": (spray_top_release, 10, False),
    "spray-bottom-windup": (spray_bottom_windup, 10, False),
    "spray-bottom": (spray_bottom, 14, True),
    "spray-bottom-release": (spray_bottom_release, 10, False),
    "lob": (lob, 10, False),
    "stagger": (stagger, 14, False),
    "defeat": (defeat, 10, False),
    "charge": (charge, 16, True),
    "brace": (brace, 8, True),
    "knocked": (knocked, 12, False),
    "shoved": (shoved, 12, False),
    "panic": (panic, 10, True),
}
# The stream, the canister and the cloud: (make, frames, fps)
SPRITES = {
    "jet": (jet, 4, 14),
    "jet-burst": (burst, 3, 14),
    "jet-dive": (dive, 3, 14),
    "jet-splash": (splash, 3, 14),
    "canister": (canister_spin, 3, 14),
    "cloud": (cloud, 6, 8),
    "mine": (mine, 3, 6),
    "grenade": (grenade, 4, 14),
    "chain": (chained, 4, 12),
}


def render(name: str) -> list[Drawn]:
    return [draw(p) for p in ANIMATIONS[name][0]()]


# ---------------------------------------------------------------- previews

ZOOM = 5
AHEAD = 110                  # room on the stage ahead of him, native px, for the stream and the thrown canister
TOP_LANE_Y = FLOOR - 68      # the top lane's ledge, painting px
JET_Y = {"top": None, "bottom": FLOOR - 10}   # the stream's middle row: top follows the nozzle; bottom runs on the floor
HOLD_MS = {"pump": 600, "spray-top-windup": 600, "spray-bottom-windup": 600, "lob": 300, "stagger": 200,
           "defeat": 1500}


def _paste(stage: Image.Image, sprite: np.ndarray, x: float, y: float) -> None:
    """A sprite onto the stage at canvas px (its top left), shifted by the room ahead."""
    stage.alpha_composite(Image.fromarray(sprite), (int(round(x)) + AHEAD, int(round(y))))


DIVE_DROP = None
SPLASH_C = 11                # the splash's row that meets the stream's middle


def stream(stage: Image.Image, d: Drawn, lane: str, k: int, end_x: float) -> None:
    """The stream out of the nozzle down a lane to end_x (canvas px): burst (top) or pour (bottom), tiles, splash."""
    tx, ty = d.tip
    if lane == "top":
        y = round(ty) - JET_C
        b = burst(k % 3)
        _paste(stage, b, tx - b.shape[1], y)
        x = tx - b.shape[1]
    else:
        dv = dive(k % 3, DIVE_DROP)
        y = JET_Y["bottom"] + OY - JET_C
        _paste(stage, dv, tx - DIVE_W, round(ty) - 3)
        x = tx - DIVE_W
    tile = jet(k % 4)
    while x > end_x:
        _paste(stage, tile, x - JET_TILE, y)
        x -= JET_TILE
    sp = splash(k % 3)
    _paste(stage, sp, end_x - sp.shape[1] + 4, y + JET_C - SPLASH_C)


def _stage(d: Drawn, box, extras=(), zoom=ZOOM) -> Image.Image:
    """Him on the mid-dark ground with the floor and the top lane's height marked, the extras drawn with him:
    callables taking the stage. box is in canvas px; the stage reaches AHEAD px further ahead than his canvas."""
    stage = Image.new("RGBA", (CANVAS.w + AHEAD, CANVAS.h), br.BG)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(stage)
    dr.line([(0, FLOOR + OY), (stage.width, FLOOR + OY)], fill=(84, 92, 104, 255))
    for x in range(0, stage.width, 4):
        dr.point((x, TOP_LANE_Y + OY), fill=(84, 92, 104, 255))
        dr.point((x + 1, TOP_LANE_Y + OY), fill=(84, 92, 104, 255))
    stage.alpha_composite(d.image, (AHEAD, 0))
    for extra in extras:
        extra(stage)
    crop = stage.crop((box[0] + AHEAD, box[1], box[2] + AHEAD, box[3]))
    return crop.resize((crop.width * zoom, crop.height * zoom), Image.NEAREST)


def _flight(start, end, steps, height):
    """The canister's arc from start to end (canvas px) over steps frames, peaking height px over the higher end."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        x = start[0] + (end[0] - start[0]) * t
        y = start[1] + (end[1] - start[1]) * t - 4 * height * t * (1 - t)
        out.append((x, y))
    return out


def previews(out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    global DIVE_DROP
    DIVE_DROP = dive_drop()
    rendered = {name: render(name) for name in ANIMATIONS}
    failures = [f"{name}[{i}] {f}" for name, frames in rendered.items() for i, d in enumerate(frames) for f in d.failures]
    box = br.crop_box([d.image for frames in rendered.values() for d in frames], FLOOR + OY)
    wide = (box[0] - AHEAD + 4, box[1], box[2], box[3])
    end_x = wide[0] + 10                                   # where the previews' stream hits

    # what each animation shows round him, per frame
    def extras_for(name, i, d):
        if name in ("spray-top", "spray-bottom"):
            lane = name.split("-")[1]
            return [lambda st, d=d, k=i: stream(st, d, lane, k, end_x)]
        return []

    for name, frames in rendered.items():
        _, fps, loop = ANIMATIONS[name]
        step = round(1000 / fps)
        use = wide if name.startswith("spray") or name == "lob" else box
        images = [_stage(d, use, extras_for(name, i, d)) for i, d in enumerate(frames)]
        durations = [step] * len(images)
        if loop:
            images, durations = images * 3, durations * 3
        else:
            durations[-1] = HOLD_MS.get(name, 300)
        br.gif(out / f"{name}.gif", images, durations)

    # the sprays and the lob as they play in the fight: wind-up, held, the stream on, released
    seq_top, d_top = _spray_sequence(rendered, "top", wide, end_x)
    br.gif(out / "spray-top.gif", seq_top, d_top)
    seq_bot, d_bot = _spray_sequence(rendered, "bottom", wide, end_x)
    br.gif(out / "spray-bottom.gif", seq_bot, d_bot)
    seq_lob, d_lob = _lob_sequence(rendered, wide, end_x)
    br.gif(out / "lob-thrown.gif", seq_lob, d_lob)

    cell = (box[2] - box[0], box[3] - box[1])
    rows = [(name, ANIMATIONS[name][1], [(d.image, bool(d.failures)) for d in frames]) for name, frames in rendered.items()]

    def stage_sheet(image, zoom):
        return br.staged(image, box, FLOOR + OY, TOP_LANE_Y + OY, zoom)
    br.sheet(out / "sheet.png", rows, cell, stage_sheet)
    sprites_sheet(out / "sprites.png")
    parts_sheet(out / "parts.png")

    # the fight
    seq, durs = [], []

    def play(name, times=1, hold=None, zoom=3, extras=None):
        _, fps, _ = ANIMATIONS[name]
        for _ in range(times):
            for i, d in enumerate(rendered[name]):
                seq.append(_stage(d, wide, extras(i, d) if extras else extras_for(name, i, d), zoom))
                durs.append(round(1000 / fps))
        if hold:
            durs[-1] = hold

    def add(images, durations):
        for im in images:
            seq.append(im.resize((im.width * 3 // ZOOM, im.height * 3 // ZOOM), Image.NEAREST))
        durs.extend(durations)
    play("idle")
    play("walk", 2)
    play("pump", hold=600)
    add(seq_top, d_top)
    play("idle")
    add(seq_lob, d_lob)
    play("pump", hold=500)
    add(seq_bot, d_bot)
    play("stagger", hold=200)
    play("defeat", hold=1800)
    br.gif(out / "fight.gif", seq, durs)
    pivot = (78 + OX - box[0], FLOOR + OY - box[1])
    lines = [f"{box} cell {cell} pivot (feet on the floor) {pivot}"]
    for name, frames in rendered.items():
        if name.startswith("spray"):
            lines.append(f"{name} nozzle (cell px) " + " ".join(
                f"({d.tip[0] - box[0]:.1f},{d.tip[1] - box[1]:.1f})" for d in frames))
    lines.append(f"stream middle row: top lane = the nozzle's row; bottom lane {JET_Y['bottom'] + OY - box[1]} (cell px), "
                 f"jet-dive drop {DIVE_DROP}")
    lines.append(f"lob release hand (cell px) {tuple(round(float(v) - o, 1) for v, o in zip(rendered['lob'][2].hand, box[:2]))}")
    (out / "box.txt").write_text("\n".join(lines) + "\n")
    return failures


def _spray_sequence(rendered, lane, wide, end_x):
    images, durs = [], []
    for i, d in enumerate(rendered[f"spray-{lane}-windup"]):
        images.append(_stage(d, wide))
        durs.append(100)
    durs[-1] = 600
    loop = rendered[f"spray-{lane}"]
    for k in range(12):
        d = loop[k % len(loop)]
        images.append(_stage(d, wide, [lambda st, d=d, k=k: stream(st, d, lane, k, end_x)]))
        durs.append(round(1000 / 14))
    for d in rendered[f"spray-{lane}-release"]:
        images.append(_stage(d, wide))
        durs.append(100)
    durs[-1] = 300
    return images, durs


def _lob_sequence(rendered, wide, end_x):
    """The lob, the canister flying from the hand to the bottom lane, then its cloud while he gets his breath."""
    images, durs = [], []
    frames = rendered["lob"]
    start = np.array(frames[2].hand) + [-2, -4]
    land = (end_x + 30, FLOOR + OY - 7)
    path = _flight(start, land, 8, 46)
    idle_frames = rendered["idle"]
    timeline = [frames[i] for i in range(len(frames))] + [idle_frames[i % 8] for i in range(20)]
    for t, d in enumerate(timeline):
        extras = []
        f = t - 3                                          # it leaves the hand on frame 3
        if 0 <= f < len(path):
            x, y = path[f]
            extras.append(lambda st, x=x, y=y, f=f: _paste(st, canister_spin(f % 3), x - 6.5, y - 6.5))
        elif f >= len(path):
            c = (f - len(path)) % 6
            extras.append(lambda st, c=c: _paste(st, cloud(c), land[0] - CLOUD_W / 2, FLOOR + OY - CLOUD_H))
        images.append(_stage(d, wide, extras))
        durs.append(100 if t < len(frames) else round(1000 / 6) if f >= len(path) else 100)
    return images, durs


def sprites_sheet(path: Path) -> None:
    """The stream's pieces, the canister and the cloud, each frame on the ground, x5."""
    tiles = []
    for name, (make, count, fps) in SPRITES.items():
        for k in range(count):
            img = make(k)
            pad = 3
            tile = Image.new("RGBA", (img.shape[1] + 2 * pad, img.shape[0] + 2 * pad), br.BG)
            tile.alpha_composite(Image.fromarray(img), (pad, pad))
            tile = tile.resize((tile.width * ZOOM, tile.height * ZOOM), Image.NEAREST)
            from PIL import ImageDraw
            ImageDraw.Draw(tile).text((3, 2), f"{name} {k}", fill=(255, 255, 255, 255))
            tiles.append(tile)
    # a stretch of stream, three tiles side by side, to show it tiles
    strip = np.concatenate([jet(0)] * 3, axis=1)
    tile = Image.new("RGBA", (strip.shape[1] + 6, strip.shape[0] + 6), br.BG)
    tile.alpha_composite(Image.fromarray(strip), (3, 3))
    tiles.append(tile.resize((tile.width * ZOOM, tile.height * ZOOM), Image.NEAREST))
    br.tiles_sheet(path, tiles)


def parts_sheet(path: Path) -> None:
    """Each cut piece on its own, filled where it was hidden, the joints it turns about marked; and the pieces drawn
    per frame (pole, hose, far arm) at rest."""
    r = rig()
    marks = {"head": [NECK], "body": [NECK, SHOULDER, BACK, HIP, *LEG_HIPS.values()], "arm": [SHOULDER, GRIP],
             "nozzle": [NECK_N], "tank": [BACK, TANK_OUT, CLIP], "leg_near": [LEG_HIPS["leg_near"]],
             "leg_far": [LEG_HIPS["leg_far"]]}
    tiles = [br.tile(r.parts[n].image, n, marks[n]) for n in ("head", "body", "arm", "nozzle", "tank", "leg_near",
                                                                "leg_far")]
    d = draw(pose(far=(70, 20), held=True, clipped=False))
    for layer, label in (("pole", "pole\n(drawn)"), ("hose", "hose\n(drawn)"), ("far_arm", "far arm\n(drawn)")):
        img = np.asarray(d.image).copy()
        img[~d.masks[layer], 3] = 0
        tiles.append(br.tile(img, label))
    tiles.append(br.tile(_canister(), "canister"))
    br.tiles_sheet(path, tiles)


if __name__ == "__main__":
    problems = previews(Path(sys.argv[1]))
    print("\n".join(problems) if problems else "every joint holds, every frame in one piece")
    sys.exit(1 if problems else 0)
