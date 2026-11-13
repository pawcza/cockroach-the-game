"""Pani Lodzia, the first boss: the owner's still (lodzia-figure-101) cut into parts and posed per frame.

The render is pixel art on an exact 8 px grid, so it is read at that grid: 128 native px, one painted pixel per game
texel. She stands 100 native px from scarf to sole, which keeps every painted pixel as it is (any other size resamples
and smears her face). Parts are posed at 8x after a Scale2x upscale and sampled back down per pixel (RotSprite), so
turned parts stay crisp pixel art.

Parts: head (scarf, face, curlers), body (housecoat; it bends at the waist, squashes and breathes as one warped piece,
no seams), the near forearm with its fist (turns at the elbow), both legs (behind the hem), the far arm that holds the
slipper and the slipper. The far arm is mostly hidden behind her head in the painting, so its sleeve is drawn per frame
in the housecoat's own painted cloth; the hand and the slipper are the painting's. Everything behind a cut part is
filled from the paint around it. Light comes from the front and above, as in the painting: parts that turn far (hand,
slipper, the drawn sleeve, the legs) lose their painted rim light and get it back per frame on whichever edge faces
the light.

Every frame is checked: each joint lies on both parts it joins, and the figure is one connected piece (only the flying
slipper, curlers and effects may float). `python3 tools/art/lodzia.py OUT_DIR` writes the previews.
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
from rig import cut_white  # noqa: E402

SOURCE = "art/sprites/bosses/lodzia-figure.png"
K = 8                  # the painting's pixel grid: 1024 render px = 128 native px
FLOOR = 124            # the first row under her soles, in painting px
OX, OY = 72, 44        # where the painting's (0, 0) sits on the canvas, native px
CW, CH = 224, 172      # canvas, native px: room for the lunge ahead and the slipper overhead and behind

# Joints, in painting px
HIP = (64.0, 106.0)          # the waist bends about this point, the hem stays put
NECK = (50.0, 55.0)
ELBOW = (61.0, 84.0)         # the near arm: the forearm and fist turn here
SHOULDER = (83.0, 57.0)      # the far arm, under the back of the shoulder
WRIST = (75.5, 31.0)         # where the hand meets the drawn sleeve
FIST = (40.0, 88.0)          # the middle of the near fist, which throws the curlers
GRIP = (74.5, 28.5)          # where the fist closes over the slipper
LEG_HIPS = {"leg_front": (56.0, 103.0), "leg_back": (76.0, 103.0)}
UPPER, FORE = 13.0, 13.0     # the far arm's lengths
UPPER_W, FORE_W = 10.0, 9.0
CUFF = 3.0
SLIP_REST = -135.0           # the slipper's heel-to-toe direction in the painting, degrees, y down
MAX_STRETCH = 2.5
HEAD_LIMIT = 15.0
TOE = (66.0, 6.0)            # the slipper's toe

# Cut lines, painting px
SLIP_BOX = [(58, 0), (106, 0), (106, 35), (86, 35), (78, 34.5), (74, 34), (71, 31.5), (67.5, 28.5), (65, 21), (60, 14)]
HAND = [(66.5, 21.5), (72, 22.5), (80.5, 25.5), (81.5, 34), (65.5, 34), (65.5, 25)]
HEAD = [(25, 17), (58, 17), (65, 21), (67.5, 28.5), (71, 31.5), (74, 34), (74, 38), (76, 40), (76, 47.5), (66, 48.5), (60, 49.5),
        (54, 54.5), (50, 58.5), (48, 62.5), (47, 67.5), (42, 69.5), (34, 68), (25, 64)]
ARM_CUT = [(64, 26), (106, 26), (106, 60), (90, 55.5), (84, 51.5), (76, 48.5), (70, 40)]
FOREARM = [(44, 79.5), (46, 76), (50, 71), (53, 69), (57, 71), (62, 78), (64.5, 86), (61, 91.5), (51, 92.5), (49, 97.5),
           (35, 97.5), (31, 90), (33.5, 82), (40, 80)]
NECK_FILL = [(43, 71), (44, 60), (50, 52), (58, 46), (66, 43), (76, 43), (85, 47), (85, 53), (76, 50.5), (62, 55),
             (53, 63), (49, 71)]
BELLY_FILL = [(40.5, 74), (52, 69), (62, 77), (65, 88), (59, 95), (49, 98), (40.5, 98)]
CURLERS = [(34, 27, 40, 35), (63, 40, 68, 47), (68, 40, 74, 47)]

NAVY = np.array([18, 24, 40])
DUST = [(236, 226, 210, 255), (196, 186, 172, 255), (150, 140, 132, 255)]
TEX = (66.0, 60.0)          # where the drawn sleeve takes its cloth: the housecoat's back, flowers and folds


def _poly(points, size=128) -> np.ndarray:
    """A polygon in painting px, rasterised at 8x and read at pixel centres."""
    mask = np.zeros((size * K, size * K), np.uint8)
    cv2.fillPoly(mask, [np.int32(np.array(points) * K)], 1)
    return mask[K // 2::K, K // 2::K] > 0


def _scale2x(a: np.ndarray) -> np.ndarray:
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    b, d, f, h = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 2:], p[2:, 1:-1]
    eq = lambda x, y: (x == y).all(-1)  # noqa: E731
    bd, bf, dh, hf = eq(b, d), eq(b, f), eq(d, h), eq(h, f)
    bh, df = eq(b, h), eq(d, f)
    live = ~bh & ~df
    e0 = np.where((live & bd)[..., None], d, a)
    e1 = np.where((live & bf)[..., None], f, a)
    e2 = np.where((live & dh)[..., None], d, a)
    e3 = np.where((live & hf)[..., None], f, a)
    out = np.zeros((a.shape[0] * 2, a.shape[1] * 2, a.shape[2]), a.dtype)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e0, e1, e2, e3
    return out


def _big(rgba: np.ndarray) -> np.ndarray:
    """8x for posing: Scale2x three times keeps diagonals clean when a part turns."""
    a = rgba.copy()
    a[a[..., 3] < 128] = 0
    for _ in range(3):
        a = _scale2x(a)
    return a


def _rim(rgb: np.ndarray) -> np.ndarray:
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (r > 165) & (r - b > 60) & (r - g > 35)


def _fill(rgba: np.ndarray, known: np.ndarray, want: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Colours for the want pixels from the known ones round them, snapped to the painting's palette."""
    rgb = np.ascontiguousarray(rgba[..., :3])
    holes = (~known).astype(np.uint8) * 255
    painted = cv2.inpaint(rgb, holes, 4, cv2.INPAINT_TELEA)
    out = rgba.copy()
    out[want, :3] = _snap(painted[want], palette)
    out[want, 3] = 255
    return out


def _snap(pixels: np.ndarray, palette: np.ndarray) -> np.ndarray:
    d = ((pixels[:, None, :].astype(int) - palette[None, :, :].astype(int)) ** 2).sum(2)
    return palette[d.argmin(1)]


def _palette(pixels: np.ndarray, n: int = 40) -> np.ndarray:
    data = pixels.astype(np.float32)
    _, labels, centres = cv2.kmeans(data, n, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 1,
                                    cv2.KMEANS_PP_CENTERS)
    return np.clip(centres, 0, 255).astype(np.uint8)


@dataclass
class Part:
    name: str
    image: np.ndarray            # painting-sized RGBA, native
    big: np.ndarray = None       # the same at 8x
    rim: tuple = None            # its own rim colour, when it is relit per frame


class Lodzia:
    def __init__(self, source: str = SOURCE):
        full = cut_white(source, erode=1)
        native = full[K // 2::K, K // 2::K].copy()
        ys = np.arange(128)[:, None]
        white = native[..., :3].min(2) > 225
        native[white & (ys > 100), 3] = 0                   # the gap between her legs
        solid = native[..., 3] > 128
        self.native = native
        self.palette = _palette(native[solid][:, :3])
        teal = native[..., 2].astype(int) > native[..., 0].astype(int) + 15
        slip_box = _poly(SLIP_BOX) & solid & ~(teal & (ys >= 30))  # the cuff goes with the redrawn sleeve
        hand = slip_box & _poly(HAND) & (native[..., :3].astype(int).sum(2) > 150)
        hand = ni.binary_fill_holes(hand)
        slipper = slip_box & ~hand
        head = _poly(HEAD) & solid & ~slip_box
        arm_cut = _poly(ARM_CUT) & solid & ~head & ~slip_box
        forearm = _poly(FOREARM) & solid
        legs = solid & (ys >= 109)
        front = legs & (np.arange(128)[None, :] < 68)
        back = legs & ~front
        body = solid & ~slip_box & ~head & ~arm_cut & ~forearm & ~legs

        self.parts = {
            "slipper": self._cut(slipper, fill=self._slipper_shape(slipper, hand)),
            "hand": self._cut(hand),
            "head": self._cut(head),
            "forearm": self._cut(forearm),
            "leg_front": self._leg(front),
            "leg_back": self._leg(back),
        }
        # The body: what's left, its silhouette closed where the head, the near fist and the far arm came off
        fills = (_poly(NECK_FILL) | (_poly(BELLY_FILL) & ~_poly(FOREARM) | (_poly(BELLY_FILL) & forearm))) & ~body
        fills &= ~(ys >= 109)
        body_rgba = native.copy()
        body_rgba[~body, 3] = 0
        body_rgba = _fill(body_rgba, body, fills, self.palette)
        body_rgba[~(body | fills), 3] = 0
        body_rgba, body_rim, _ = self._strip(body_rgba, body | fills)
        self.parts["body"] = Part("body", body_rgba, rim=body_rim)
        for part in self.parts.values():
            part.big = _big(part.image)
        self.cloth = _big(native)                            # the sleeve's cloth, from the painting itself
        cuff = native[77:84, 45:52][..., :3].reshape(-1, 3)
        self.cuff = cuff[np.argsort(cuff.astype(int).sum(1))]
        self.curlers = []
        for x0, y0, x1, y1 in CURLERS:
            patch = self.parts["head"].image[y0:y1, x0:x1].copy()
            self.curlers.append(((x0, y0), _big(patch)))
        bald = self.parts["head"].image.copy()
        holes = np.zeros((128, 128), bool)
        for x0, y0, x1, y1 in CURLERS:
            holes[y0:y1, x0:x1] = True
        known = (bald[..., 3] > 128) & ~holes
        self.head_popped = _big(_fill(bald, known, holes & (bald[..., 3] > 128), self.palette))

    def _slipper_shape(self, slipper, hand):
        """The slipper behind the fist: its outline closed over where the hand was."""
        hull = cv2.convexHull(np.argwhere(slipper)[:, ::-1].astype(np.int32))
        mask = np.zeros((128, 128), np.uint8)
        cv2.fillConvexPoly(mask, hull, 1)
        return ((mask > 0) | ni.binary_dilation(slipper, iterations=3)) & hand

    def _cut(self, mask, fill=None) -> Part:
        rgba = self.native.copy()
        rgba[~mask, 3] = 0
        rgba, rim, rim_px = self._strip(rgba, mask)
        if fill is not None and fill.any():
            rgba = _fill(rgba, mask & ~fill & ~rim_px, fill, self.palette)
        keep = mask | (fill if fill is not None else False)
        rgba[~keep, 3] = 0
        return Part("", rgba, rim=rim)

    def _strip(self, rgba, mask):
        """The painted rim light along a part's edge, taken off: it is put back per frame on whichever edge then faces
        the light, so a part that turns doesn't carry a lit edge round to its dark side."""
        outside = self.native[..., 3] < 128
        out1 = np.pad(outside, ((0, 0), (1, 0)), constant_values=True)[:, :-1]
        out2 = np.pad(outside, ((0, 0), (2, 0)), constant_values=True)[:, :-2]
        rim_px = mask & (out1 | out2) & _rim(rgba[..., :3])  # the lit silhouette only; rims inside her stay painted
        if not rim_px.any():
            return rgba, (236, 120, 80, 255), rim_px
        rim = tuple(int(v) for v in np.median(rgba[rim_px][:, :3], 0)) + (255,)
        out = _fill(rgba, mask & ~rim_px, rim_px, self.palette)
        out[~mask, 3] = 0
        return out, rim, rim_px

    def _leg(self, mask) -> Part:
        """A leg and its shoe, the stocking carried up under the hem so the leg never shows a gap when the body
        lifts or the leg turns."""
        part = self._cut(mask)
        img = part.image
        cols = np.nonzero(img[109, :, 3] > 128)[0]
        for y in range(94, 109):
            img[y, cols] = img[109, cols]
        return part


RIG = None


def rig() -> Lodzia:
    global RIG
    if RIG is None:
        RIG = Lodzia()
    return RIG


# ---------------------------------------------------------------- geometry

def _rot(deg: float) -> np.ndarray:
    """Clockwise on screen (y down) for positive degrees."""
    a = math.radians(deg)
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


def _smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


@dataclass
class Pose:
    """lean: the upper body's bend forward (degrees; negative leans back), about HIP, fading out down the skirt.
    sy: vertical squash of the body over the floor (sx follows to keep her volume). lift: the body raised over the
    legs (tiptoe, a hop). breathe: the chest's swell. sway: the hem's swing, px. nod: the head forward (degrees).
    fore: the near fist raised (degrees, at the elbow). hand: where the far wrist goes (painting px, before turn and
    flip). slip: the slipper's heel-to-toe direction (degrees, y down, 180 = pointing ahead). elbow: which side the far
    elbow goes, 1 or -1. squeeze: the slipper's squash along / across itself at the impact.
    move: the whole figure, legs too. legs: per leg (dx, dy, degrees clockwise about its hip). turn/about: the whole
    figure turned (degrees, clockwise) about a painting point. flip: her width scaled through her middle (a spin).
    free: the slipper out of her hand, its grip point and direction. popped: curlers off, each (x, y, degrees).
    fx: effects drawn over or under her."""
    lean: float = 0
    sy: float = 1
    lift: float = 0
    breathe: float = 0
    sway: float = 0
    nod: float = 0
    fore: float = 0
    hand: tuple = WRIST
    slip: float = SLIP_REST
    elbow: int = 1
    squeeze: tuple = (1.0, 1.0)
    move: tuple = (0.0, 0.0)
    legs: dict = field(default_factory=dict)
    turn: float = 0
    about: tuple = (64.0, 124.0)
    flip: float = 1.0
    free: tuple | None = None
    popped: list = field(default_factory=list)
    fx: list = field(default_factory=list)
    flash: float = 0.0
    hold: bool = True        # the slipper in her hand; False while it is in her pocket or just thrown


def _weight(y):
    return _smooth((HIP[1] - y) / 44.0)


class Frame:
    """A pose worked out: the body's warp and every part's transform, then drawn."""

    def __init__(self, pose: Pose):
        self.p = pose
        sx = 1 / math.sqrt(pose.sy)
        self.sq = np.diag([sx, pose.sy])
        about = np.array(pose.about, float)
        # the flip goes through her middle, the turn about its own point
        flip = np.eye(3)
        flip[0, 0] = pose.flip
        flip[0, 2] = 64 - pose.flip * 64
        turn = np.eye(3)
        turn[:2, :2] = _rot(pose.turn)
        turn[:2, 2] = about - _rot(pose.turn) @ about
        self.g = turn @ flip

    # body warp, painting px -> painting px before G
    def warp(self, x, y):
        p = self.p
        x = x + p.sway * _smooth((y - 86) / 22.0)
        x = 66 + (x - 66) * (1 + p.breathe * np.exp(-((y - 74) / 16.0) ** 2))
        a = np.radians(-p.lean * _weight(y))
        dx, dy = x - HIP[0], y - HIP[1]
        x, y = HIP[0] + dx * np.cos(a) - dy * np.sin(a), HIP[1] + dx * np.sin(a) + dy * np.cos(a)
        x = 64 + (x - 64) * self.sq[0, 0]
        y = FLOOR + (y - FLOOR) * self.sq[1, 1] - p.lift
        return x + p.move[0], y + p.move[1]

    def unwarp(self, qx, qy):
        x, y = qx.copy(), qy.copy()
        for _ in range(14):
            fx, fy = self.warp(x, y)
            x, y = x + (qx - fx), y + (qy - fy)
        return x, y

    def at(self, point) -> np.ndarray:
        """A body point, before G."""
        x, y = self.warp(np.float64(point[0]), np.float64(point[1]))
        return np.array([float(x), float(y)])

    def on_body(self, joint, own: float = 0.0) -> np.ndarray:
        """3x3 affine (painting px -> before G) for a part riding the body at joint, turned own degrees more."""
        lin = self.sq @ _rot(-self.p.lean * float(_weight(joint[1])) + own)
        m = np.eye(3)
        m[:2, :2] = lin
        m[:2, 2] = self.at(joint) - lin @ np.array(joint)
        return m

    def arm(self):
        """Shoulder, elbow and wrist before G, and the arm's stretch."""
        p = self.p
        s = self.at(SHOULDER)
        t = np.array(p.hand, float)
        d = float(np.linalg.norm(t - s))
        reach = UPPER + FORE
        stretch = 1.0
        if d > reach * .98:
            stretch = min(d / (reach * .98), MAX_STRETCH)
        l1, l2 = UPPER * stretch, FORE * stretch
        d = min(d, (l1 + l2) * .999)
        base = math.atan2(t[1] - s[1], t[0] - s[0])
        cos_a = max(-1, min(1, (l1 ** 2 + d ** 2 - l2 ** 2) / (2 * l1 * d)))
        e_ang = base + p.elbow * math.acos(cos_a)
        e = s + l1 * np.array([math.cos(e_ang), math.sin(e_ang)])
        w = s + d * np.array([math.cos(base), math.sin(base)])
        return s, e, w, stretch

    def hand_matrix(self, wrist, slip, squeeze=(1.0, 1.0), point=WRIST) -> np.ndarray:
        """The hand and slipper: turned from the painting's slipper direction to slip, point put at wrist."""
        turn = _rot(slip - SLIP_REST)
        axis = _rot(SLIP_REST)  # squeeze along and across the slipper
        sq = axis @ np.diag(squeeze) @ axis.T
        lin = turn @ sq
        m = np.eye(3)
        m[:2, :2] = lin
        m[:2, 2] = np.array(wrist) - lin @ np.array(point)
        return m

    def leg_matrix(self, name) -> np.ndarray:
        dx, dy, deg = self.p.legs.get(name, (0, 0, 0))
        hip = np.array(LEG_HIPS[name])
        m = np.eye(3)
        m[:2, :2] = _rot(deg)
        m[:2, 2] = hip + np.array([dx + self.p.move[0], dy + self.p.move[1]]) - _rot(deg) @ hip
        return m


# ---------------------------------------------------------------- drawing

# Every layer is drawn straight at native size, each canvas pixel sampled at its centre from the part's 8x image:
# RotSprite without ever building an 8x canvas.

def _canvas_affine(m: np.ndarray) -> np.ndarray:
    """cv2 matrix from a part's 8x image to the canvas, from a 3x3 painting px -> canvas painting px affine."""
    lin, t = m[:2, :2], m[:2, 2]
    out = np.zeros((2, 3))
    out[:, :2] = lin / K
    out[:, 2] = lin @ np.array([.5 / K, .5 / K]) + t + np.array([OX, OY]) - .5
    return out


def _warp_part(big: np.ndarray, m: np.ndarray) -> np.ndarray:
    return cv2.warpAffine(big, _canvas_affine(m), (CW, CH), flags=cv2.INTER_NEAREST)


def _centres(g: np.ndarray):
    """Every canvas pixel centre in painting px, before G."""
    ginv = np.linalg.inv(g)
    ys, xs = np.mgrid[0:CH, 0:CW].astype(np.float64)
    qx, qy = xs + .5 - OX, ys + .5 - OY
    return (ginv[0, 0] * qx + ginv[0, 1] * qy + ginv[0, 2], ginv[1, 0] * qx + ginv[1, 1] * qy + ginv[1, 2])


def _body_layer(frame: Frame, big: np.ndarray) -> np.ndarray:
    px, py = _centres(frame.g)
    sx, sy = frame.unwarp(px, py)
    mx, my = (sx * K - .5).astype(np.float32), (sy * K - .5).astype(np.float32)
    return cv2.remap(big, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def _sleeve(frame: Frame, rigx: Lodzia, s, e, w) -> np.ndarray:
    """The far arm's sleeve: two capsules in the housecoat's painted cloth, darker on the side away from the light
    with the coat's navy edge there, and the teal cuff at the wrist."""
    px, py = _centres(frame.g)
    rgb = np.zeros(px.shape + (3,), np.float64)
    alpha = np.zeros(px.shape, bool)
    light = np.array([-.6, -.8])
    for (a, b, width, tex_y, cuff) in ((s, e, UPPER_W, TEX[1], False), (e, w, FORE_W, TEX[1] + 17, True)):
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
        ty = tex_y + np.mod(u, 22)
        cloth = rigx.cloth[np.clip((ty * K).astype(int), 0, 1023), np.clip((tx * K).astype(int), 0, 1023), :3]
        colour = cloth.astype(np.float64)
        # which way each pixel's edge faces, against the light from ahead and above
        side = np.sign(v)[..., None] * n_dir
        facing = (side @ light) * np.clip(np.abs(v) / half, 0, 1)
        colour *= (1 + .16 * facing)[..., None]
        shadow_edge = (dist > half - 1.0) & (facing < -.2)
        colour[shadow_edge] = NAVY
        if cuff:
            band = (u > length - CUFF - .5) & ~shadow_edge
            shade = np.clip((facing + 1) / 2, 0, .999)
            pick = rigx.cuff[(shade * (len(rigx.cuff) - 1) * .8 + len(rigx.cuff) * .1).astype(int)]
            colour[band] = pick[band]
        rgb[inside] = colour[inside]
        alpha |= inside
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


# ---------------------------------------------------------------- frames

FX_IDS = {"smear", "fx", "free", "curler"}
RELIT = {"sleeve", "hand", "slipper", "leg_front", "leg_back", "free"}
# Joint name: (parent layer, child layer)
JOINTS = {
    "neck": ("body", "head"),
    "elbow": ("body", "forearm"),
    "shoulder": ("body", "sleeve"),
    "wrist": ("sleeve", "hand"),
    "grip": ("hand", "slipper"),
    "hip_front": ("body", "leg_front"),
    "hip_back": ("body", "leg_back"),
}


@dataclass
class Drawn:
    image: Image.Image
    joints: dict
    failures: list
    masks: dict | None = None
    points: dict | None = None   # painting px: where the far wrist and the near fist are, for what she throws


def draw(pose: Pose) -> Drawn:
    rigx = rig()
    f = Frame(pose)
    parts = rigx.parts
    g = f.g
    layers = []  # (name, rgba8), back to front

    s, e, w, _ = f.arm()
    hand_m = f.hand_matrix(w, pose.slip, pose.squeeze)
    toe = hand_m[:2] @ [*TOE, 1]
    for item in pose.fx:
        if item[0] == "smear":
            layers.append(("smear", _smear(s, w, toe, item[1])))
    for name in ("leg_back", "leg_front"):
        layers.append((name, _warp_part(parts[name].big, g @ f.leg_matrix(name))))
    if pose.free is None and pose.hold:
        layers.append(("slipper", _warp_part(parts["slipper"].big, g @ f.hand_matrix(w, pose.slip, pose.squeeze))))
    layers.append(("sleeve", _sleeve(f, rigx, s, e, w)))
    layers.append(("hand", _warp_part(parts["hand"].big, g @ f.hand_matrix(w, pose.slip))))
    layers.append(("body", _body_layer(f, parts["body"].big)))
    layers.append(("forearm", _warp_part(parts["forearm"].big, g @ f.on_body(ELBOW, pose.fore))))
    head_big = rigx.head_popped if pose.popped else parts["head"].big
    # a painted face turned much past 15 degrees breaks up: the neck takes the rest of the lean
    body_turn = -pose.lean * float(_weight(NECK[1]))
    head_turn = max(-HEAD_LIMIT, min(HEAD_LIMIT, body_turn - pose.nod))
    layers.append(("head", _warp_part(head_big, g @ f.on_body(NECK, head_turn - body_turn))))
    if pose.free is not None:
        (fx_, fy_), deg = pose.free
        m = f.hand_matrix((fx_, fy_), deg, point=GRIP)
        layers.append(("free", _warp_part(parts["slipper"].big, g @ m)))
    for i, (cx, cy, deg) in enumerate(pose.popped):
        (x0, y0), big = rigx.curlers[i]
        size = big.shape[1] / K, big.shape[0] / K
        m = np.eye(3)
        m[:2, :2] = _rot(deg)
        centre = np.array([x0 + size[0] / 2, y0 + size[1] / 2])
        m[:2, 2] = np.array([cx, cy]) - _rot(deg) @ centre
        canvas = np.zeros((128 * K, 128 * K, 4), np.uint8)
        canvas[y0 * K:y0 * K + big.shape[0], x0 * K:x0 * K + big.shape[1]] = big
        layers.append(("curler", _warp_part(canvas, g @ m)))

    masks = {}
    canvas = np.zeros((CH, CW, 4), np.uint8)
    owner = np.full((CH, CW), "", object)
    for name, small in layers:
        solid = small[..., 3] > 128
        masks[name] = masks.get(name, np.zeros_like(solid)) | solid
        canvas[solid] = small[solid]
        owner[solid] = name
    _relight(canvas, owner, [name for name, _ in layers])
    if pose.flash:
        her = np.isin(owner, [n for n, _ in layers if n not in FX_IDS]) & (canvas[..., 3] > 128)
        canvas[her, :3] = (canvas[her, :3] * (1 - pose.flash) + 255 * pose.flash).astype(np.uint8)
    for item in pose.fx:
        if item[0] == "impact" and masks.get("slipper") is not None and masks["slipper"].any():
            ys_, xs_ = np.nonzero(masks["slipper"])
            low = ys_.max()
            x = xs_[ys_ >= low - 1].mean()
            _fx(canvas, owner, ("dust", x - OX, low + 1 - OY, item[1]))
            if len(item) > 2:
                tip = xs_.min()
                tip_y = ys_[xs_ <= tip + 1].mean()
                _fx(canvas, owner, ("lines", tip - OX, tip_y - OY, item[2]))
        elif item[0] == "star":
            out = toe + 7 * (toe - w) / np.linalg.norm(toe - w)
            _fx(canvas, owner, ("star", out[0], out[1], item[1]))
        elif item[0] != "smear":
            _fx(canvas, owner, item)

    # checks
    to_canvas = lambda pt: g[:2, :2] @ np.array(pt) + g[:2, 2] + [OX, OY]  # noqa: E731
    joints = {
        "neck": to_canvas(f.at(NECK)),
        "elbow": to_canvas(f.at(ELBOW)),
        "shoulder": to_canvas(s),
        "wrist": to_canvas(w),
        "hip_front": to_canvas(f.leg_matrix("leg_front")[:2] @ [*LEG_HIPS["leg_front"], 1]),
        "hip_back": to_canvas(f.leg_matrix("leg_back")[:2] @ [*LEG_HIPS["leg_back"], 1]),
    }
    if pose.free is None and pose.hold:
        joints["grip"] = to_canvas(f.hand_matrix(w, pose.slip)[:2] @ [*GRIP, 1])
    failures = []
    for joint, point in joints.items():
        parent, child = JOINTS[joint]
        x, y = int(round(point[0] - .5)), int(round(point[1] - .5))
        for layer in (parent, child):
            win = masks.get(layer, np.zeros((CH, CW), bool))[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
            if win.sum() < 5:
                failures.append(f"{joint}: {layer} doesn't cover the joint ({win.sum()}/9)")
    figure = np.zeros((CH, CW), bool)
    for name, mask in masks.items():
        if name not in FX_IDS:
            figure |= mask
    labels, count = ni.label(figure, structure=np.ones((3, 3)))
    if count > 1:
        sizes = ni.sum(figure, labels, range(1, count + 1))
        loose = sorted(int(v) for v in sizes)[:-1]
        if any(v >= 3 for v in loose):
            failures.append(f"figure in {count} pieces, loose sizes {loose}")
    fist = f.on_body(ELBOW, pose.fore)[:2] @ [*FIST, 1]
    points = {"wrist": (float(w[0]), float(w[1])), "fist": (float(fist[0]), float(fist[1]))}
    return Drawn(Image.fromarray(canvas), {k: tuple(round(float(c), 1) for c in v) for k, v in joints.items()},
                 failures, masks, points)


def _relight(canvas: np.ndarray, owner: np.ndarray, order: list[str]) -> None:
    """The rim light, from ahead as in the painting: on every part's edge that faces ahead with nothing in front."""
    rigx = rig()
    rank = {name: i for i, name in enumerate(order)}
    ranks = np.vectorize(lambda n: rank.get(n, -1), otypes=[int])(owner)
    lit_layers = {n for n in order if n not in ("smear", "curler")}
    left_rank = np.pad(ranks, ((0, 0), (1, 0)), constant_values=-1)[:, :-1]
    for name in lit_layers:
        mine = owner == name
        if not mine.any():
            continue
        part = {"free": "slipper", "sleeve": "hand"}.get(name, name)
        colour = np.array(rigx.parts[part].rim[:3], float)
        lit = mine & (left_rank < 0)
        canvas[lit, :3] = (canvas[lit, :3] * .2 + colour * .8).astype(np.uint8)


def _smear(shoulder, wrist, toe, sweep: float) -> np.ndarray:
    """The band the slipper sweeps about the shoulder, trailing sweep degrees behind it (signed: the way it came
    from), full at the slipper and thinning to nothing, pale at its outer edge."""
    out = np.zeros((CH, CW, 4), np.uint8)
    r_out = float(np.linalg.norm(toe - shoulder)) + .5
    r_in = max(4.0, float(np.linalg.norm(wrist - shoulder)) + 2)
    a_now = math.degrees(math.atan2(toe[1] - shoulder[1], toe[0] - shoulder[0]))
    steps = max(8, int(abs(sweep) / 3))
    for k in range(steps):
        f0, f1 = k / steps, (k + 1) / steps
        a0, a1 = math.radians(a_now + sweep * f0), math.radians(a_now + sweep * f1)
        inner = r_in + (r_out - r_in) * (.1 + .9 * f1 ** 1.6)
        mid = (inner + r_out) / 2
        for r_lo, r_hi, colour in ((mid, r_out, (226, 216, 200, 255)), (inner, mid, (160, 148, 140, 255))):
            pts = [shoulder + r_hi * np.array([math.cos(a0), math.sin(a0)]),
                   shoulder + r_hi * np.array([math.cos(a1), math.sin(a1)]),
                   shoulder + r_lo * np.array([math.cos(a1), math.sin(a1)]),
                   shoulder + r_lo * np.array([math.cos(a0), math.sin(a0)])]
            poly = np.int32(np.round((np.array(pts) + [OX, OY]) * 8))
            cv2.fillConvexPoly(out, poly, colour, cv2.LINE_8, 3)
    out[FLOOR + OY:] = 0  # never through the floor
    return out


def _fx(canvas: np.ndarray, owner, item) -> None:
    kind = item[0]
    put = lambda x, y, c: _put(canvas, owner, math.floor(x + OX + .5), math.floor(y + OY + .5), c)  # noqa: E731
    if kind == "dust":           # ("dust", x, y, size 0..3): puffs sitting on the surface, out to both sides
        _, x, y, size = item
        for side in (-1, 1):
            for k in range(size + 1):
                r = 1 + k * .8
                cx, cy = x + side * (2 + k * 3.5), y - r
                for dy in range(-int(r) - 1, int(r) + 2):
                    for dx in range(-int(r) - 1, int(r) + 2):
                        if dx * dx + dy * dy <= r * r + .5 and cy + dy < y:
                            shade = DUST[0] if dy < 0 else DUST[1]
                            put(cx + dx, cy + dy, shade)
    elif kind == "lines":        # ("lines", x, y, length): impact lines bursting up from a point
        _, x, y, length = item
        for ang in (-165, -130, -95, -60):
            a = math.radians(ang)
            for t in range(3, 3 + length):
                cx, cy = math.floor(x + t * math.cos(a) + OX + .5), math.floor(y + t * math.sin(a) + OY + .5)
                if 0 <= cx < CW and 0 <= cy < CH and owner[cy, cx] not in ("slipper", "hand", "sleeve"):
                    _put(canvas, owner, cx, cy, (255, 246, 220, 255))
    elif kind == "star":         # ("star", x, y, size): the glint that says now
        _, x, y, size = item
        for t in range(-size, size + 1):
            c = (255, 255, 255, 255) if abs(t) < size else (255, 226, 150, 255)
            put(x + t, y, c)
            put(x, y + t, c)
        put(x, y, (255, 255, 255, 255))
    elif kind == "drop":         # ("drop", x, y): sweat
        _, x, y = item
        for dx, dy, c in ((0, 0, (200, 230, 255, 255)), (0, 1, (140, 190, 240, 255)), (1, 1, (110, 160, 220, 255)),
                          (0, -1, (230, 245, 255, 255))):
            put(x + dx, y + dy, c)
    elif kind == "dizzy":        # ("dizzy", x, y, phase): little stars circling her head
        _, x, y, phase = item
        for k in range(3):
            a = phase + k * math.tau / 3
            sx, sy = x + 9 * math.cos(a), y + 3 * math.sin(a)
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                put(sx + dx, sy + dy, (255, 230, 120, 255) if dx or dy else (255, 255, 255, 255))


def _put(canvas, owner, x, y, colour):
    if 0 <= x < CW and 0 <= y < CH:
        canvas[y, x] = colour
        owner[y, x] = "fx"


# ---------------------------------------------------------------- animations

REST = Pose()


def pose(**kw) -> Pose:
    return replace(REST, **kw)


def idle():
    frames = []
    for i in range(8):
        t = i / 8 * math.tau
        frames.append(pose(
            breathe=.035 * math.sin(t), sy=1 + .018 * math.sin(t), sway=1.2 * math.sin(t + .9), lean=2 * math.sin(t),
            nod=5 * max(0.0, math.sin(2 * t - .6)) - 1,
            hand=(WRIST[0] + 2 * math.sin(t + .5), WRIST[1] + 2.5 * math.sin(t + .3)),
            slip=SLIP_REST + 9 * math.sin(t + 1.1), fore=5 * math.sin(t + .6)))
    return frames


def walk():
    """Her waddle in from the right: short steps, the body rocking from foot to foot over them, the housecoat swinging
    after it, the slipper held up ready and bobbing with each step."""
    frames = []
    for i in range(6):
        t = i / 6 * math.tau
        step = math.sin(t)
        lift = max(0.0, math.sin(t)), max(0.0, -math.sin(t))   # the foot in the air: front, then back
        frames.append(pose(
            lean=2 + 2.5 * step, sy=1 - .02 * abs(math.cos(t)), lift=1.5 * abs(math.sin(t)), sway=-2.2 * math.sin(t - .8),
            breathe=.02 * math.sin(2 * t), nod=2 * math.sin(2 * t + .5),
            hand=(WRIST[0] + 1.5 * math.sin(t + .6), WRIST[1] + 2 * abs(math.sin(t + .4))),
            slip=SLIP_REST + 6 * math.sin(t + 1.0), fore=6 * math.sin(t + .3),
            legs={"leg_front": (-5 * step, -2.5 * lift[0], -6 * lift[0]),
                  "leg_back": (5 * step, -2.5 * lift[1], -6 * lift[1])}))
    return frames


# The two wind-ups end on these. Top lane: up on her toes, leaning back, the slipper straight up over her head, as
# high as it goes. Bottom lane: crouched low and leaning in, the slipper drawn back down by her hip, its toe near the
# floor. Both stay within a slipper's length of her back, so she can stand near the screen's edge.
TOP_HOLD = dict(lean=-9, sy=1.07, lift=3, nod=-10, hand=(84, 12), slip=-92, fore=14, breathe=.04,
                legs={"leg_front": (0, 0, -6), "leg_back": (0, 0, 0)})
LOW_HOLD = dict(lean=6, sy=.87, nod=6, hand=(98, 94), slip=6, elbow=-1, fore=20, breathe=-.02, sway=-2)


def windup_top():
    return [
        pose(lean=-3, sy=1.02, nod=-3, hand=(80, 22), slip=-110, fore=4),
        pose(lean=-6, sy=1.04, lift=1, nod=-6, hand=(82, 16), slip=-100, fore=8),
        pose(lean=-8, sy=1.06, lift=2, nod=-9, hand=(84, 13), slip=-94, fore=12),
        pose(**{**TOP_HOLD, "lean": -11, "hand": (86, 10), "slip": -86}),  # overshoot back
        pose(**TOP_HOLD, fx=[("star", 3)]),
    ]


def windup_bottom():
    return [
        pose(lean=0, sy=.97, nod=3, hand=(94, 62), slip=-30, elbow=-1, fore=6),
        pose(lean=2, sy=.94, nod=4, hand=(98, 76), slip=0, elbow=-1, fore=12, sway=-1),
        pose(lean=4, sy=.91, nod=5, hand=(99, 88), slip=20, elbow=-1, fore=16, sway=-2),
        pose(**{**LOW_HOLD, "sy": .85, "hand": (100, 96), "slip": 0}),  # overshoot down
        pose(**LOW_HOLD, fx=[("star", 3)]),
    ]


# The top lane's ledge is 68 native px over the floor she stands on
TOP_LANE_Y = FLOOR - 68


def slam_top():
    hit = dict(lean=16, sy=.93, nod=10, hand=(18, 55), slip=178, fore=-10, elbow=1, sway=2)
    return [
        pose(lean=5, sy=1.02, nod=-2, hand=(52, 10), slip=-150, fore=0, fx=[("smear", 55)]),     # whipped over her head
        pose(**hit, squeeze=(1.08, .72), fx=[("impact", 2, 4)]),                                # impact
        pose(**{**hit, "lean": 18, "sy": .9, "hand": (19, 56)}, squeeze=(1.04, .86), fx=[("impact", 3)]),  # sinks in
        pose(lean=8, sy=1.02, nod=2, hand=(36, 28), slip=-160, fore=0),                         # recoil up
        idle()[0],                                                                              # settled: idle's own first pose
    ]


def slam_bottom():
    hit = dict(lean=32, sy=.86, nod=16, hand=(26, 125), slip=180, fore=-14, elbow=1, sway=3,
               legs={"leg_front": (-4, 0, 0), "leg_back": (0, 0, 0)})
    return [
        pose(lean=18, sy=.9, nod=10, hand=(26, 100), slip=160, fore=-4, elbow=1, fx=[("smear", -55)]),  # swung low
        pose(**hit, squeeze=(1.08, .7), fx=[("impact", 2, 4)]),                                       # impact
        pose(**{**hit, "lean": 33, "sy": .83, "hand": (26, 125.5)}, squeeze=(1.04, .85), fx=[("impact", 3)]),              # sinks in
        pose(lean=14, sy=.98, nod=6, hand=(34, 72), slip=-170, fore=-2),                              # recoil up
        idle()[0],                                                                                    # settled: idle's own first pose
    ]


# What she throws. The far hand (the slipper's) goes to the pocket at her back hip for a fresh one first, then cocks it:
# high and back for the top lane (up, leaning back), low and back for the bottom one (crouched, leaning in), so the two
# differ from the first frame. The slipper leaves her hand on the fifth frame (RELEASE_FRAME).
THROW_RELEASE = 4


def throw_top():
    return [
        pose(lean=-4, sy=1.02, lift=1, nod=-4, hand=(98, 92), slip=60, elbow=-1, fore=8, hold=False),      # pocket
        pose(lean=-6, sy=1.03, lift=1, nod=-5, hand=(98, 48), slip=-30, fore=10),                           # a fresh one
        pose(lean=-10, sy=1.05, lift=2, nod=-7, hand=(104, 30), slip=8, fore=12),                           # cocked
        pose(lean=-12, sy=1.06, lift=2, nod=-8, hand=(106, 28), slip=16, fore=14),                          # held
        pose(lean=10, sy=.97, nod=6, hand=(20, 42), slip=180, fore=-6, hold=False, fx=[("smear", 60)]),     # whip
        pose(lean=6, sy=.99, nod=3, hand=(42, 66), slip=150, fore=-2, hold=False),                           # follow-through
    ]


def throw_bottom():
    return [
        pose(lean=4, sy=.94, nod=6, hand=(98, 96), slip=60, elbow=-1, fore=10, hold=False),                 # pocket
        pose(lean=2, sy=.92, nod=7, hand=(102, 86), slip=30, elbow=-1, fore=12),                            # a fresh one
        pose(lean=2, sy=.9, nod=8, hand=(106, 86), slip=-60, elbow=-1, fore=14, sway=-1),                   # cocked low, on edge
        pose(lean=1, sy=.88, nod=8, hand=(108, 88), slip=-70, elbow=-1, fore=16, sway=-2),                  # held
        pose(lean=16, sy=.9, nod=10, hand=(24, 100), slip=180, fore=-8, hold=False, sway=2,
             fx=[("smear", -60)]),                                                                           # skimmed
        pose(lean=10, sy=.93, nod=6, hand=(42, 96), slip=170, fore=-4, hold=False),                          # follow-through
    ]


BOOMERANG_RELEASE = 6


def boomerang():
    """The boomerang: she twirls the slipper over her head, then a big sidearm throw from far back."""
    return [
        pose(lean=-4, sy=1.02, nod=-6, hand=(80, 10), slip=-90, fore=6),                                    # twirl
        pose(lean=-5, sy=1.03, nod=-6, hand=(74, 12), slip=0, fore=8),
        pose(lean=-5, sy=1.03, nod=-7, hand=(80, 8), slip=90, fore=8),
        pose(lean=-4, sy=1.02, nod=-6, hand=(86, 12), slip=180, fore=6),
        pose(lean=-12, sy=1.0, nod=-4, hand=(108, 56), slip=0, fore=12),                                    # far back
        pose(lean=-14, sy=.99, nod=-5, hand=(110, 58), slip=8, fore=14),                                    # held
        pose(lean=14, sy=.96, nod=6, hand=(22, 60), slip=180, fore=-8, hold=False, fx=[("smear", 60)]),     # let go
        pose(lean=8, sy=.98, nod=3, hand=(40, 76), slip=160, fore=-4, hold=False),
    ]


TANTRUM_RELEASES = (2, 6)


def tantrum():
    """Stamping her feet and hurling curlers from her near fist, the slipper shaken overhead."""
    up_front = {"leg_front": (0, -6, -10), "leg_back": (0, 0, 0)}
    up_back = {"leg_front": (0, 0, 0), "leg_back": (0, -6, 10)}
    return [
        pose(sy=1.03, lift=2, nod=-6, hand=(76, 24), slip=-120, fore=30, legs=up_front),                    # foot up, fist to her hair
        pose(sy=.9, nod=-2, hand=(78, 30), slip=-140, fore=24, fx=[("dust", 46, FLOOR, 1)]),                 # stamp
        pose(lean=8, sy=.97, nod=4, hand=(74, 32), slip=-150, fore=-24),                                    # hurl
        pose(sy=1.03, lift=2, nod=-6, hand=(78, 24), slip=-110, fore=4, legs=up_back),                      # other foot up
        pose(sy=.9, nod=-2, hand=(80, 30), slip=-130, fore=30, fx=[("dust", 80, FLOOR, 1)]),                 # stamp
        pose(lean=-4, sy=1.0, nod=-6, hand=(76, 26), slip=-120, fore=34),                                   # cocked
        pose(lean=8, sy=.97, nod=4, hand=(74, 32), slip=-150, fore=-24),                                    # hurl
        pose(lean=2, sy=1.0, nod=0, hand=(76, 30), slip=-135, fore=0),
    ]


def tired():
    frames = []
    for i in range(6):
        t = i / 6 * math.tau
        frames.append(pose(
            lean=9 + 2 * math.sin(t), sy=.95 + .03 * math.sin(t), breathe=.05 * math.sin(t), nod=12 + 4 * math.sin(t),
            hand=(104, 84 + 2 * math.sin(t - .6)), slip=92 + 6 * math.sin(t - 1.2), elbow=-1, fore=-16 + 3 * math.sin(t),
            fx=[("drop", 30 - (i % 3) * 2, 34 + (i % 3) * 3)] if i % 3 != 2 else []))
    return frames


def hurt():
    """Hit: she flinches back with her fist up to her face and the slipper pulled in, then staggers forward and
    gathers herself. The first frame is flashed pale."""
    return [
        pose(lean=-10, sy=.92, move=(4, 0), nod=-12, hand=(90, 40), slip=-80, fore=36, sway=-3, flash=.55),
        pose(lean=-7, sy=.95, move=(3, 0), nod=-8, hand=(90, 38), slip=-90, fore=28, sway=-1),
        pose(lean=7, sy=.97, move=(1, 0), nod=9, hand=(84, 36), slip=-115, fore=4, sway=2),
        pose(lean=1, sy=1.0, nod=0, hand=(78, 33), slip=-130, fore=0),
    ]


def defeat():
    """The last hit knocks the slipper out of her hand and the curlers off her head; she wobbles back and forth, tips
    over backwards and sits down hard, legs out; the slipper comes down on her head and she sits there, seeing stars."""
    back_heel, front_toe = (86.0, 124.0), (40.0, 124.0)
    sit = dict(lift=-13, sy=.9, lean=-8, legs={"leg_front": (-6, 10, 68), "leg_back": (-4, 11, 58)})
    slumped = dict(sit, nod=12, hand=(92, 98), slip=60, elbow=-1, fore=-18)
    return [
        pose(lean=-12, sy=1.04, nod=-14, hand=(102, 16), slip=-20, fore=26, move=(3, 0), flash=.55,
             free=((108, 2), -40)),                                                                 # struck: it flies
        pose(lean=-8, nod=-10, hand=(96, 22), slip=-50, fore=18, move=(3, 0), turn=7, about=back_heel,
             free=((116, -4), 10), popped=[(30, 18, 40), (64, 32, -30), (76, 32, 30)]),            # wobbles back
        pose(lean=8, sy=.98, nod=8, hand=(86, 30), slip=-110, fore=-6, turn=-7, about=front_toe,
             free=((122, -8), 70), popped=[(22, 6, 100), (58, 20, -80), (86, 22, 90)]),             # and forward
        pose(lean=-10, nod=-8, hand=(98, 26), slip=-60, fore=14, turn=11, about=back_heel,
             free=((126, -10), 130), popped=[(16, 0, 170), (52, 12, -140), (94, 18, 150)]),          # back, further
        pose(lean=-16, sy=1.0, nod=-12, hand=(104, 30), slip=-40, fore=20, turn=20, about=back_heel,
             free=((128, -6), 190), popped=[(10, 6, 240), (46, 10, -200), (100, 26, 210)]),         # tips over
        pose(**{**slumped, "sy": .8, "nod": 16}, free=((124, 0), 250),
             popped=[(6, 26, 300), (42, 26, -260), (106, 50, 270)], fx=[("dust", 40, FLOOR, 2), ("dust", 90, FLOOR, 1)]),
        pose(**{**slumped, "lift": -10, "sy": .95, "nod": 6}, free=((110, 4), 300),
             popped=[(4, 52, 360), (38, 60, -320), (108, 80, 330)]),                                  # bounces
        pose(**slumped, free=((96, 6), 340), popped=[(2, 118, 400), (36, 120, -380), (112, 118, 380)]),
        pose(**{**slumped, "sy": .86, "nod": 18}, free=((70, 32), 375), popped=[(2, 118, 400), (36, 120, -380), (112, 118, 380)],
             fx=[("lines", 52, 30, 3)]),                                                              # bonk
        pose(**slumped, free=((68, 30), 360), popped=[(2, 118, 400), (36, 120, -380), (112, 118, 380)],
             fx=[("dizzy", 58, 26, 0.0)]),                                                             # stars
    ]


ANIMATIONS = {
    # name: (make, fps, loop, frames held at the end in the previews)
    "idle": (idle, 8, True),
    "walk": (walk, 10, True),
    "windup-top": (windup_top, 12, False),
    "windup-bottom": (windup_bottom, 12, False),
    "slam-top": (slam_top, 18, False),
    "slam-bottom": (slam_bottom, 18, False),
    "throw-top": (throw_top, 12, False),
    "throw-bottom": (throw_bottom, 12, False),
    "boomerang": (boomerang, 12, False),
    "tantrum": (tantrum, 10, False),
    "tired": (tired, 6, True),
    "hurt": (hurt, 12, False),
    "defeat": (defeat, 10, False),
}


def _turned(big: np.ndarray, centre, degrees: float, size: int, zoom: float = 1.0) -> np.ndarray:
    """A part's 8x image turned about a painting point and sampled at native pixel centres onto a size x size square.
    zoom: how much bigger than the painting it is drawn."""
    m = np.eye(3)
    lin0 = _rot(degrees) * zoom
    m[:2, :2] = lin0
    m[:2, 2] = np.array([size / 2, size / 2]) - lin0 @ np.array(centre)
    lin, t = m[:2, :2], m[:2, 2]
    out = np.zeros((2, 3))
    out[:, :2] = lin / K
    out[:, 2] = lin @ np.array([.5 / K, .5 / K]) + t - .5
    return cv2.warpAffine(big, out, (size, size), flags=cv2.INTER_NEAREST)


def _lit(img: np.ndarray, colour) -> np.ndarray:
    """The rim light on a flying thing: its edge facing ahead (left), as on her."""
    out = img.copy()
    empty = out[..., 3] < 128
    left = np.pad(empty, ((0, 0), (1, 0)), constant_values=True)[:, :-1]
    lit = ~empty & left
    out[lit, :3] = (out[lit, :3] * .2 + np.array(colour[:3]) * .8).astype(np.uint8)
    return out


def _glow(img: np.ndarray, colour, radius: float = 2.5, alpha: float = .7) -> np.ndarray:
    """A soft halo under the sprite, baked in (nothing glows at runtime)."""
    from PIL import ImageFilter
    a = Image.fromarray(((img[..., 3] > 128) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    halo = np.clip(np.asarray(a).astype(float) / 255 * 1.8, 0, alpha)
    base = np.zeros_like(img)
    base[..., :3] = colour[:3]
    base[..., 3] = (halo * 255).astype(np.uint8)
    out = Image.fromarray(base)
    out.alpha_composite(Image.fromarray(img))
    return np.asarray(out)


def _curlers() -> list[np.ndarray]:
    """A hair curler, drawn by hand on the pixel grid at its own size (no blur): a hot pink roller with a lighter top
    edge, a darker belly, mesh bars across it and pale end caps, a dark line inside its outline and a pale pink one
    round the outside so it reads on any floor. Big, as it has to be read in flight: three turns of it, 46 px cells."""
    body, light, belly, bars, cap = (255, 110, 175), (255, 190, 225), (196, 58, 128), (140, 30, 96), (255, 226, 240)
    outline, halo = (88, 18, 64), (255, 154, 208)
    w, h = 34, 20
    roller = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            c = body
            if y <= 3:
                c = light
            elif y >= h - 4:
                c = belly
            if x % 3 == 1 and 1 <= y <= h - 2:
                c = bars
            if x <= 2 or x >= w - 3:
                c = cap
            if y in (0, h - 1) or x in (0, w - 1):
                c = outline
            roller[y, x] = (*c, 255)
    for y in (0, h - 1):
        roller[y, 0] = roller[y, w - 1] = (0, 0, 0, 0)
    big = np.zeros((128 * K, 128 * K, 4), np.uint8)
    big[:h * K, :w * K] = np.repeat(np.repeat(roller, K, 0), K, 1)
    frames = []
    for i in range(3):
        img = _turned(big, (w / 2, h / 2), i * 60, 46)
        alpha = img[..., 3] > 128
        ring = ni.binary_dilation(alpha, structure=np.ones((3, 3))) & ~alpha
        out = img.copy()
        out[~alpha] = 0
        out[ring] = (*halo, 255)
        frames.append(out)
    return frames


def projectiles() -> dict[str, list[Image.Image]]:
    """What she throws, each on its own square cell with its middle as the pivot: the slipper tumbling end over end with
    a short whoosh behind it (it flies left), the boomerang slipper spinning flat with a warm glow, a curler turning,
    and the puff where things hit."""
    rigx = rig()
    slipper = rigx.parts["slipper"]
    centre = (78.0, 18.0)
    rim = slipper.rim
    kapec = []
    for i in range(6):
        # Bigger than the painting's slipper, with a pale rim all round it: it reads against the dark levels
        img = _glow(_lit(_turned(slipper.big, centre, i * 60, 60, 1.3), rim), (255, 238, 200), 2.0, .8)
        trail = Image.new("RGBA", (96, 60))
        from PIL import ImageDraw
        d = ImageDraw.Draw(trail)
        ys = np.nonzero(img[..., 3].max(1) > 128)[0]
        for k, y in enumerate((ys.min() + 3, (ys.min() + ys.max()) // 2, ys.max() - 3)):
            x0 = 66 + (k % 2) * 2
            d.line([(x0, y), (x0 + 18 - 5 * (k == 1), y)], fill=(236, 226, 210, 170))
        trail.alpha_composite(Image.fromarray(img), (18, 0))
        kapec.append(trail)
    boom = [Image.fromarray(_glow(_lit(_turned(slipper.big, centre, i * 45, 84, 1.6), rim), (255, 190, 70), 3.2, .95))
            for i in range(8)]
    curler = [Image.fromarray(c) for c in _curlers()]
    puff = []
    for r_ in (3, 5, 7):
        img = Image.new("RGBA", (20, 20))
        d = ImageDraw.Draw(img)
        for dx, dy, rr in ((-r_ // 2, 1, r_ * .7), (r_ // 2, 1, r_ * .7), (0, -1, r_)):
            d.ellipse((10 + dx - rr, 10 + dy - rr, 10 + dx + rr, 10 + dy + rr), fill=DUST[1 if r_ > 5 else 0])
        if r_ == 7:
            img = Image.fromarray(np.where((np.asarray(img)[..., 3:] > 0) & ((np.indices((20, 20)).sum(0) % 3 == 0)[..., None]),
                                           0, np.asarray(img)).astype(np.uint8))
        puff.append(img)
    return {"kapec": kapec, "boomerang-slipper": boom, "curler": curler, "puff": puff}


def render(name: str) -> list[Drawn]:
    make = ANIMATIONS[name][0]
    return [draw(p) for p in make()]


# ---------------------------------------------------------------- previews

BG = (52, 56, 66, 255)
ZOOM = 5
HOLD_MS = {"windup-top": 600, "windup-bottom": 600, "slam-top": 250, "slam-bottom": 250, "hurt": 200, "defeat": 900}


def _crop_box(all_frames: list[Drawn]) -> tuple[int, int, int, int]:
    """One box for every animation, so the floor and her feet never move between them."""
    box = [CW, CH, 0, 0]
    for d in all_frames:
        b = d.image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
        if b:
            box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    return (box[0] - 2, box[1] - 2, box[2] + 2, max(box[3], FLOOR + OY) + 2)


def _staged(image: Image.Image, box, zoom=ZOOM, lanes=True) -> Image.Image:
    """On the mid-dark ground, the floor she stands on and the top lane's height marked faintly."""
    w, h = box[2] - box[0], box[3] - box[1]
    out = Image.new("RGBA", (w, h), BG)
    if lanes:
        from PIL import ImageDraw
        d = ImageDraw.Draw(out)
        floor = FLOOR + OY - box[1]
        top = TOP_LANE_Y + OY - box[1]
        d.line([(0, floor), (w, floor)], fill=(84, 92, 104, 255))
        for x in range(0, w, 4):
            d.point((x, top), fill=(84, 92, 104, 255))
            d.point((x + 1, top), fill=(84, 92, 104, 255))
    out.alpha_composite(image.crop(box))
    return out.resize((w * zoom, h * zoom), Image.NEAREST)


def _gif(path, images, durations):
    images[0].save(path, save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2,
                   optimize=False)


def previews(out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    rendered = {name: render(name) for name in ANIMATIONS}
    failures = [f"{name}[{i}] {f}" for name, frames in rendered.items() for i, d in enumerate(frames) for f in d.failures]
    box = _crop_box([d for frames in rendered.values() for d in frames])
    for name, frames in rendered.items():
        _, fps, loop = ANIMATIONS[name]
        step = round(1000 / fps)
        images = [_staged(d.image, box) for d in frames]
        durations = [step] * len(images)
        if loop:
            images, durations = images * 2, durations * 2
        else:
            durations[-1] = HOLD_MS.get(name, 300)
        _gif(out / f"{name}.gif", images, durations)
    # sheet: one row per animation, native size x3, frame numbers under
    from PIL import ImageDraw
    cell = (box[2] - box[0], box[3] - box[1])
    zoom = 3
    rows = list(rendered.items())
    width = max(len(f) for _, f in rows) * (cell[0] * zoom + 4) + 90
    sheet = Image.new("RGBA", (width, len(rows) * (cell[1] * zoom + 14)), (30, 32, 38, 255))
    d = ImageDraw.Draw(sheet)
    for r, (name, frames) in enumerate(rows):
        y = r * (cell[1] * zoom + 14)
        d.text((4, y + 4), f"{name}\n{ANIMATIONS[name][1]} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        for i, fr in enumerate(frames):
            x = 90 + i * (cell[0] * zoom + 4)
            sheet.alpha_composite(_staged(fr.image, box, zoom), (x, y))
            bad = " !" if fr.failures else ""
            d.text((x + 2, y + cell[1] * zoom + 1), f"{i}{bad}", fill=(255, 120, 120, 255) if bad else (160, 160, 160, 255))
    sheet.save(out / "sheet.png")
    # the fight: idle, top, idle, bottom, again faster, tired, hurt, defeat
    seq, durs = [], []

    def play(name, times=1, speed=1.0, hold=None):
        _, fps, loop = ANIMATIONS[name]
        for _ in range(times):
            for i, fr in enumerate(rendered[name]):
                seq.append(_staged(fr.image, box, 3))
                durs.append(round(1000 / fps / speed))
        if hold:
            durs[-1] = hold
    play("idle", 1)
    play("windup-top", hold=600); play("slam-top", hold=250)
    play("idle", 1)
    play("windup-bottom", hold=600); play("slam-bottom", hold=250)
    play("idle", 1, 1.3)
    play("windup-top", speed=1.5, hold=350); play("slam-top", speed=1.3, hold=180)
    play("windup-bottom", speed=1.5, hold=350); play("slam-bottom", speed=1.3, hold=180)
    play("tired", 3)
    play("hurt", hold=200)
    play("defeat", hold=1500)
    _gif(out / "fight.gif", seq, durs)
    parts_sheet(out / "parts.png")
    (out / "box.txt").write_text(f"{box} cell {cell} pivot (feet on the floor) {(64 + OX - box[0], FLOOR + OY - box[1])}\n")
    return failures


def parts_sheet(path: Path) -> None:
    """Each cut piece on its own, filled where it was hidden, the joints it turns about marked."""
    from PIL import ImageDraw
    rigx = rig()
    order = ["head", "body", "forearm", "hand", "slipper", "leg_front", "leg_back"]
    marks = {"head": [NECK], "body": [NECK, ELBOW, SHOULDER, HIP, *LEG_HIPS.values()], "forearm": [ELBOW],
             "hand": [WRIST, GRIP], "slipper": [GRIP], "leg_front": [LEG_HIPS["leg_front"]],
             "leg_back": [LEG_HIPS["leg_back"]]}
    zoom, pad = 5, 6
    tiles = []
    for name in order:
        img = rigx.parts[name].image
        ys, xs = np.nonzero(img[..., 3] > 128)
        box = (xs.min() - pad, ys.min() - pad, xs.max() + pad + 1, ys.max() + pad + 1)
        tile = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), BG)
        tile.alpha_composite(Image.fromarray(img).crop(box))
        tile = tile.resize((tile.width * zoom, tile.height * zoom), Image.NEAREST)
        d = ImageDraw.Draw(tile)
        for jx, jy in marks[name]:
            cx, cy = (jx - box[0]) * zoom, (jy - box[1]) * zoom
            d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), outline=(80, 255, 120, 255), width=2)
        d.text((4, 4), name, fill=(255, 255, 255, 255))
        tiles.append(tile)
    # the drawn sleeve on its own, at rest
    f = Frame(REST)
    s, e, w, _ = f.arm()
    sleeve = Image.fromarray(_sleeve(f, rigx, s, e, w))
    b = sleeve.getbbox()
    tile = Image.new("RGBA", (b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad), BG)
    tile.alpha_composite(sleeve.crop(b), (pad, pad))
    tile = tile.resize((tile.width * zoom, tile.height * zoom), Image.NEAREST)
    ImageDraw.Draw(tile).text((4, 4), "sleeve\n(drawn)", fill=(255, 255, 255, 255))
    tiles.append(tile)
    width = sum(t.width + 8 for t in tiles)
    height = max(t.height for t in tiles)
    sheet = Image.new("RGBA", (width, height), (30, 32, 38, 255))
    x = 0
    for t in tiles:
        sheet.alpha_composite(t, (x, 0))
        x += t.width + 8
    sheet.save(path)


if __name__ == "__main__":
    problems = previews(Path(sys.argv[1]))
    print("\n".join(problems) if problems else "every joint holds, every frame in one piece")
    sys.exit(1 if problems else 0)
