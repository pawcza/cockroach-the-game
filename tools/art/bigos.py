"""DJ Bigos, the second boss: the owner's still (bigos-figure) cut into parts and posed per frame.

The render is painted, not on a pixel grid (no period in its edges), so it is read once at 9.5 render px per texel
(area average, then snapped to its own 48-colour palette): 108 native px, the figure 100 px from the top of the ball to
the soles, Lodzia's height. Nothing is resampled after that: parts are posed at 8x after a Scale2x upscale and sampled
back per pixel (RotSprite), as in lodzia.py.

Parts: the body (sequin jumpsuit, legs and boots: one piece that bounces at the knees, sways at the hips, leans and
squashes as one warp, so it has no seams), the two white gloves (cut, turned at the wrist), both sleeves (drawn per
frame as capsules in the jumpsuit's own painted sequins, like Lodzia's far sleeve, so any arm pose works and the
elbow is always covered), the mirror ball (redrawn per frame on a sphere in the painting's tile colours and light: at
native size the painted tiles are 4 px, and the ball has to spin, tilt, crack and shed tiles), the deck and the
speaker. The booth behind him is the deck on a flight case drawn to fit it, in the painting's dark navy and the silver of
his boots; the speaker is its own sprite, one per lane, read from the render at a finer grid so it stands half as tall
again as in the painting.

Every DJ frame is checked: each joint lies on both parts it joins, and the figure is one piece (only flying tiles, the
rolled-off ball and effects may float). `python3 tools/art/bigos.py OUT_DIR` writes the previews.
"""
import math
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

sys.path.insert(0, str(Path(__file__).parent))
import bossrig as br  # noqa: E402

SOURCE = "art/sprites/bosses/bigos-figure.png"
SCALE = 9.5            # render px per native px
N = 108                # native grid (1026 / 9.5)

# Joints and landmarks, native painting px
BALL_C = (62.4, 21.8)
BALL_R = 18.3
NECK = (62.4, 38.5)
HIP = (64.0, 63.0)
KNEE = 80.0
BOOT = 90.0                       # where the boots start: below this nothing moves
SHOULDER_N = (61.0, 42.5)         # near arm (the one in front, toward the deck)
SHOULDER_F = (72.0, 44.0)         # far arm
REST_N = dict(elbow=(50.0, 50.5), wrist=(42.6, 44.2))
REST_F = dict(elbow=(78.4, 52.1), wrist=(80.0, 41.6))
UPPER_N, FORE_N = 13.5, 9.5
UPPER_F, FORE_F = 10.0, 9.0
SLEEVE_N, SLEEVE_F = 5.6, 5.6     # sleeve widths
MAX_STRETCH = 1.25

# Cut lines, render px (divided by SCALE when used)
GLOVE_N = [(278, 282), (330, 268), (350, 300), (392, 298), (402, 345), (448, 392), (444, 402), (384, 474), (352, 482),
           (300, 440), (266, 362), (268, 300)]
GLOVE_F = [(712, 322), (742, 298), (762, 328), (776, 292), (804, 298), (814, 342), (806, 384), (796, 446), (762, 424),
           (736, 414), (732, 378)]
BODY = [(532, 340), (700, 340), (712, 400), (714, 500), (706, 560), (722, 640), (770, 720), (840, 1000), (430, 1000), (437, 900), (484, 860), (484, 790),
        (449, 750), (457, 700), (484, 650), (505, 600), (522, 560), (522, 456), (540, 380)]
DECK = [(160, 560), (520, 556), (520, 660), (160, 660)]
SPEAKER = [(136, 648), (388, 648), (388, 972), (136, 972)]
GLOVE_N_TIP = (300, 300)
GLOVE_F_TIP = (790, 300)


def _px(points):
    return [(x / SCALE, y / SCALE) for x, y in points]


def _poly(points):
    return br.poly(_px(points), size=N)


def _native() -> np.ndarray:
    """The render read at 9.5 px per texel: background (white, inside gaps too) gone, area-averaged, alpha cut."""
    a = np.asarray(Image.open(SOURCE).convert("RGBA")).copy()
    white = a[..., :3].min(2) > 225
    lab, n = ni.label(white)
    sizes = ni.sum(white, lab, range(1, n + 1))
    bg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 1000])
    bg = ni.binary_dilation(bg, iterations=2)
    a[bg, 3] = 0
    pad = np.zeros((round(N * SCALE), round(N * SCALE), 4), np.float32)
    pad[:1024, :1024] = a
    pad[..., :3] *= pad[..., 3:4] / 255
    s = cv2.resize(pad, (N, N), interpolation=cv2.INTER_AREA)
    alpha = s[..., 3]
    rgb = s[..., :3] / np.maximum(alpha[..., None], 1) * 255
    return np.dstack([rgb, (alpha > 128) * 255]).clip(0, 255).astype(np.uint8)


def _capsule(a, b, r, size=N) -> np.ndarray:
    ys, xs = np.mgrid[0:size, 0:size] + .5
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    t = np.clip(((xs - a[0]) * d[0] + (ys - a[1]) * d[1]) / max(1e-6, d @ d), 0, 1)
    return np.hypot(xs - a[0] - t * d[0], ys - a[1] - t * d[1]) <= r


def _texture_fill(rgba: np.ndarray, known: np.ndarray, want: np.ndarray, step=(0, 5)) -> np.ndarray:
    """Holes in a sequin surface filled with the sequins next to them: each wanted pixel copies the nearest known
    pixel along step (and the opposite way), so the fill keeps the painted sparkle instead of a smooth smear."""
    out = rgba.copy()
    todo = want & ~known
    for k in range(1, 12):
        if not todo.any():
            break
        for sx, sy in ((step[0] * k, step[1] * k), (-step[0] * k, -step[1] * k), (k * 3, 0), (-k * 3, 0)):
            src = np.roll(np.roll(known, -sy, 0), -sx, 1)
            take = todo & src
            if take.any():
                ys, xs = np.nonzero(take)
                out[ys, xs] = rgba[(ys + sy) % N, (xs + sx) % N]
                out[ys, xs, 3] = 255
                todo &= ~take
    return out


class Bigos:
    def __init__(self):
        native = _native()
        solid = native[..., 3] > 128
        self.palette = br.palette(native[solid][:, :3], 48)
        native[solid, :3] = br.snap(native[solid][:, :3], self.palette)
        self.native = native
        ys, xs = np.mgrid[0:N, 0:N] + .5

        ball = np.hypot(xs - BALL_C[0], ys - BALL_C[1]) <= BALL_R + .6
        ball &= ys < NECK[1] - 1.5
        glove_n = _poly(GLOVE_N) & solid
        glove_f = _poly(GLOVE_F) & solid & ~ball
        arm_n = (_capsule(SHOULDER_N, REST_N["elbow"], 3.6) | _capsule(REST_N["elbow"], REST_N["wrist"], 3.4)) & solid
        arm_f = (_capsule(SHOULDER_F, REST_F["elbow"], 3.4) | _capsule(REST_F["elbow"], REST_F["wrist"], 3.6)) & solid
        body_poly = _poly(BODY)
        body = solid & body_poly & ~ball & ~glove_n & ~glove_f & ~arm_n & ~arm_f
        body = self._largest(body)
        # the shoulders closed where the arms came off, filled with the suit's sequins
        closing = (_poly([(540, 372), (640, 352), (700, 372), (716, 470), (690, 520), (560, 520), (528, 470)])
                   & ~body & ~_poly([(0, 0), (1026, 0), (1026, 340), (0, 340)]))
        closing &= ~(np.hypot(xs - BALL_C[0], ys - BALL_C[1]) <= BALL_R - 1)
        body_rgba = native.copy()
        body_rgba[~body, 3] = 0
        body_rgba = _texture_fill(body_rgba, body, closing)
        body_mask = body | closing
        body_rgba[~body_mask, 3] = 0
        # the body keeps its painted rim (it only bends a little); the parts that turn are relit per frame in its colour
        own = native.copy()
        own[..., 3] = body_mask * 255
        _, body_rim, _ = br.strip(own, body_rgba.copy(), body_mask, self.palette)

        deck = _poly(DECK) & solid & ~body_mask & ~glove_n
        deck_rgba = native.copy()
        deck_rgba[~deck, 3] = 0
        deck_rgba = self._deck_end(deck_rgba, deck)
        speaker = _poly(SPEAKER) & solid & ~body_mask & ~deck
        spk = native.copy()
        spk[~speaker, 3] = 0
        spk = self._speaker_top(spk, speaker)

        self.parts = {
            "body": br.Part("body", body_rgba, rim=body_rim),
            "glove_n": self._cut(glove_n, strip=False),
            "glove_f": self._cut(glove_f, strip=False),
            "deck": br.Part("deck", deck_rgba),
            "speaker": br.Part("speaker", spk),
        }
        for p in self.parts.values():
            p.big = br.big(p.image)
        self.cloth = br.big(body_rgba)          # the sleeves' sequins, from the suit itself
        self.ball_paint = self._ball_paint(native)
        self.booth_big = br.big(self._flight_case(deck))
        self.rim = body_rim

    @staticmethod
    def _largest(mask):
        lab, n = ni.label(mask)
        if n <= 1:
            return mask
        sizes = ni.sum(mask, lab, range(1, n + 1))
        return lab == (int(np.argmax(sizes)) + 1)

    def _cut(self, mask, strip=True) -> br.Part:
        rgba = self.native.copy()
        rgba[~mask, 3] = 0
        rim = None
        if strip:
            rgba, rim, _ = br.strip(self.native, rgba, mask, self.palette)
        rgba[~mask, 3] = 0
        return br.Part("", rgba, rim=rim)

    def _deck_end(self, rgba, deck):
        """The deck's right end, behind his thigh in the painting: its columns carried on to the end."""
        cols = np.nonzero(deck.any(0))[0]
        right = int(cols.max())
        end = int(round(DECK[1][0] / SCALE)) - 1
        top = {x: np.nonzero(deck[:, x])[0] for x in range(cols.min(), right + 1)}
        # copy the column three in from the visible end, rows and all, out to the deck's end
        src = right - 3
        rows = top[src]
        for x in range(right - 1, end + 1):
            rgba[rows, x] = rgba[rows, src - (x - right + 1) % 3]
        # the last column is the deck's dark end cap
        rgba[rows, end] = (rgba[rows, end].astype(int) * .55).astype(np.uint8)
        rgba[rows, end, 3] = 255
        return rgba

    def _flight_case(self, deck: np.ndarray) -> np.ndarray:
        """The deck's stand: a flight case exactly the deck's width from under it to the floor. Dark navy panels from
        the speaker's paint, aluminium edges and corner caps in the boots' silver, a recessed handle, the warm light
        along its left edge as on everything else in the painting."""
        cols = np.nonzero(deck.any(0))[0]
        x0, x1 = int(cols.min()) + 1, int(round(DECK[1][0] / SCALE)) - 1
        y0, y1 = int(np.nonzero(deck.any(1))[0].max()), FLOOR - 1
        out = np.zeros((N, N, 4), np.uint8)
        navy = [(26, 27, 40), (35, 36, 51), (44, 46, 62)]
        alu = [(84, 89, 108), (130, 132, 147), (182, 190, 197), (225, 220, 214)]
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                t = (y - y0) / max(1, y1 - y0)
                c = navy[2] if t < .3 else (navy[1] if t < .7 else navy[0])   # lit from above, darker to the floor
                out[y, x] = (*c, 255)
        # a middle seam where the lid meets the case
        mid = y0 + (y1 - y0) // 3
        out[mid, x0:x1 + 1, :3] = alu[0]
        out[mid + 1, x0:x1 + 1, :3] = navy[2]
        # aluminium edges: lit on top and left, darker on the right and bottom
        out[y0, x0:x1 + 1, :3] = alu[2]
        out[y0 + 1, x0:x1 + 1, :3] = alu[1]
        out[y1, x0:x1 + 1, :3] = alu[0]
        out[y0:y1 + 1, x0, :3] = alu[2]
        out[y0:y1 + 1, x0 + 1, :3] = alu[1]
        out[y0:y1 + 1, x1, :3] = alu[0]
        out[y0:y1 + 1, x1 - 1, :3] = alu[1]
        # corner caps with a rivet
        for cx, cy in ((x0, y0), (x1 - 2, y0), (x0, y1 - 2), (x1 - 2, y1 - 2)):
            out[cy:cy + 3, cx:cx + 3, :3] = alu[2]
            out[cy + 1, cx + 1, :3] = alu[0]
            out[cy, cx, :3] = alu[3]
        # the recessed handle in the lower panel
        hx, hy = (x0 + x1) // 2, mid + (y1 - mid) // 2
        out[hy - 1, hx - 4:hx + 5, :3] = alu[0]
        out[hy, hx - 4:hx + 5, :3] = (14, 14, 22)
        out[hy + 1, hx - 4:hx + 5, :3] = alu[2]
        out[hy - 1:hy + 2, hx - 5, :3] = alu[1]
        out[hy - 1:hy + 2, hx + 5, :3] = alu[0]
        # the warm light on its left edge, from ahead
        out[y0:y1 + 1, x0, :3] = (np.array(alu[2]) * .4 + np.array(self.ball_paint["warm"]) * .6).astype(np.uint8)
        return out

    def _speaker_top(self, rgba, mask):
        """The cabinet's top edge, under the deck's feet in the painting: the first full row carried up."""
        rows = np.nonzero(mask.any(1))[0]
        cols = np.nonzero(mask.any(0))[0]
        full = [y for y in rows if mask[y, cols.min() + 1:cols.max()].mean() > .95]
        y0 = full[0]
        for y in range(rows.min(), y0):
            rgba[y, cols.min():cols.max() + 1] = rgba[y0, cols.min():cols.max() + 1]
            rgba[y, cols.min():cols.max() + 1, 3] = 255 * mask[y0, cols.min():cols.max() + 1]
        top = rows.min()
        rgba[top, cols.min():cols.max() + 1, :3] = (rgba[top + 2, cols.min():cols.max() + 1, :3].astype(int) * 1.25
                                                     ).clip(0, 255).astype(np.uint8)
        return rgba

    def _ball_paint(self, native):
        """What the painted ball looks like, read for the redraw: its light (a blurred brightness over the sphere) and
        its tile colours from dark to bright, and the warm rim on the side toward the light."""
        a = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.float32)
        c = np.array(BALL_C) * SCALE
        r = BALL_R * SCALE
        ys, xs = np.mgrid[0:1024, 0:1024]
        inside = np.hypot(xs - c[0], ys - c[1]) < r * .97
        lum = a.mean(2)
        # tiles: pixels away from grout (grout is the local lighter-violet net); take each tile's colour by its median
        light = cv2.GaussianBlur(cv2.resize(lum * inside, (N, N), interpolation=cv2.INTER_AREA), (0, 0), 3.5)
        weight = cv2.GaussianBlur(cv2.resize(inside.astype(np.float32), (N, N), interpolation=cv2.INTER_AREA), (0, 0), 3.5)
        light = light / np.maximum(weight, 1e-3)
        pix = a[inside].reshape(-1, 3)
        pix = pix[::7]
        ramp = br.palette(pix.astype(np.uint8), 12)
        ramp = ramp[np.argsort(ramp.astype(int).sum(1))]
        warmish = (ramp[:, 0].astype(int) - ramp[:, 2].astype(int)) > 40
        cool = ramp[~warmish]
        warm = ramp[warmish][0] if warmish.any() else np.array([224, 150, 84], np.uint8)
        grout = np.array([150, 148, 176], np.uint8)
        disc = np.hypot(np.arange(N)[None, :] + .5 - BALL_C[0], np.arange(N)[:, None] + .5 - BALL_C[1]) < BALL_R * .9
        lrange = (float(np.percentile(light[disc], 3)), float(np.percentile(light[disc], 97)))
        return dict(light=light, cool=cool, warm=warm, mauve=np.array([178, 138, 168]), grout=grout, lrange=lrange)


RIG = None


def rig() -> Bigos:
    global RIG
    if RIG is None:
        RIG = Bigos()
    return RIG


# ---------------------------------------------------------------- the DJ: pose, warp, layers

FLOOR = 105            # the first row under his soles, painting px
OX, OY = 34, 40        # where the painting's (0, 0) sits on the DJ canvas, native px
CW, CH = 176, 154
CANVAS = br.Canvas(OX, OY, CW, CH)
TOP_LANE_Y = FLOOR - 68
BEAM_HALF = 11         # the beam's reach either side of its axis: 23 px of light, the roach's whole body in a lane
BEAM_AXIS = {"top": TOP_LANE_Y - BEAM_HALF - 1.0, "bottom": FLOOR - BEAM_HALF - 1.0}
NEAR_REST_DIR = math.degrees(math.atan2(GLOVE_N_TIP[1] / SCALE - REST_N["wrist"][1], GLOVE_N_TIP[0] / SCALE - REST_N["wrist"][0]))
FAR_REST_DIR = math.degrees(math.atan2(GLOVE_F_TIP[1] / SCALE - REST_F["wrist"][1], GLOVE_F_TIP[0] / SCALE - REST_F["wrist"][0]))
CHEST = (65.0, 50.0)


@dataclass
class Ball:
    """The mirror ball. spin: turns about its own axis, in loops (1.0 = the tile pattern comes round once, 4 equator
    tiles). roll: the ball knocked over in the screen plane (degrees, clockwise). pitch: tipped toward us (degrees).
    dark: its lights dying, 0..1. missing: how many tiles have come off (the most exposed first). cracks: a crack
    across it, 0..1. free: off the neck, (centre x, centre y) in painting px."""
    spin: float = 0.0
    roll: float = 0.0
    pitch: float = 0.0
    dark: float = 0.0
    missing: int = 0
    cracks: float = 0.0
    free: tuple | None = None
    squash: float = 1.0
    glint: int = 1         # 0 none, 1 small, 2 the beat's big sparkle
    heat: float = 0.0      # overheated, 0..1: its tiles glow from dull red to yellow-white


@dataclass
class Pose:
    """dip: the knees bend, the body sinks this many px (boots stay). knee: the knees forward, px. sway: the hips over to
    the side, px (+ back, right). lean: the upper body forward toward the deck (degrees; negative leans back), about the
    hips. roll: the shoulders tipped (degrees, clockwise), about the chest. sy: the whole figure squashed over the floor.
    tap: the back boot's heel up, px. move: everything, boots too. head: the ball turned on the neck (degrees, clockwise)
    on top of the body's lean. hand_n / hand_f: where each wrist goes (painting px); elbow_n / elbow_f: which way the
    elbow bends; glove_n / glove_f: each glove's wrist-to-fingers direction (degrees, y down)."""
    dip: float = 0
    knee: float = 0
    sway: float = 0
    lean: float = 0
    roll: float = 0
    sy: float = 1
    tap: float = 0
    move: tuple = (0.0, 0.0)
    head: float = 0
    ball: Ball = field(default_factory=Ball)
    hand_n: tuple = REST_N["wrist"]
    elbow_n: int = -1
    glove_n: float = None
    hand_f: tuple = REST_F["wrist"]
    elbow_f: int = 1
    glove_f: float = None
    deck: tuple = (0.0, 0.0, 0.0)   # the deck's jolt: dx, dy, degrees
    flash: float = 0.0
    fx: list = field(default_factory=list)


class Frame:
    def __init__(self, p: Pose):
        self.p = p
        self.g = np.eye(3)

    def warp(self, x, y):
        p = self.p
        # squash over the floor
        sx = 1 / math.sqrt(p.sy)
        x = 64 + (x - 64) * sx
        y = FLOOR + (y - FLOOR) * p.sy
        legs = br.smooth((BOOT - y) / (BOOT - HIP[1]))          # 0 in the boots, 1 from the hips up
        knee = np.exp(-((y - KNEE) / 8.0) ** 2) * br.smooth((BOOT + 2 - y) / 6.0)
        heel = br.smooth((y - 84) / 8.0) * br.smooth((x - 63) / 3.0)
        x = x - p.knee * knee + p.sway * legs
        y = y + p.dip * legs - p.tap * heel
        # lean about the hips, the shoulders' roll about the chest
        hx, hy = HIP[0] + p.sway, HIP[1] + p.dip
        a = np.radians(-p.lean) * br.smooth((hy + 4 - y) / 26.0)
        dx, dy = x - hx, y - hy
        x, y = hx + dx * np.cos(a) - dy * np.sin(a), hy + dx * np.sin(a) + dy * np.cos(a)
        c = self.at_simple(CHEST)
        b = np.radians(p.roll) * br.smooth((c[1] + 6 - y) / 14.0)
        dx, dy = x - c[0], y - c[1]
        x, y = c[0] + dx * np.cos(b) - dy * np.sin(b), c[1] + dx * np.sin(b) + dy * np.cos(b)
        return x + p.move[0], y + p.move[1]

    def at_simple(self, pt):
        """The chest's place after the squash, sink and lean (the roll's own pivot)."""
        p = self.p
        x, y = 64 + (pt[0] - 64) / math.sqrt(p.sy), FLOOR + (pt[1] - FLOOR) * p.sy
        x, y = x + p.sway, y + p.dip
        hx, hy = HIP[0] + p.sway, HIP[1] + p.dip
        a = math.radians(-p.lean) * float(br.smooth((hy + 4 - y) / 26.0))
        dx, dy = x - hx, y - hy
        return np.array([hx + dx * math.cos(a) - dy * math.sin(a), hy + dx * math.sin(a) + dy * math.cos(a)])

    def at(self, pt) -> np.ndarray:
        x, y = self.warp(np.float64(pt[0]), np.float64(pt[1]))
        return np.array([float(x), float(y)])

    def angle_at(self, pt) -> float:
        """How far the warp turns the body at pt (degrees, clockwise)."""
        a, b = self.at(pt), self.at((pt[0], pt[1] - 2))
        return math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1])))

    def arm(self, shoulder, hand, l1, l2, elbow):
        s = self.at(shoulder)
        e, w, stretch = br.two_bone(s, hand, l1, l2, elbow, MAX_STRETCH)
        return s, e, w

    def ball_centre(self):
        b = self.p.ball
        if b.free is not None:
            return np.array(b.free, float)
        neck = self.at(NECK)
        turn = self.angle_at(NECK) + self.p.head
        off = br.rot(turn) @ (np.array(BALL_C) - np.array(NECK))
        return neck + off


def _part_matrix(point_from, point_to, deg) -> np.ndarray:
    m = np.eye(3)
    m[:2, :2] = br.rot(deg)
    m[:2, 2] = np.array(point_to) - br.rot(deg) @ np.array(point_from)
    return m


def _sleeve(rigx: Bigos, s, e, w, width_up, width_fore) -> np.ndarray:
    """A sleeve: two capsules in the suit's painted sequins, darker on the side away from the light with the suit's
    dark edge there, as in the painting."""
    px, py = CANVAS.centres(np.eye(3))
    rgb = np.zeros(px.shape + (3,), np.float64)
    alpha = np.zeros(px.shape, bool)
    light = np.array([-.6, -.8])
    for a, b, width, tex_y in ((s, e, width_up, 62.0), (e, w, width_fore, 66.0)):
        d = b - a
        length = max(float(np.linalg.norm(d)), 1e-3)
        u_dir = d / length
        n_dir = np.array([-u_dir[1], u_dir[0]])
        rx, ry = px - a[0], py - a[1]
        u = rx * u_dir[0] + ry * u_dir[1]
        v = rx * n_dir[0] + ry * n_dir[1]
        uc = np.clip(u, 0, length)
        dist = np.hypot(rx - uc * u_dir[0], ry - uc * u_dir[1])
        half = width / 2
        inside = dist <= half
        tx = 56.5 + v * .9
        ty = tex_y + np.mod(u, 9)
        cloth = rigx.cloth[np.clip((ty * br.K).astype(int), 0, N * br.K - 1),
                           np.clip((tx * br.K).astype(int), 0, N * br.K - 1)]
        colour = cloth[..., :3].astype(np.float64)
        bare = cloth[..., 3] < 128
        colour[bare] = (40, 42, 60)
        side = np.sign(v)[..., None] * n_dir
        facing = (side @ light) * np.clip(np.abs(v) / half, 0, 1)
        colour *= (1 + .22 * facing)[..., None]
        edge = (dist > half - 1.0) & (facing < -.15)
        colour[edge] = (20, 20, 32)
        rgb[inside] = colour[inside]
        alpha |= inside
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


# ---------------------------------------------------------------- the mirror ball

ROWS = 14
REPEAT = 7             # the tile pattern comes round 7 times: a row of 28 at the equator shifts 4 tiles per loop
BASE_PITCH = 16.0      # we see it a little from above, as in the painting
CORE = np.array([22, 22, 34])


def _row_cols(row):
    lat = -math.pi / 2 + (row + .5) * math.pi / ROWS
    n = max(1, round(2 * math.pi * math.cos(lat) / (math.pi / ROWS) / REPEAT)) * REPEAT
    return n


ROW_COLS = [_row_cols(r) for r in range(ROWS)]
_rng = np.random.default_rng(7)
# each row's carried pattern: per tile of its period, a brightness offset and now and then a tinted tile
PATTERN = []
for _r in range(ROWS):
    per = ROW_COLS[_r] // REPEAT
    PATTERN.append([(int(_rng.choice([-4, -3, -2, -1, 0, 0, 1, 2, 3, 4])), int(_rng.random() < .12)) for _ in range(per)])
# which tiles fall off first in the defeat: a fixed order
DROP_ORDER = [(int(r), int(c)) for r, c in zip(_rng.integers(3, 11, 60), _rng.integers(0, 28, 60))]


def _rotm(roll, pitch):
    """View <- ball: the ball pitched toward us about x, then rolled in the screen plane."""
    a, b = math.radians(roll), math.radians(pitch)
    rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    return rz @ rx


def draw_ball(b: Ball, centre, r: float = BALL_R, w=CW, h=CH, ox=OX, oy=OY):
    """The ball drawn straight onto a canvas: tiles on a sphere in the painting's tile colours, its light as the
    painting's (the painted ball's brightness, blurred, over the disc), grout a pixel wide where tiles meet. Returns the
    layer and where its sparkles go."""
    rigx = rig()
    paint = rigx.ball_paint
    cx, cy = centre[0] + ox, centre[1] + oy
    ys, xs = np.mgrid[0:h, 0:w] + .5
    sxr = r * b.squash ** -.5
    syr = r * b.squash
    dx, dy = (xs - cx) / sxr, (ys - cy) / syr
    rr = dx * dx + dy * dy
    inside = rr <= 1.0 + .6 / r
    nz = np.sqrt(np.clip(1 - rr, 0, 1))
    n = np.stack([dx, dy, nz], -1)
    m = _rotm(b.roll, b.pitch + BASE_PITCH)
    nb = n @ m                                  # ball <- view is m.T, applied to row vectors: n @ m
    lat = np.arcsin(np.clip(-nb[..., 1], -1, 1))
    lon = np.arctan2(nb[..., 0], nb[..., 2])
    row = np.clip(((lat + math.pi / 2) / (math.pi / ROWS)).astype(int), 0, ROWS - 1)
    cols = np.array(ROW_COLS)[row]
    period = 2 * math.pi / REPEAT
    f = (lon / (2 * math.pi) + b.spin / REPEAT) % 1.0
    col = (f * cols).astype(int) % cols
    tile = row * 1000 + col
    # light: the painting's, read relative to the disc
    lx = np.clip(((BALL_C[0] + dx * BALL_R)).astype(int), 0, N - 1)
    ly = np.clip(((BALL_C[1] + dy * BALL_R)).astype(int), 0, N - 1)
    light = paint["light"][ly, lx]
    lo, hi = paint["lrange"]
    level = np.clip((light - lo) / (hi - lo), 0, 1) ** .95 * (len(paint["cool"]) + 1.5) - 1.5
    level = level * (1 - .85 * b.dark)
    per = cols // REPEAT
    off = np.zeros(row.shape)
    tint = np.zeros(row.shape, bool)
    for rr_ in range(ROWS):
        sel = row == rr_
        if not sel.any():
            continue
        pat = PATTERN[rr_]
        k = col[sel] % len(pat)
        off[sel] = np.array([pat[i][0] for i in range(len(pat))])[k]
        tint[sel] = np.array([pat[i][1] for i in range(len(pat))])[k]
    idx = np.clip(np.round(level + off * (1 - .6 * b.dark)), 0, len(paint["cool"]) - 1).astype(int)
    colour = paint["cool"][idx].astype(np.float64)
    warm_side = tint & (dx < .1) & (level > 2)
    colour[warm_side] = paint["warm"]
    colour[tint & ~warm_side & (level > 3)] = paint["mauve"]
    # the warm light along the side facing it (left), as painted
    rim_zone = (dx < -.62) & (rr > .7) & (dy < .55) & ((col + row) % 2 == 0) & (b.dark < .5)
    colour[rim_zone] = paint["warm"]
    # grout: where the tile changes
    left = np.pad(tile, ((0, 0), (1, 0)), constant_values=-1)[:, :-1]
    up = np.pad(tile, ((1, 0), (0, 0)), constant_values=-1)[:-1]
    grout = ((left != tile) | (up != tile)) & inside & (rr < .93)
    g_idx = np.clip(np.round(level * .35 + 1.5), 0, len(paint["cool"]) - 1).astype(int)
    colour[grout] = paint["cool"][g_idx[grout]] * .6 + paint["grout"] * .4 * (1 - .7 * b.dark)
    if b.heat:
        hot = np.array([(70, 16, 14), (150, 34, 20), (220, 70, 24), (255, 130, 40), (255, 200, 90), (255, 244, 190)])
        t = np.clip(np.round(idx / (len(paint["cool"]) - 1) * (len(hot) - 1)), 0, len(hot) - 1).astype(int)
        colour = colour * (1 - .8 * b.heat) + hot[t] * .8 * b.heat
        colour[grout] = colour[grout] * (1 - b.heat) + np.array((255, 120, 30)) * b.heat
    # tiles gone: the dark core
    if b.missing:
        gone = np.zeros(inside.shape, bool)
        for rr_, cc in DROP_ORDER[:b.missing]:
            cc = cc % ROW_COLS[rr_]
            gone |= (row == rr_) & (col == cc)
        colour[gone & inside] = CORE
    colour[~inside] = 0
    out = np.dstack([np.clip(colour, 0, 255), inside * 255]).astype(np.uint8)
    # sparkles: the brightest tile centres facing us, upper left
    spark = []
    if b.glint and b.dark < .5:
        score = np.where(inside & (nz > .45) & ~grout & (dy < .2), level + off * .6 - (dx + .3) ** 2 - (dy + .4) ** 2, -99)
        flat = np.argsort(score.ravel())[::-1]
        for k in flat[:400]:
            y_, x_ = divmod(int(k), w)
            if all(abs(x_ - a) + abs(y_ - c) > 8 for a, c, _ in spark):
                spark.append((x_, y_, 3 if (b.glint == 2 and not spark) else 2))
            if len(spark) >= (2 if b.glint == 2 else 1):
                break
    return out, spark, (row, col, inside)


def _sparkle(canvas, owner, x, y, size):
    for t in range(-size, size + 1):
        c = (255, 255, 255, 255) if abs(t) < size else (190, 220, 255, 255)
        br.put(canvas, owner, x + t, y, c)
        br.put(canvas, owner, x, y + t, c)
    if size >= 3:
        for d in (-1, 1):
            br.put(canvas, owner, x + d, y + d, (220, 236, 255, 255))
            br.put(canvas, owner, x - d, y + d, (220, 236, 255, 255))


def _crack(canvas, owner, centre, r, amount, roll):
    """A crack across the ball: a jagged dark line from the knock's side, longer with amount, light on its lower lip."""
    if amount <= 0:
        return
    rng = np.random.default_rng(3)
    pts = [(-.95, -.25)]
    for k in range(7):
        x0, y0 = pts[-1]
        pts.append((x0 + .3, y0 + rng.uniform(-.28, .28)))
    pts = np.array(pts)
    n_seg = max(1, int(round(amount * (len(pts) - 1))))
    rot = br.rot(roll)
    for a, b in zip(pts[:n_seg], pts[1:n_seg + 1]):
        for t in np.linspace(0, 1, 8):
            p = a + (b - a) * t
            q = rot @ p * r + centre + [OX, OY]
            x, y = int(q[0]), int(q[1])
            if owner[y, x] == "ball":
                canvas[y, x, :3] = (14, 14, 22)
                if y + 1 < CH and owner[y + 1, x] == "ball":
                    canvas[y + 1, x, :3] = (200, 206, 220)
    # a branch
    if amount > .6:
        mid = pts[3]
        for t in np.linspace(0, 1, 6):
            p = mid + np.array([.12, .35]) * t
            q = rot @ p * r + centre + [OX, OY]
            x, y = int(q[0]), int(q[1])
            if owner[y, x] == "ball":
                canvas[y, x, :3] = (14, 14, 22)


# ---------------------------------------------------------------- drawing a DJ frame

LOOSE = {"fx", "tile", "ball_free", "beam"}
BOOTH = {"booth", "deck"}
JOINTS = {
    "neck": ("body", "ball"),
    "shoulder_n": ("body", "sleeve_n"),
    "wrist_n": ("sleeve_n", "glove_n"),
    "shoulder_f": ("body", "sleeve_f"),
    "wrist_f": ("sleeve_f", "glove_f"),
}


@dataclass
class Drawn:
    image: Image.Image
    joints: dict
    failures: list
    masks: dict | None = None
    extra: dict = field(default_factory=dict)


def draw(pose: Pose) -> Drawn:
    rigx = rig()
    f = Frame(pose)
    parts = rigx.parts
    layers = []
    # the booth: the deck on its flight case
    layers.append(("booth", CANVAS.warp(rigx.booth_big, np.eye(3))))
    ddx, ddy, ddeg = pose.deck
    deck_pivot = (35.0, 68.0)
    layers.append(("deck", CANVAS.warp(parts["deck"].big, _part_matrix(deck_pivot, (deck_pivot[0] + ddx, deck_pivot[1] + ddy), ddeg))))
    # far arm behind him
    s_f, e_f, w_f = f.arm(SHOULDER_F, pose.hand_f, UPPER_F, FORE_F, pose.elbow_f)
    fore_f = math.degrees(math.atan2(w_f[1] - e_f[1], w_f[0] - e_f[0]))
    rest_fore_f = math.degrees(math.atan2(REST_F["wrist"][1] - REST_F["elbow"][1], REST_F["wrist"][0] - REST_F["elbow"][0]))
    gf = pose.glove_f if pose.glove_f is not None else FAR_REST_DIR + (fore_f - rest_fore_f)
    layers.append(("glove_f", CANVAS.warp(parts["glove_f"].big, _part_matrix(REST_F["wrist"], w_f, gf - FAR_REST_DIR))))
    layers.append(("sleeve_f", _sleeve(rigx, s_f, e_f, w_f, SLEEVE_F, SLEEVE_F - .4)))
    layers.append(("body", CANVAS.body(np.eye(3), lambda qx, qy: br.unwarp(f.warp, qx, qy), parts["body"].big)))
    # the ball
    bc = f.ball_centre()
    ball = replace(pose.ball, roll=pose.ball.roll + (0 if pose.ball.free else f.angle_at(NECK) + pose.head))
    ball_img, sparks, _ = draw_ball(ball, bc)
    layers.append(("ball_free" if pose.ball.free else "ball", ball_img))
    # near arm in front
    s_n, e_n, w_n = f.arm(SHOULDER_N, pose.hand_n, UPPER_N, FORE_N, pose.elbow_n)
    fore_n = math.degrees(math.atan2(w_n[1] - e_n[1], w_n[0] - e_n[0]))
    rest_fore_n = math.degrees(math.atan2(REST_N["wrist"][1] - REST_N["elbow"][1], REST_N["wrist"][0] - REST_N["elbow"][0]))
    gn = pose.glove_n if pose.glove_n is not None else NEAR_REST_DIR + (fore_n - rest_fore_n)
    layers.append(("sleeve_n", _sleeve(rigx, s_n, e_n, w_n, SLEEVE_N, SLEEVE_N - .6)))
    layers.append(("glove_n", CANVAS.warp(parts["glove_n"].big, _part_matrix(REST_N["wrist"], w_n, gn - NEAR_REST_DIR))))
    for item in pose.fx:
        if item[0] == "under":
            layers.insert(0, ("fx", item[1]))

    canvas, owner, masks = br.composite(layers, (CH, CW))
    order = [n for n, _ in layers]
    rims = {"glove_n": parts["glove_n"].rim, "glove_f": parts["glove_f"].rim}
    rims["ball"] = rims["ball_free"] = (tuple(int(v) for v in rigx.ball_paint["warm"]) if pose.ball.dark < .5
                                        else (70, 72, 90))
    br.relight(canvas, owner, order, lambda n: rims.get(n, rigx.rim), unlit=("fx", "booth", "deck", "tile", "body", "glove_n", "glove_f"))
    _crack(canvas, owner, bc, BALL_R, pose.ball.cracks, ball.roll)
    if pose.flash:
        his = np.isin(owner, ["body", "ball", "sleeve_n", "sleeve_f", "glove_n", "glove_f"])
        canvas[his, :3] = (canvas[his, :3] * (1 - pose.flash) + 255 * pose.flash).astype(np.uint8)
    for x, y, size in sparks:
        _sparkle(canvas, owner, x, y, size)
    extra = {"tip": w_n + 14.0 * np.array([math.cos(math.radians(gn)), math.sin(math.radians(gn))]),
             "hands": (w_n, w_f), "ball": bc}
    for item in pose.fx:
        _fx(canvas, owner, item, f, bc, extra)

    to_c = lambda pt: np.array(pt) + [OX, OY]  # noqa: E731
    joints = {
        "shoulder_n": to_c(s_n), "wrist_n": to_c(w_n), "shoulder_f": to_c(s_f), "wrist_f": to_c(w_f),
    }
    if pose.ball.free is None:
        joints["neck"] = to_c(f.at(NECK))
    failures = br.check(joints, JOINTS, masks, LOOSE | BOOTH, (CH, CW))
    return Drawn(Image.fromarray(canvas), {k: tuple(round(float(c), 1) for c in v) for k, v in joints.items()},
                 failures, masks, extra)


def _fx(canvas, owner, item, f, bc, extra):
    kind = item[0]
    put = lambda x, y, c: br.put(canvas, owner, int(math.floor(x + OX)), int(math.floor(y + OY)), c)  # noqa: E731
    if kind == "tiles":            # ("tiles", [(x, y), ...]): tiles flying off, painting px
        for i, (x, y) in enumerate(item[1]):
            c = [(232, 236, 244, 255), (130, 140, 160, 255), (224, 150, 84, 255)][i % 3]
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                put(x + dx, y + dy, c if (dx, dy) != (1, 1) else (60, 64, 84, 255))
    elif kind == "dust":           # ("dust", x, y, size)
        _, x, y, size = item
        dust = [(150, 146, 160, 255), (110, 108, 124, 255)]
        for side in (-1, 1):
            for k in range(size + 1):
                r = 1 + k * .8
                cx_, cy_ = x + side * (2 + k * 3.5), y - r
                for dy in range(-int(r) - 1, int(r) + 2):
                    for dx in range(-int(r) - 1, int(r) + 2):
                        if dx * dx + dy * dy <= r * r + .5 and cy_ + dy < y:
                            put(cx_ + dx, cy_ + dy, dust[0] if dy < 0 else dust[1])
    elif kind == "lines":          # ("lines", x, y, length, [angles]): impact lines
        _, x, y, length, angles = item
        for ang in angles:
            a = math.radians(ang)
            for t in range(3, 3 + length):
                put(x + t * math.cos(a), y + t * math.sin(a), (255, 246, 220, 255))
    elif kind == "notes":          # ("notes", x, y): a music note, the beat made visible
        _, x, y = item
        c = (255, 214, 120, 255)
        for dx, dy in ((0, 0), (1, 0), (0, -1), (1, -1), (1, -2), (1, -3), (1, -4), (2, -4), (3, -3)):
            put(x + dx, y + dy, c)
    elif kind == "spark":          # ("spark", x, y, size)
        _sparkle(canvas, owner, int(item[1] + OX), int(item[2] + OY), item[3])
    elif kind == "beam_src":       # ("beam_src", dx, dy, size[, lane y]): the flare where the beam leaves the ball
        _, ddx, ddy, size, *lane = item
        x, y = bc[0] + ddx, bc[1] + ddy
        if lane:                   # on the ball's rim at that lane's beam height
            y = lane[0]
            x = bc[0] - math.sqrt(max(0.0, BALL_R ** 2 - (y - bc[1]) ** 2)) - 1
        _flare(canvas, owner, int(x + OX), int(y + OY), size)
        extra["beam_src"] = (x, y)
    elif kind == "beam":           # ("beam", top, k): drawn by whoever places the strip; here only noted
        extra["beam"] = (item[1], item[2])
    elif kind == "finger":         # the held point flashes at the fingertips
        t = extra["tip"]
        _sparkle(canvas, owner, int(t[0] + OX), int(t[1] + OY), 3)
    elif kind == "charge_ball":    # light gathering on the ball before the beam: four sparkles round it
        for a in (200, 250, 300, 160):
            q = bc + (BALL_R + 2) * np.array([math.cos(math.radians(a)), math.sin(math.radians(a))])
            _sparkle(canvas, owner, int(q[0] + OX), int(q[1] + OY), 2)
    elif kind == "swish":          # speed lines over the hands coming down
        for w in extra["hands"][:1]:
            for k in range(3):
                for t in range(5, 8):
                    put(w[0] + 3 * k - 3, w[1] - t, (220, 226, 240, 255) if t < 7 else (150, 156, 176, 255))
    elif kind == "slam":           # the hands hit the deck: lines up from them, a shake of dust off the deck
        for w in extra["hands"]:
            for ang in (-150, -115, -65, -30):
                a = math.radians(ang)
                for t in range(3, 7):
                    put(w[0] + t * math.cos(a), w[1] - 2 + t * math.sin(a), (255, 246, 220, 255))
        _fx(canvas, owner, ("dust", 26.0, 59.0, 1), f, bc, extra)
    elif kind == "hitlines":       # the knock on the ball
        for ang in (150, 180, 210):
            a = math.radians(ang)
            for t in range(int(BALL_R) + 2, int(BALL_R) + 7):
                put(bc[0] + t * math.cos(a), bc[1] + t * math.sin(a), (255, 246, 220, 255))
    elif kind == "smoke_ball":     # ("smoke_ball", phase): smoke curling off the overheated ball
        for k in range(3):
            t = (item[1] + k / 3) % 1
            cx_, cy_ = bc[0] + 6 - 4 * k + 3 * math.sin(t * 6 + k), bc[1] - BALL_R - 2 - 16 * t
            r = 1.5 + 3 * t
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    if dx * dx + dy * dy <= r * r:
                        put(cx_ + dx, cy_ + dy, (150, 140, 146, 255) if dy < 0 else (104, 98, 108, 255))
    elif kind == "hot_sparks":     # ("hot_sparks", seed): sparks jumping off the ball's rim
        rng = np.random.default_rng(item[1])
        for _ in range(5):
            a = rng.uniform(0, math.tau)
            q = bc + (BALL_R + rng.uniform(1, 5)) * np.array([math.cos(a), math.sin(a)])
            for t in range(int(rng.integers(1, 4))):
                put(q[0] + t * math.cos(a), q[1] + t * math.sin(a), (255, 250, 200, 255) if t == 0 else (255, 170, 50, 255))
    elif kind == "droop":          # the sad note: a little music note sinking
        _fx(canvas, owner, ("notes", bc[0] - 22, bc[1] + 4), f, bc, extra)
    elif kind == "dizzy":          # ("dizzy", phase): stars and broken notes circling over the knocked-out ball
        for k in range(3):
            a = (item[1] + k / 3) * math.tau
            x, y = bc[0] + 17 * math.cos(a), bc[1] - BALL_R - 4 + 4 * math.sin(a)
            front = math.sin(a) > 0
            if k == 1:
                _fx(canvas, owner, ("notes", x - 1, y + 2), f, bc, extra)
                continue
            c = (255, 236, 120, 255) if front else (200, 160, 70, 255)
            put(x, y, (255, 255, 230, 255))
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                put(x + dx, y + dy, c)
            if front:
                for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
                    put(x + dx, y + dy, (255, 200, 80, 255))
    elif kind == "fizz":           # ("fizz", seed): a few sparks shorting out of the ball's grout, close to it
        rng = np.random.default_rng(item[1])
        for _ in range(3):
            a = rng.uniform(math.pi * .9, math.pi * 2.1)
            q = bc + (BALL_R - rng.uniform(1, 4)) * np.array([math.cos(a), math.sin(a)])
            for t in range(int(rng.integers(2, 4))):
                put(q[0] + t * math.cos(a), q[1] + t * math.sin(a), (255, 255, 230, 255) if t == 0 else (130, 230, 255, 255))


BEAM_COLOURS = [(255, 90, 200), (120, 230, 255), (255, 240, 140)]


def _flare(canvas, owner, x, y, size):
    """The beam's start flare: a hot white core in a coloured halo, with four long points."""
    for dy in range(-size - 3, size + 4):
        for dx in range(-size - 3, size + 4):
            d = math.hypot(dx, dy)
            if d <= size * .6:
                c = (255, 255, 255, 255)
            elif d <= size:
                c = (255, 200, 240, 255)
            elif d <= size + 1.2 and (dx + dy) % 2 == 0:
                c = (255, 110, 210, 255)
            else:
                continue
            br.put(canvas, owner, x + dx, y + dy, c)
    for t in range(size + 1, size * 2 + 4):
        c = (255, 255, 255, 255) if t < size * 2 else (255, 150, 230, 255)
        for ex, ey in ((t, 0), (-t, 0), (0, t), (0, -t)):
            br.put(canvas, owner, x + ex, y + ey, c)


# ---------------------------------------------------------------- DJ animations
#
# Tempo: everything is laid out on a 120 BPM beat. groove and the speaker's thump run at 8 fps, 4 frames per beat,
# the beat on frames 0 and 4 (the game syncs them by playing at BPM / 15 fps). The one-shots run at 12 fps, 6 frames
# per beat, and name the frame that lands on the beat (HIT): start them that many frames before the beat.

REST = Pose()
DECK_HAND = (40.0, 58.5)        # the near glove flat on the left platter
FIST_UP = (81.0, 35.0)          # the far glove up in the air


def pose(**kw) -> Pose:
    return replace(REST, **kw)


def groove():
    """Two beats: down on each beat (knees, a squash, the ball nodding a frame late), hips to one side then the other,
    shoulders against them, the near hand scratching the platter in time, the far hand pumping on the beat, the back
    heel kicking up on the off-beat. The ball turns one pattern-length per loop and sparkles on the beat."""
    dips = [4.2, 2.4, -.4, 1.4]
    syq = [.97, .99, 1.02, 1.0]
    pump = [-3.5, -2.0, 2.0, 0.0]       # the far wrist's height against FIST_UP
    nod = [1.0, 4.0, 1.0, -2.0]         # the ball follows the bounce a frame late
    frames = []
    for i in range(8):
        b, side = i % 4, (1 if i < 4 else -1)
        t = (i / 8) * math.tau
        sway = 2.6 * math.cos(t)          # hips swing over the two beats
        frames.append(pose(
            dip=dips[b], knee=dips[b] * .8, sy=syq[b], sway=sway, roll=-4.5 * math.cos(t), lean=1.5 + 1.5 * (b == 0),
            tap=2.0 if (b == 2 and side < 0) else (1.0 if (b == 3 and side < 0) else 0.0),
            head=nod[b] * side * .6 + nod[b] * .4,
            ball=Ball(spin=i / 8, glint=2 if b == 0 else (1 if b == 1 else 0)),
            hand_n=(DECK_HAND[0] + (1.4 if side > 0 else -1.4) * (b in (0, 1)), DECK_HAND[1] + .5 * (b == 0)),
            glove_n=172.0 + 4 * side,
            hand_f=(FIST_UP[0] + .5 * side + sway * .6, FIST_UP[1] + pump[b] + dips[b] * .6), glove_f=-84.0 + 6 * (b == 0),
        ))
    return frames


# The top speaker stands on the ledge up ahead at the ball's height; the bottom one on the floor ahead. The point is
# the near arm thrown straight at it, the body following: up and back for the top, down and in for the bottom.
TOP_POINT = dict(hand_n=(32.0, 16.0), glove_n=-150.0, lean=-6.0, dip=0.0, sy=1.03, head=-6.0, roll=-4.0, sway=1.0,
                 hand_f=(80.0, 58.0), glove_f=100.0, elbow_f=-1)
LOW_POINT = dict(hand_n=(34.0, 66.0), glove_n=150.0, lean=10.0, dip=4.5, knee=4.0, sy=.96, head=-10.0, roll=3.0,
                 sway=-1.0, hand_f=(84.0, 40.0), glove_f=-70.0)


def _point(hold, pull):
    spin0 = .0
    return [
        pose(**pull, ball=Ball(spin=spin0)),                                                       # wound in
        pose(**{**hold, "hand_n": (hold["hand_n"][0] + 6, hold["hand_n"][1] + (4 if hold is TOP_POINT else -4)),
                "lean": hold["lean"] * .6}, ball=Ball(spin=spin0 + .06)),                          # thrown
        pose(**{**hold, "hand_n": (hold["hand_n"][0] - 2, hold["hand_n"][1] + (-2 if hold is TOP_POINT else 2)),
                "lean": hold["lean"] * 1.25}, ball=Ball(spin=spin0 + .12, glint=2)),               # overshoot: the beat
        pose(**hold, ball=Ball(spin=spin0 + .16, glint=1)),                                        # settle
        pose(**hold, ball=Ball(spin=spin0 + .2, glint=2), fx=[("finger",)]),                       # held, flashing
    ]


def point_top():
    pull = dict(hand_n=(52.0, 47.0), glove_n=-110.0, lean=2.0, dip=2.5, knee=2.0, sy=.98, head=3.0,
                hand_f=(80.0, 50.0), glove_f=-60.0)
    return _point(TOP_POINT, pull)


def point_bottom():
    pull = dict(hand_n=(50.0, 38.0), glove_n=-100.0, lean=-3.0, dip=0.0, sy=1.02, head=4.0,
                hand_f=(80.0, 46.0), glove_f=-70.0)
    return _point(LOW_POINT, pull)


def drop():
    """Both hands up, up on his toes, then down on the deck with everything: the deck jolts, the ball bounces on its
    neck. HIT = 3."""
    up = dict(hand_n=(42.0, 12.0), glove_n=-105.0, hand_f=(88.0, 6.0), glove_f=-70.0, elbow_f=1)
    slam = dict(hand_n=(38.0, 58.0), glove_n=176.0, hand_f=(50.0, 57.0), glove_f=172.0, elbow_f=1)
    return [
        pose(**{**up, "hand_n": (48.0, 26.0), "hand_f": (86.0, 22.0)}, dip=2.0, knee=1.5, sy=.98, lean=-2.0, head=3.0,
             ball=Ball(spin=0.0)),                                                                    # reach up
        pose(**up, dip=-1.0, sy=1.04, lean=-6.0, head=6.0, tap=1.0, ball=Ball(spin=.05, glint=2)),  # top: on his toes
        pose(**{**slam, "hand_n": (40.0, 40.0), "hand_f": (56.0, 40.0)}, dip=1.0, sy=1.0, lean=8.0, head=-4.0,
             ball=Ball(spin=.1), fx=[("swish",)]),                                                  # coming down
        pose(**slam, dip=5.5, knee=4.5, sy=.93, lean=14.0, head=-8.0, deck=(0.0, 1.0, 0.0),
             ball=Ball(spin=.12, squash=.9, glint=2), fx=[("slam",)]),                              # the drop
        pose(**{**slam, "hand_n": (39.0, 56.0), "hand_f": (52.0, 54.0)}, dip=3.5, knee=3.0, sy=.97, lean=11.0,
             head=2.0, deck=(0.0, -.5, 0.0), ball=Ball(spin=.14, squash=1.06)),                     # recoil
        pose(**{**slam, "hand_n": (40.0, 57.0), "hand_f": (58.0, 50.0), "glove_f": -150.0}, dip=2.0, knee=1.5,
             lean=6.0, head=-1.0, ball=Ball(spin=.16)),                                              # settle
    ]


def drop_windup():
    """The bass drop's build: both hands up over his head, bouncing harder on every beat, leaning back further, the ball
    throwing sparkles. Loops a beat (8 fps, the beat on frame 0) for the two bars of the build; drop follows it."""
    up = dict(hand_n=(42.0, 12.0), glove_n=-105.0, hand_f=(88.0, 6.0), glove_f=-70.0, elbow_f=1)
    frames = []
    for i in range(4):
        frames.append(pose(
            **{**up, "hand_n": (42.0 - (i == 0), 12.0 + [3.0, 1.0, -1.0, 0.0][i]),
               "hand_f": (86.0 + (i == 0), 28.0 + [3.0, 1.0, -1.0, 0.0][i]), "glove_f": -62.0},
            dip=[3.0, 1.2, -0.8, 0.6][i], knee=[2.4, 1.0, 0.0, 0.5][i], sy=[.97, 1.0, 1.04, 1.01][i],
            lean=-5.0 - [0.0, 1.0, 2.0, 1.0][i], head=[2.0, 4.0, 6.0, 4.0][i], tap=1.0 if i == 2 else 0.0,
            ball=Ball(spin=i / 4 * .25, glint=2 if i in (0, 2) else 1),
            fx=[("charge_ball",)] if i in (0, 2) else []))
    return frames


TOP_AIM = dict(lean=-5.0, head=7.0, sy=1.02, roll=-3.0, hand_n=(46.0, 60.0), glove_n=176.0, elbow_n=-1,
               hand_f=(84.0, 30.0), glove_f=-70.0)
LOW_AIM = dict(lean=12.0, head=-14.0, dip=4.0, knee=3.5, sy=.96, roll=4.0, hand_n=(40.0, 58.0), glove_n=176.0,
               hand_f=(86.0, 44.0), glove_f=-40.0)


def _beam(aim, top):
    sign = 1 if top else -1
    src = (-BALL_R - 1, 0, BEAM_AXIS["top"]) if top else (-BALL_R * .8, BALL_R * .55)
    wind = [
        pose(**{**aim, "lean": aim["lean"] * .4, "head": aim["head"] * .4, "dip": aim.get("dip", 0) * .4 + 1},
             ball=Ball(spin=0.0, glint=1)),
        pose(**{**aim, "head": aim["head"] * 1.3}, ball=Ball(spin=.1, glint=2)),                  # over: the charge
        pose(**aim, ball=Ball(spin=.15, glint=0), fx=[("beam_src", *src[:2], 2, *src[2:]), ("charge_ball",)]),
    ]
    loop = []
    for k in range(4):
        jolt = 1.0 if k == 0 else 0.0                                                             # a kick on the beat
        loop.append(pose(**{**aim, "dip": aim.get("dip", 0) + jolt, "head": aim["head"] + sign * .0},
                         ball=Ball(spin=.15 + k * .25 / 4, glint=0, pitch=0),
                         fx=[("beam", top, k), ("beam_src", *src[:2], 3 + (k % 2), *src[2:])]))
    release = [
        pose(**{**aim, "lean": aim["lean"] * .5, "head": -aim["head"] * .3}, ball=Ball(spin=.45, glint=1),
             fx=[("beam_src", *src[:2], 1, *src[2:])]),
        pose(**{**aim, "lean": aim["lean"] * .15, "head": 0.0, "dip": 1.0}, ball=Ball(spin=.5, glint=1)),
    ]
    return wind, loop, release


def beam_top_parts():
    return _beam(TOP_AIM, True)


def beam_bottom_parts():
    return _beam(LOW_AIM, False)


def hurt():
    """Hit: knocked back, the ball knocked askew on its neck with a pale flash, arms flung; the ball wobbles back."""
    flung = dict(hand_n=(52.0, 30.0), glove_n=-60.0, hand_f=(88.0, 30.0), glove_f=-40.0)
    return [
        pose(**flung, lean=-10.0, move=(3.0, 0.0), dip=1.0, sy=.96, head=20.0, flash=.6,
             ball=Ball(spin=0.0, pitch=-10, glint=0), fx=[("hitlines",)]),
        pose(**flung, lean=-7.0, move=(2.0, 0.0), dip=1.5, head=-12.0, ball=Ball(spin=.02, glint=0)),
        pose(**{**flung, "hand_n": (46.0, 46.0), "glove_n": -120.0}, lean=-2.0, move=(1.0, 0.0), head=6.0,
             ball=Ball(spin=.04, glint=0)),
        pose(hand_n=(42.0, 56.0), glove_n=170.0, lean=1.0, head=-2.0, ball=Ball(spin=.06, glint=1)),
    ]


def overheat():
    """The last opening: two speakers down, he pushes the ball too hard and it overheats, glowing red to yellow-white,
    smoking and spitting sparks, while he fans it with both hands, bouncing on the beat in a panic. He stands into the
    top lane like this: dash into the ball. 8 fps, one beat a loop, the beat on frame 0."""
    fan = [(40.0, 22.0), (42.0, 28.0), (40.0, 22.0), (38.0, 30.0)]
    heat = [1.0, .8, .95, .75]
    frames = []
    for i in range(4):
        frames.append(pose(
            dip=[2.5, 1.0, 0.0, 1.5][i], knee=[2.0, .8, 0.0, 1.2][i], sy=[.98, 1.0, 1.02, 1.0][i], lean=-3.0,
            head=[3.0, -3.0, 2.0, -2.0][i], roll=[2.0, -1.0, -2.0, 1.0][i],
            hand_n=fan[i], glove_n=-110.0 + 20 * (i % 2), hand_f=(86.0, 24.0 + 4 * (i % 2)), glove_f=-60.0,
            ball=Ball(spin=i / 4 * .25, heat=heat[i], glint=0),
            fx=[("smoke_ball", i / 4), ("hot_sparks", 20 + i)]))
    return frames


def stunned():
    """The overload: a drop sent back through his own system knocks him silly. Knees gone soft, slumped over the deck,
    arms hanging, the ball lolling from side to side on his neck with its lights flickering out and shorting, stars and
    a broken note going round over it. He is wide open: lunges count double. 8 fps, one beat a loop, the beat on 0."""
    frames = []
    for i in range(4):
        side = 1 if i < 2 else -1
        frames.append(pose(
            dip=[6.0, 4.5, 6.0, 4.5][i], knee=[5.0, 3.5, 5.0, 3.5][i], sy=[.95, .97, .95, .97][i],
            lean=[9.0, 7.0, 9.0, 7.0][i], roll=4.0 * side, sway=-1.5 * side,
            head=[16.0, 10.0, -16.0, -10.0][i],
            hand_n=(41.0 - (i % 2), 61.0 + (i % 2)), glove_n=118.0, elbow_n=-1,
            hand_f=(78.0 + (i % 2), 66.0), glove_f=96.0, elbow_f=-1,
            ball=Ball(spin=.02 * i, pitch=-8, glint=0, dark=[.55, .3, .6, .35][i]),
            fx=[("dizzy", i / 4), ("fizz", 40 + i)]))
    return frames


def defeat():
    """The ball cracks and sheds tiles, its lights die; he tries one last sad disco point, his knees go, he folds over
    the deck and the ball rolls off his neck, over the deck and onto the floor, where one last tile drops off."""
    sad_up = dict(hand_n=(36.0, 22.0), glove_n=-140.0, hand_f=(70.0, 62.0), glove_f=100.0, elbow_f=-1)
    slump = dict(lean=30.0, dip=10.0, knee=7.0, sy=.93, roll=6.0, hand_n=(26.0, 68.0), glove_n=115.0,
                 hand_f=(44.0, 58.0), glove_f=170.0, elbow_f=1, deck=(0.0, 1.0, -2.0))
    tiles0 = [(50.0, 6.0), (70.0, 2.0), (44.0, 14.0)]
    return [
        pose(lean=-8.0, move=(2.0, 0.0), head=14.0, flash=.6, hand_n=(50.0, 34.0), glove_n=-70.0,
             hand_f=(88.0, 30.0), glove_f=-40.0, ball=Ball(cracks=.5, missing=3, glint=0), fx=[("tiles", tiles0)]),
        pose(lean=-4.0, move=(1.0, 0.0), head=-6.0, hand_n=(46.0, 44.0), glove_n=-110.0, hand_f=(84.0, 40.0),
             ball=Ball(cracks=.8, missing=6, dark=.35, glint=0),
             fx=[("tiles", [(44.0, 0.0), (76.0, -6.0), (36.0, 12.0), (82.0, 12.0)])]),
        pose(lean=0.0, head=4.0, dip=1.0, hand_n=(44.0, 52.0), glove_n=-150.0,
             ball=Ball(cracks=1.0, missing=9, dark=.75, glint=0),
             fx=[("tiles", [(36.0, -2.0), (84.0, -2.0), (26.0, 30.0), (92.0, 30.0)])]),
        # the last dance: a slow sad point up, hip out
        pose(**{**sad_up, "hand_n": (44.0, 34.0)}, sway=1.5, lean=-2.0, head=-4.0,
             ball=Ball(cracks=1.0, missing=10, dark=.85, glint=0), fx=[("tiles", [(20.0, 66.0), (96.0, 70.0)])]),
        pose(**sad_up, sway=2.5, lean=-4.0, head=-8.0, roll=-4.0,
             ball=Ball(cracks=1.0, missing=11, dark=.85, glint=0)),
        pose(**{**sad_up, "hand_n": (38.0, 26.0)}, sway=2.5, lean=-3.0, head=-6.0, roll=-3.0, dip=1.0,
             ball=Ball(cracks=1.0, missing=11, dark=.9, glint=0), fx=[("droop",)]),
        # it droops, the knees go
        pose(hand_n=(40.0, 50.0), glove_n=150.0, hand_f=(76.0, 62.0), glove_f=110.0, sway=1.0, dip=5.0, knee=4.0,
             lean=12.0, head=10.0, sy=.96, ball=Ball(cracks=1.0, missing=12, dark=.95, glint=0)),
        pose(**{**slump, "lean": 20.0, "dip": 7.0}, head=14.0, ball=Ball(cracks=1.0, missing=12, dark=1.0, glint=0)),
        # over the deck; the ball comes off the neck
        pose(**slump, ball=Ball(cracks=1.0, missing=13, dark=1.0, glint=0, free=(36.0, 40.0), roll=-40.0),
             fx=[("dust", 34.0, 59.0, 1)]),
        pose(**slump, ball=Ball(cracks=1.0, missing=13, dark=1.0, glint=0, free=(16.0, 50.0), roll=-110.0)),
        pose(**slump, ball=Ball(cracks=1.0, missing=14, dark=1.0, glint=0, free=(2.0, FLOOR - BALL_R), roll=-190.0,
                                squash=.9), fx=[("dust", 2.0, FLOOR, 2)]),
        pose(**slump, ball=Ball(cracks=1.0, missing=14, dark=1.0, glint=0, free=(-5.0, FLOOR - BALL_R), roll=-230.0),
             fx=[("tiles", [(16.0, FLOOR - 2.0)]), ("spark", 1.0, 82.0, 2)]),
    ]


ANIMATIONS = {
    # name: (make, fps, loop, hit frame or None)
    "groove": (groove, 8, True, 0),
    "point-top": (point_top, 12, False, 2),
    "point-bottom": (point_bottom, 12, False, 2),
    "drop": (drop, 12, False, 3),
    "drop-windup": (drop_windup, 8, True, 0),
    "beam-top-windup": (lambda: beam_top_parts()[0], 8, False, None),
    "beam-top-loop": (lambda: beam_top_parts()[1], 8, True, 0),
    "beam-top-release": (lambda: beam_top_parts()[2], 8, False, None),
    "beam-bottom-windup": (lambda: beam_bottom_parts()[0], 8, False, None),
    "beam-bottom-loop": (lambda: beam_bottom_parts()[1], 8, True, 0),
    "beam-bottom-release": (lambda: beam_bottom_parts()[2], 8, False, None),
    "hurt": (hurt, 12, False, None),
    "stunned": (stunned, 8, True, 0),
    "defeat": (defeat, 10, False, None),
}

# The ball's damage as the last target: (cracks, tiles gone, lights dying) at two thirds and one third of its health left. Baked as
# overlays on his cell, one per frame of every animation it is fought through, to lay over his frame.
BALL_DAMAGE = {1: (.55, 6, 0.0), 2: (1.0, 16, .2)}
BALL_DAMAGE_ANIMS = [n for n in ANIMATIONS if n != "defeat"]


def ball_damage(name: str, stage: int, plain: list) -> list[Image.Image]:
    """What the ball's damage changes on each frame of `name`: only the pixels that differ from the frame as drawn."""
    cracks, missing, dark = BALL_DAMAGE[stage]
    out = []
    for p, d in zip(ANIMATIONS[name][0](), plain):
        hurt = draw(replace(p, ball=replace(p.ball, cracks=max(p.ball.cracks, cracks), missing=max(p.ball.missing, missing),
                                            dark=max(p.ball.dark, dark))))
        a, b = np.asarray(d.image), np.asarray(hurt.image)
        diff = (a != b).any(2)
        layer = np.zeros_like(b)
        layer[diff] = b[diff]
        out.append(Image.fromarray(layer))
    return out


# ---------------------------------------------------------------- the speaker: its own sprite, one per lane

# The speaker is read from the render on its own, finer grid: 5.6 render px per texel instead of 9.5, so it stands
# 1.7x the painting's size (56 px, clearly taller than the roach, well short of the lane's 68) with real painted detail
# rather than an upscale. Its coordinates are its own box's, mirrored so the cones face left, down the lane.
SPK_READ = 5.6
SPK_SRC = (138, 660, 386, 972)       # the front cabinet in the render, under the deck's feet
SPK_W = round((SPK_SRC[2] - SPK_SRC[0]) / SPK_READ)
SPK_H = round((SPK_SRC[3] - SPK_SRC[1]) / SPK_READ)


def _spk_pt(rx, ry, rr=0.0):
    """A render point on the cabinet, in the speaker's mirrored box px."""
    return (SPK_W - (rx - SPK_SRC[0]) / SPK_READ, (ry - SPK_SRC[1]) / SPK_READ, rr / SPK_READ)


WOOFER = _spk_pt(287, 854, 62)       # the big cone: centre and radius
TWEETER = _spk_pt(301, 711, 36)      # the small one over it
SOX, SOY = 12, 24                    # where the speaker's box corner sits on its canvas
SW, SH = SPK_W + 2 * SOX, SPK_H + SOY + 4
SPK_FLOOR = SPK_H + SOY              # the first row under the cabinet, on its canvas
COOL = [(90, 220, 255), (200, 120, 255), (255, 255, 255)]
HOT = [(255, 70, 30), (255, 160, 40), (255, 240, 170)]


@dataclass
class Spk:
    """cone: the big cone pushed out (+) or sucked in (-), 0..1. sx/sy: the cabinet squashed over its floor. shake:
    px sideways. tilt: degrees, about its bottom right corner (a wreck leaning back). glow: (palette, 0..1) a light in the
    cones. heat: the cabinet glowing hot at its edges, 0..1. blown: the cone torn out, hanging. fx: sparks, smoke."""
    cone: float = 0.0
    sx: float = 1.0
    sy: float = 1.0
    shake: float = 0.0
    tilt: float = 0.0
    glow: tuple | None = None
    heat: float = 0.0
    blown: float = 0.0
    flash: float = 0.0
    torn: float = 0.0
    fx: list = field(default_factory=list)


_SPK_CACHE = []


def _spk_image() -> np.ndarray:
    """The painted cabinet read at its own grid, mirrored so its cones face left. Its idle look is lifted to read on
    dark levels: a little brighter overall, the cones' lips and centres picked out, the warm light along its top edge
    and a cool one down the cone face's leading edge, as the painting lights everything from ahead."""
    if _SPK_CACHE:
        return _SPK_CACHE[0].copy()
    from rig import cut_white
    a = cut_white(SOURCE, erode=1)[SPK_SRC[1]:SPK_SRC[3], SPK_SRC[0]:SPK_SRC[2]].astype(np.float32)
    a[..., :3] *= a[..., 3:4] / 255
    s = cv2.resize(a, (SPK_W, SPK_H), interpolation=cv2.INTER_AREA)
    alpha = s[..., 3]
    rgb = s[..., :3] / np.maximum(alpha[..., None], 1) * 255
    solid = alpha > 128
    # the cabinet is a box: close any notch the cut left and square its top under where the deck stood
    rows = np.nonzero(solid.mean(1) > .9)[0]
    top = int(rows[0])
    rgb[:top] = rgb[top]
    solid[:top] = solid[top]
    solid = ni.binary_fill_holes(solid)
    pal = rig().palette
    rgb = 255 * (np.clip(rgb, 0, 255) / 255) ** .78 + 6
    rgb = br.snap(np.clip(rgb, 0, 255).reshape(-1, 3).astype(np.uint8), pal).reshape(SPK_H, SPK_W, 3).astype(float)
    img = np.dstack([rgb, solid * 255]).astype(np.uint8)[:, ::-1].copy()
    solid = img[..., 3] > 128
    ys, xs = np.mgrid[0:SPK_H, 0:SPK_W] + .5
    for cx, cy, cr in (WOOFER, TWEETER):
        d = np.hypot(xs - cx, ys - cy) / cr
        lip = (np.abs(d - .92) < .1) & solid
        img[lip, :3] = np.clip(img[lip, :3].astype(int) * 1.35 + 30, 0, 255)
        dome = (d < .28) & solid
        img[dome, :3] = np.clip(img[dome, :3].astype(int) * 1.3 + 24, 0, 255)
    edge_top = solid & ~np.roll(solid, 1, 0)
    edge_top[0] = solid[0]
    img[edge_top, :3] = rig().ball_paint["warm"]
    below = np.roll(edge_top, 1, 0) & solid
    img[below, :3] = np.clip(img[below, :3].astype(int) * .6 + np.array(rig().ball_paint["warm"]) * .4, 0, 255)
    left = solid & ~np.roll(solid, 1, 1)
    left[:, 0] = solid[:, 0]
    img[left, :3] = (150, 156, 178)
    _SPK_CACHE.append(img)
    return img.copy()


def draw_speaker(p: Spk) -> Image.Image:
    base = _spk_image()
    h, w = base.shape[:2]
    out = np.zeros((SH, SW, 4), np.uint8)
    owner = np.full((SH, SW), "", object)
    # the cabinet, squashed over its floor and tilted about its bottom corner, sampled per pixel
    ys, xs = np.mgrid[0:SH, 0:SW] + .5
    px, py = xs - SOX - p.shake, ys - SOY            # box px
    pivot = (w if p.tilt >= 0 else 0, h)
    a = math.radians(-p.tilt)
    rx, ry = px - pivot[0], py - pivot[1]
    px, py = pivot[0] + rx * math.cos(a) - ry * math.sin(a), pivot[1] + rx * math.sin(a) + ry * math.cos(a)
    px = w / 2 + (px - w / 2) / p.sx
    py = h + (py - h) / p.sy
    # the cone: pushed out it reads bigger from the middle (a bulge), sucked in smaller
    cx, cy, cr = WOOFER
    d = np.hypot(px - cx, py - cy)
    inside = d < cr
    k = 1 - .22 * p.cone * (1 - (d / cr) ** 2)
    px = np.where(inside, cx + (px - cx) * k, px)
    py = np.where(inside, cy + (py - cy) * k, py)
    ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
    ok = (ix >= 0) & (ix < w) & (iy >= 0) & (iy < h)
    src = np.zeros((SH, SW, 4), np.uint8)
    src[ok] = base[iy[ok], ix[ok]]
    solid = src[..., 3] > 128
    rgb = src[..., :3].astype(np.float64)
    # where each pixel sits on the cabinet (for the cones and edges)
    dc = np.hypot(px - cx, py - cy) / cr
    tx, ty, tr = TWEETER
    dt = np.hypot(px - tx, py - ty) / tr
    if p.cone > 0:                                    # the cone catches the light as it comes out: centre and rim
        rgb[(dc < .35) & solid] = rgb[(dc < .35) & solid] * (1 + .6 * p.cone) + 30 * p.cone
        lip = (np.abs(dc - .8) < .14) & solid
        rgb[lip] = rgb[lip] * (1 + .5 * p.cone) + 45 * p.cone
    if p.torn:                                        # the cone split: a dark tear across it, its paper lip curled
        ang = np.degrees(np.arctan2(py - cy, px - cx))
        tear = (np.abs(((ang - 215 + 180) % 360) - 180) < 20 + 16 * p.torn * (1 - dc)) & (dc > .2) & (dc < .9) & solid
        rgb[tear] = (14, 12, 18)
        lip = np.zeros_like(tear)
        lip[:-1] |= tear[1:] & ~tear[:-1]
        lip[:, 1:] |= tear[:, :-1] & ~tear[:, 1:]
        rgb[lip & solid & ~tear] = (196, 186, 170)
        rgb[(dc > .2) & (dc < .95) & solid & ~tear & ~lip] *= 1 - .18 * p.torn
    if p.blown:
        hole = (dc < .95) & solid
        rgb[hole] = (12, 10, 16)
        rgb[(dc >= .95) & (dc < 1.15) & solid] *= .55
    if p.glow:
        pal, amount = p.glow
        for dd, rad in ((dc, 1.0), (dt, 1.0)):
            zone = (dd < rad) & solid
            ring = (np.abs(dd - .65) < .18) & solid
            centre = (dd < .3) & solid
            rgb[zone] = rgb[zone] * (1 - .55 * amount) + np.array(pal[0]) * .55 * amount
            rgb[ring] = rgb[ring] * (1 - .8 * amount) + np.array(pal[1]) * .8 * amount
            rgb[centre] = rgb[centre] * (1 - .9 * amount) + np.array(pal[2]) * .9 * amount
    edge = solid & ~ni.binary_erosion(solid, iterations=1)
    if p.heat:
        inner = solid & ~ni.binary_erosion(solid, iterations=3)
        rgb[solid] = rgb[solid] * (1 - .25 * p.heat) + np.array(HOT[0]) * .25 * p.heat
        rgb[inner] = rgb[inner] * (1 - .45 * p.heat) + np.array(HOT[0]) * .45 * p.heat
        rgb[edge] = rgb[edge] * (1 - .8 * p.heat) + np.array(HOT[1]) * .8 * p.heat
    elif p.glow:
        rgb[edge] = rgb[edge] * (1 - .6 * p.glow[1]) + np.array(p.glow[0][0]) * .6 * p.glow[1]
    if p.flash > 0:
        rgb[solid] = rgb[solid] * (1 - p.flash) + 255 * p.flash
    elif p.flash < 0:                                 # cut out: its light dies
        rgb[solid] = rgb[solid] * (1 + p.flash)
    out[solid, :3] = np.clip(rgb[solid], 0, 255)
    out[solid, 3] = 255
    owner[solid] = "spk"
    if p.blown:                                       # the torn cone hanging out on its wires
        cone = base.copy()
        ys2, xs2 = np.mgrid[0:h, 0:w] + .5
        disc = np.hypot(xs2 - cx, ys2 - cy) < cr * .9
        drop = 3 + 2 * p.blown
        for y_, x_ in zip(*np.nonzero(disc)):
            qx = int(x_ + SOX + p.shake + 1 - 2 * p.blown)
            qy = int(y_ + SOY + drop + (x_ - cx) * .35 * p.blown)
            if 0 <= qx < SW and 0 <= qy < SH and cone[y_, x_, 3] > 128:
                c = cone[y_, x_, :3].astype(int) * .8
                out[qy, qx, :3] = c
                out[qy, qx, 3] = 255
                owner[qy, qx] = "spk"
        # its wires
        for t in range(int(drop) + 1):
            for wx in (cx - 2, cx + 2):
                br.put(out, owner, int(wx + SOX + p.shake), int(cy - cr * .5 + SOY + t), (30, 30, 40, 255), "spk")
    for item in p.fx:
        _spk_fx(out, owner, item)
    return Image.fromarray(out)


def _spk_fx(out, owner, item):
    kind = item[0]
    put = lambda x, y, c: br.put(out, owner, int(math.floor(x + SOX)), int(math.floor(y + SOY)), c)  # noqa: E731
    w, h = SPK_W, SPK_H
    if kind == "air":              # ("air", size): sound lines off the cone's face, on the beat
        cy = WOOFER[1]
        for k in range(item[1]):
            x0 = -2 - 4 * k
            for t in range(-5 - 2 * k, 6 + 2 * k):
                put(x0 - abs(t) * .3, cy + t, (210, 220, 240, 255) if k == 0 else (140, 150, 176, 255))
    elif kind == "sparks":         # ("sparks", seed, n): yellow-white sparks jumping off it
        rng = np.random.default_rng(item[1])
        for _ in range(item[2]):
            x, y = rng.uniform(-3, w + 3), rng.uniform(-2, h * .7)
            length = int(rng.integers(1, 4))
            dx, dy = rng.choice([-1, 1]), -1
            for t in range(length):
                put(x + dx * t, y + dy * t, (255, 250, 200, 255) if t == 0 else (255, 180, 60, 255))
    elif kind == "smoke":          # ("smoke", phase, dark): puffs rising off the top, drifting back
        phase, dark = item[1], item[2]
        cols = [(110, 106, 116, 255), (80, 78, 88, 255)] if dark else [(170, 166, 176, 255), (128, 124, 136, 255)]
        for k in range(3):
            t = (phase + k / 3) % 1
            cx, cy = w * .55 + 8 * t + 3 * math.sin(k * 2.1), -2 - 20 * t
            r = 1.6 + 3.2 * t
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    if dx * dx + dy * dy <= r * r:
                        put(cx + dx, cy + dy, cols[0] if dy < 0 else cols[1])
    elif kind == "bang":           # ("bang", size): the burst when it blows
        cx, cy = WOOFER[0], WOOFER[1]
        for ang in range(0, 360, 30):
            a = math.radians(ang)
            for t in range(4, 4 + item[1]):
                put(cx + t * math.cos(a), cy + t * math.sin(a), (255, 240, 170, 255) if t < 4 + item[1] - 2 else (255, 140, 40, 255))
    elif kind == "crack":          # a crack down the cabinet's side panel
        for t in range(18):
            put(w - 7 - (t % 3 == 1), 5 + t, (12, 12, 18, 255))
    elif kind == "split":          # ("split", length): a crack running in from the cabinet's top front corner
        for t in range(item[1]):
            x = 3 + t * .55 + (t % 4 == 1) - (t % 5 == 3)
            put(x, 1 + t, (10, 10, 16, 255))
            put(x + 1, 1 + t, (150, 140, 128, 255))
    elif kind == "wail":           # ("wail", k): feedback squealing off the cones, jagged pink and white lines
        for cy, reach, k0 in ((TWEETER[1], 10, 0), (WOOFER[1], 14, 1)):
            for j in range(2):
                x0 = -3 - 5 * j - ((item[1] + k0 + j) % 2) * 2
                for t in range(-reach // 2 - j * 2, reach // 2 + j * 2 + 1):
                    zig = 1 if (t + item[1] + j) % 4 < 2 else -1
                    c = (255, 255, 255, 255) if j == 0 else (255, 106, 213, 255)
                    put(x0 + zig - abs(t) * .25, cy + t, c)


def thump():
    """One beat: the cone out and the cabinet squashed on it, sound lines off the face, then the cone back past rest
    and the cabinet up, then still. 8 fps at 120 BPM, the beat on frame 0."""
    return [Spk(cone=1.0, sx=1.04, sy=.94, fx=[("air", 2)]), Spk(cone=-.4, sx=.99, sy=1.02, fx=[("air", 1)]),
            Spk(cone=0.0), Spk(cone=-.15, sy=1.005)]


def charge():
    """The lane-attack warning on the speaker: shaking, its cones lit cold disco blue and violet, the light pulsing."""
    return [Spk(cone=.3, shake=-1, glow=(COOL, .55), fx=[("air", 1)]), Spk(cone=-.2, shake=1, glow=(COOL, .8)),
            Spk(cone=.4, shake=-1, glow=(COOL, 1.0), fx=[("air", 1)]), Spk(cone=-.1, shake=1, glow=(COOL, .75))]


def blast():
    """The shockwave leaves: sucked in, then the cone punched out with the cabinet squashed flat, then the recoil. The
    ring itself is its own sprite (shockwave). HIT = 1."""
    return [Spk(cone=-.8, sx=.97, sy=1.04, glow=(COOL, 1.0)), Spk(cone=1.3, sx=1.08, sy=.88, flash=.15, glow=(COOL, .6), fx=[("air", 3)]),
            Spk(cone=.2, sx=.98, sy=1.03, glow=(COOL, .3)), Spk(cone=0.0)]


def overload():
    """The opening: glowing hot, swelling and sparking, smoke pouring off the top, the cone straining out. Hot where the
    charge is cold, and it doesn't shake: it throbs."""
    return [Spk(cone=.7, sx=1.05, sy=.97, heat=.75, glow=(HOT, .9), fx=[("sparks", 1, 4), ("smoke", 0.0, False)]),
            Spk(cone=.5, sx=1.03, sy=.985, heat=1.0, glow=(HOT, 1.0), fx=[("sparks", 2, 3), ("smoke", .25, False)]),
            Spk(cone=.8, sx=1.06, sy=.96, heat=.85, glow=(HOT, .9), fx=[("sparks", 3, 5), ("smoke", .5, False)]),
            Spk(cone=.55, sx=1.03, sy=.985, heat=1.0, glow=(HOT, 1.0), fx=[("sparks", 4, 3), ("smoke", .75, False)])]


def broken():
    """Dashed through: it blows (flash, burst), the cone tears out, it slumps back and lands leaning, smoking. The last
    frame is the static wreck."""
    return [Spk(cone=1.4, sx=1.1, sy=.9, flash=.55, heat=.6, fx=[("bang", 8), ("sparks", 9, 9)]),
            Spk(blown=.6, sx=1.02, sy=.94, tilt=4, heat=.5, fx=[("sparks", 10, 4), ("smoke", 0.0, True), ("crack",)]),
            Spk(blown=1.0, sy=.92, tilt=9, heat=.25, fx=[("smoke", .3, True), ("crack",)]),
            Spk(blown=1.0, sy=.93, tilt=7, fx=[("smoke", .6, True), ("crack",)]),
            Spk(blown=1.0, sy=.93, tilt=7, fx=[("smoke", .9, True), ("crack",)])]


def damaged():
    """Nearly gone: still thumping on the beat, but its cone split and its cabinet cracked, sparks spitting off it and
    smoke curling from its top; on the beat's last quarter it cuts out, dark, and fizzes. 8 fps, the beat on 0."""
    return [Spk(cone=.8, sx=1.03, sy=.95, torn=1.0, fx=[("air", 1), ("split", 14), ("crack",), ("sparks", 21, 2), ("smoke", 0.0, True)]),
            Spk(cone=-.3, sx=.99, sy=1.02, torn=1.0, fx=[("split", 14), ("crack",), ("smoke", .25, True)]),
            Spk(cone=0.0, torn=1.0, fx=[("split", 14), ("crack",), ("sparks", 23, 1), ("smoke", .5, True)]),
            Spk(cone=-.2, sy=.98, tilt=1, torn=1.0, flash=-.45, fx=[("split", 14), ("crack",), ("sparks", 24, 4), ("smoke", .75, True)])]


SHRIEK = [(255, 90, 200), (255, 180, 236), (255, 255, 255)]


def shriek():
    """Hit too often, it feeds back: the cone strains right out, the cabinet bulges and judders side to side, its cones
    glare hot pink and white and squeal jagged lines off its face. Three rings follow down its lane. 8 fps loop."""
    return [Spk(cone=1.2, sx=1.05, sy=.95, shake=-1, glow=(SHRIEK, 1.0), fx=[("wail", 0)]),
            Spk(cone=.9, sx=1.03, sy=.97, shake=1, glow=(SHRIEK, .8), fx=[("wail", 1)]),
            Spk(cone=1.3, sx=1.06, sy=.94, shake=-1, glow=(SHRIEK, 1.0), fx=[("wail", 2)]),
            Spk(cone=1.0, sx=1.04, sy=.96, shake=1, glow=(SHRIEK, .85), fx=[("wail", 3)])]


SPEAKER_ANIMS = {
    # name: (make, fps, loop). The loops run 4 frames a beat at 120 BPM, the beat on frame 0
    "speaker-thump": (thump, 8, True),
    "speaker-charge": (charge, 8, True),
    "speaker-blast": (blast, 12, False),
    "speaker-overload": (overload, 8, True),
    "speaker-broken": (broken, 10, False),
    "speaker-damaged": (damaged, 8, True),
    "speaker-shriek": (shriek, 8, True),
}
SPEAKER_HIT = {"speaker-blast": 1}   # the frame the ring leaves on


# ---------------------------------------------------------------- effects as their own sprites

WAVE_W, WAVE_H = 26, 40


def shockwave(k: int) -> Image.Image:
    """The bass ring rolling down a lane, seen edge on: a thick bright arc bowed the way it travels (left) with a cold
    glow either side, a fainter ring trailing it, the air between them shimmering, dust kicked up at the floor. 5
    frames that pulse (the bow swells and eases) as it rolls; the game moves it."""
    out = np.zeros((WAVE_H, WAVE_W, 4), np.uint8)
    owner = np.full((WAVE_H, WAVE_W), "", object)
    bulge = [7.0, 8.5, 10.0, 9.0, 8.0][k]
    half = (WAVE_H - 3) / 2

    def arc_x(y, x0, b):
        t = (y - (WAVE_H - 1) / 2) / half
        return x0 + b * (1 - math.sqrt(max(0.0, 1 - t * t))), abs(t)

    for y in range(1, WAVE_H - 1):
        x, t = arc_x(y, 2, bulge)
        xi = int(round(x))
        thick = 3 if t < .75 else 2
        for dx in range(-1, thick + 1):
            if dx == -1 or dx == thick:
                c = (70, 170, 230, 255) if (y + k) % 2 == 0 or dx == thick else None
            elif dx == 0:
                c = (255, 255, 255, 255)
            else:
                c = (150, 236, 255, 255)
            if c:
                br.put(out, owner, xi + dx, y, c)
        # the shimmer behind the front
        for dx in range(thick + 2, thick + 6):
            if (xi + dx + y + k) % 4 == 0:
                br.put(out, owner, xi + dx, y, (90, 160, 210, 255))
        # the trailing ring
        x2, _ = arc_x(y, 12, bulge * .8)
        if (y + k) % 3 != 0:
            br.put(out, owner, int(round(x2)), y, (120, 200, 245, 255))
    # a bright ripple running along the front
    y = 3 + (k * 6) % (WAVE_H - 9)
    for dy in range(4):
        x, _ = arc_x(y + dy, 2, bulge)
        br.put(out, owner, int(round(x)) - 1, y + dy, (255, 255, 255, 255))
    # dust at the floor
    for dx, h in ((8, 2), (11, 3), (14, 2), (17, 1)):
        for dy in range(h):
            br.put(out, owner, dx + (k % 2), WAVE_H - 2 - dy, (160, 156, 170, 255) if dy else (120, 116, 132, 255))
    return Image.fromarray(out)


def ring_back(k: int) -> Image.Image:
    """A ring sent back by the dash, flying home into his system: the ring turned round (bowed right, the way it now
    goes), off the floor, its front white-hot and doubled, the parry's cyan streaking off behind it. Same cell and
    pivot as the ring."""
    src = np.asarray(shockwave(k))[:, ::-1].copy()
    src[WAVE_H - 4:] = 0                                      # no dust: it's in the air
    out = np.zeros_like(src)
    solid = src[..., 3] > 0
    lum = src[..., :3].astype(int).sum(2)
    out[solid & (lum >= 700)] = (255, 255, 255, 255)
    out[solid & (lum < 700) & (lum >= 500)] = (127, 224, 255, 255)
    out[solid & (lum < 500)] = (60, 150, 220, 255)
    # the front doubled: one px more of white ahead of the brightest column on every row
    for y in range(WAVE_H):
        xs = np.nonzero((out[y, :, :3].astype(int).sum(1) >= 760) & (out[y, :, 3] > 0))[0]
        if len(xs) and xs.max() + 1 < WAVE_W:
            out[y, xs.max() + 1] = (200, 246, 255, 255)
    # speed streaks trailing behind it (to its left)
    for y, x0, length in ((8, 0, 7), (14, 2, 9), (20, 0, 10), (26, 2, 8), (32, 1, 6)):
        x0 = (x0 + k * 2) % 4
        for t in range(length):
            if out[y, x0 + t, 3] == 0:
                out[y, x0 + t] = (127, 224, 255, 255) if t > length // 2 else (60, 150, 220, 255)
    return Image.fromarray(out)


REC_W, REC_H = 32, 18
REC_COLOURS = [(14, 14, 20), (40, 40, 54), (190, 196, 212), (255, 255, 255)]
LABEL = [(214, 60, 70), (250, 200, 90)]


def record(k: int, shatter: int = 0) -> Image.Image:
    """A vinyl record flung along a lane like a frisbee, seen nearly edge on: a black disc with its grooves, the red label
    and a glint that run round it each frame so it spins (4 frames). shatter 1..4: it bursts into shards that fly apart
    and fall, with a white crack of light on the first frame. Pivot: its middle."""
    a = np.zeros((REC_H, REC_W, 4), np.uint8)
    cx, cy, rx, ry = (REC_W - 1) / 2, (REC_H - 1) / 2, 14.0, 6.0
    if not shatter:
        for y in range(REC_H):
            for x in range(REC_W):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                d = math.hypot(dx, dy)
                if d > 1.0:
                    continue
                c = REC_COLOURS[0]
                if 0.45 < d < 0.98 and int(d * 9) % 2 == 0:
                    c = REC_COLOURS[1]                      # the grooves
                if d >= 0.86:
                    c = REC_COLOURS[2]                      # its rim catches the light: it reads on dark floors
                ang = (math.degrees(math.atan2(dy, dx)) - k * 90) % 360
                if d < 0.42:
                    c = LABEL[0] if ang < 180 else LABEL[1]  # the label, turning
                if 0.5 < d < 0.95 and 300 < ang < 330:
                    c = REC_COLOURS[3]                      # the glint running round
                a[y, x] = (*c, 255)
        # the hole
        a[int(cy), int(cx)] = (8, 8, 10, 255)
        # a violet edge all round, one pixel wide: a black disc has to read against a dark level, and in his colours
        from scipy import ndimage as ni
        padded = np.pad(a, ((1, 1), (1, 1), (0, 0)))
        solid = padded[..., 3] > 0
        ring = ni.binary_dilation(solid, structure=np.ones((3, 3))) & ~solid
        padded[ring] = (176, 140, 255, 255)
        return Image.fromarray(padded)
    t = shatter / 4
    rng = np.random.default_rng(5)
    owner = np.full((REC_H + 12, REC_W + 16), "", object)
    big = np.zeros((REC_H + 12, REC_W + 16, 4), np.uint8)
    ox, oy = 8, 4
    for i in range(7):
        ang = i / 7 * math.tau + rng.uniform(-.3, .3)
        dist = 2 + 9 * t
        px = cx + ox + math.cos(ang) * dist * 1.3
        py = cy + oy + math.sin(ang) * dist * .6 + 6 * t * t
        size = 2 if i % 2 else 3
        col = LABEL[0] if i == 0 else (REC_COLOURS[2] if i % 3 == 0 else REC_COLOURS[1])
        for dy in range(size - 1):
            for dx in range(size):
                br.put(big, owner, int(px) + dx, int(py) + dy, (*col, 255))
        br.put(big, owner, int(px), int(py) - 1, (*REC_COLOURS[3], 255))
    if shatter == 1:
        for t2 in range(-4, 5):
            br.put(big, owner, int(cx + ox) + t2, int(cy + oy), (255, 255, 255, 255))
            br.put(big, owner, int(cx + ox), int(cy + oy) + t2 // 2, (255, 255, 255, 255))
    if shatter <= 2:
        for sx, sy in ((-6, -3), (7, -2), (0, 4)):
            br.put(big, owner, int(cx + ox + sx * (1 + t)), int(cy + oy + sy * (1 + t)), (255, 240, 200, 255))
    return Image.fromarray(big)


BEAM_H = 2 * BEAM_HALF + 1
STRIP_W = 64           # the colour cycle's length: the strip tiles seamlessly
BEAM_HUES = [(255, 70, 190), (214, 84, 255), (130, 110, 255), (70, 190, 255), (90, 240, 230), (150, 120, 255)]
_BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def _hue(phase: float, x: int, y: int):
    """The beam's colour at a point along it: the hues cycle round every STRIP_W px, each melting into the next through
    an ordered dither rather than a hard stripe."""
    p = (phase % STRIP_W) / STRIP_W * len(BEAM_HUES)
    i = int(p) % len(BEAM_HUES)
    f = p - int(p)
    return BEAM_HUES[(i + 1) % len(BEAM_HUES)] if _BAYER[y % 4, x % 4] < f else BEAM_HUES[i]


def _beam_px(d: float, phase: float, x: int, y: int):
    """Light at distance d from the beam's axis: a white-hot core, a pale inner glow, the colour, then a falloff that
    steps down in alpha and thins out in a dither, as light does over whatever is behind it."""
    ad = abs(d)
    if ad > BEAM_HALF + .5:
        return None
    hue = np.array(_hue(phase, x, y), float)
    b = _BAYER[y % 4, x % 4]
    if ad <= 1.6:
        return (255, 255, 255, 255)
    if ad <= 3.2:
        return tuple((255 * .62 + hue * .38).astype(int)) + (255,)
    if ad <= 5.2:
        return tuple(np.clip(hue * 1.08 + 18, 0, 255).astype(int)) + (255,)
    if ad <= 7.2:
        return tuple(hue.astype(int)) + (205,) if b < .85 else tuple((hue * .85).astype(int)) + (150,)
    if ad <= 9.2:
        return tuple((hue * .85).astype(int)) + (130,) if b < .5 else None
    return tuple((hue * .7).astype(int)) + (80,) if b < .25 else None


def _blend(a: np.ndarray, x: int, y: int, c) -> None:
    """c laid over pixel (x, y) of an RGBA array, by its alpha."""
    if not (0 <= y < a.shape[0] and 0 <= x < a.shape[1]):
        return
    alpha = c[3] / 255
    under = a[y, x].astype(float)
    out_a = alpha + under[3] / 255 * (1 - alpha)
    if out_a <= 0:
        return
    rgb = (np.array(c[:3], float) * alpha + under[:3] * under[3] / 255 * (1 - alpha)) / out_a
    a[y, x] = (*np.clip(rgb, 0, 255).astype(int), int(out_a * 255))


def _sparkle_on(a, x, y, size=1):
    for t in range(-size, size + 1):
        _blend(a, x + t, y, (255, 255, 255, 255))
        _blend(a, x, y + t, (255, 255, 255, 255))


def beam_strip(k: int) -> Image.Image:
    """The tiling strip along a lane (64 px, repeats seamlessly), 4 frames: the colours flow toward the player a
    quarter cycle a frame, sparkles ride the glow."""
    a = np.zeros((BEAM_H, STRIP_W, 4), np.uint8)
    for y in range(BEAM_H):
        for x in range(STRIP_W):
            c = _beam_px(y - BEAM_HALF, x + k * 16, x, y)
            if c:
                _blend(a, x, y, c)
    for sx, sy in ((5, 4), (27, 18), (44, 6), (58, 16)):
        _sparkle_on(a, (sx - k * 16) % STRIP_W, sy, 1 if (sx // 5 + k) % 2 else 2)
    return Image.fromarray(a)


FRONT_W, FRONT_AHEAD = 16, 4


def front_cap(k: int) -> Image.Image:
    """The drop's front: where its band of light ends at the leading edge. The strip's own light (same phase, so it
    joins the band tiled on behind it) gathers into a rounded white-hot crest, a thin glow running a few px ahead of it
    and sparks thrown off the crest. FRONT_AHEAD px of glow lie left of its pivot (x = FRONT_AHEAD, the middle row)."""
    w = FRONT_AHEAD + FRONT_W
    a = np.zeros((BEAM_H, w, 4), np.uint8)
    for y in range(BEAM_H):
        d = abs(y - BEAM_HALF) / (BEAM_HALF + .5)
        nose = FRONT_AHEAD + 5.0 * (1 - math.sqrt(max(0.0, 1 - d * d)))     # the crest bows forward in the middle
        for x in range(w):
            if x < nose - .5:
                if x >= nose - 3.5 and _BAYER[y % 4, x % 4] < .5 - .12 * (nose - x):
                    _blend(a, x, y, (200, 240, 255, 150))
                continue
            u = x - FRONT_AHEAD
            c = _beam_px(y - BEAM_HALF, u + k * 16, u % STRIP_W, y)
            if c:
                _blend(a, x, y, c)
            if x < nose + 1.5 and d < .92:
                _blend(a, x, y, (255, 255, 255, 255))
            elif x < nose + 3 and d < .8:
                _blend(a, x, y, (210, 246, 255, 230))
    for i, (sx, sy) in enumerate(((1, 3), (2, 19), (0, 9), (3, 14))):
        x, y = sx + (k + i) % 3 - 1, sy + ((k + i) % 2)
        if (i + k) % 3:
            _sparkle_on(a, x + 1, y, 1)
    return Image.fromarray(a)


def draw_beam(img: Image.Image, start, end, k: int, phase_end: float) -> None:
    """A beam from start to end (image px) laid over img with the strip's cross-section. Its colour phase is
    phase_end at end and grows back toward start, so a beam drawn into a cell joins the strip tiled on from the cell's
    edge."""
    a = np.asarray(img).copy()
    s, e = np.array(start, float), np.array(end, float)
    d = s - e
    length = float(np.linalg.norm(d))
    u_dir = d / length
    n_dir = np.array([-u_dir[1], u_dir[0]])
    x0, x1 = int(min(s[0], e[0]) - BEAM_HALF - 2), int(max(s[0], e[0]) + BEAM_HALF + 2)
    y0, y1 = int(min(s[1], e[1]) - BEAM_HALF - 2), int(max(s[1], e[1]) + BEAM_HALF + 2)
    for y in range(max(0, y0), min(a.shape[0], y1)):
        for x in range(max(0, x0), min(a.shape[1], x1)):
            r = np.array([x + .5, y + .5]) - e
            u = float(r @ u_dir)
            if u < -.5 or u > length + .5:
                continue
            c = _beam_px(float(r @ n_dir), phase_end + u + k * 16, x, y)
            if c:
                _blend(a, x, y, c)
    img.paste(Image.fromarray(a))


def beam_flare(img: Image.Image, x: float, y: float, k: int, splash: bool = False) -> None:
    """Where the beam leaves the ball, a hot star: white core, a coloured halo, long points that grow and shrink with
    the frames. splash: where it meets the lane, the same light flattened along the floor."""
    a = np.asarray(img).copy()
    xi, yi = int(round(x)), int(round(y))
    r = 4 + (k % 2)
    sx, sy = (1.8, .7) if splash else (1.0, 1.0)
    hue = BEAM_HUES[k % len(BEAM_HUES)]
    for dy in range(-12, 13):
        for dx in range(-20, 21):
            dd = math.hypot(dx / sx, dy / sy)
            if dd <= r * .55:
                c = (255, 255, 255, 255)
            elif dd <= r:
                c = (255, 236, 250, 255)
            elif dd <= r + 2:
                c = hue + (200,)
            elif dd <= r + 4 and _BAYER[(yi + dy) % 4, (xi + dx) % 4] < .4:
                c = hue + (110,)
            else:
                continue
            _blend(a, xi + dx, yi + dy, c)
    reach = r + 6 + 3 * (k % 2)
    rays = ((1, 0), (-1, 0), (0, 1), (0, -1)) if not splash else ((1, 0), (-1, 0), (0, -1), (.7, -.7), (-.7, -.7))
    for ex, ey in rays:
        length = reach * (1.6 if splash and ey == 0 else 1)
        for t in range(r, int(length)):
            c = (255, 255, 255, 255) if t < length - 3 else hue + (220,)
            _blend(a, int(round(xi + ex * t)), int(round(yi + ey * t)), c)
    for ex, ey in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        for t in range(r - 1, r + 3):
            _blend(a, xi + ex * t, yi + ey * t, (255, 240, 255, 230))
    img.paste(Image.fromarray(a))


# ---------------------------------------------------------------- what the game needs to know

def layout(box) -> dict:
    """Landmarks the fight places things by, native px: the DJ's from his pivot (the floor under painting x 64), the
    speaker's from its own (the floor under the cabinet's middle). box is the DJ cell as baked."""
    rest = draw(overheat()[0]).extra["ball"]
    case = rig().booth_big[br.K // 2::br.K, br.K // 2::br.K, 3] > 128
    return {
        "beamTop": round(BEAM_AXIS["top"] - FLOOR),
        "beamBottom": round(BEAM_AXIS["bottom"] - FLOOR),
        "cellLeft": box[0] - OX - 64,
        "ballX": round(float(rest[0]) - 64),
        "ballY": round(float(rest[1]) - FLOOR),
        "ballR": round(BALL_R),
        "boothLeft": int(np.nonzero(case.any(0))[0].min()) - 64,
        "speakerW": SPK_W,
        "speakerH": SPK_H,
        "coneX": round(WOOFER[0] - SPK_W / 2),
        "coneY": round(WOOFER[1] - SPK_H),
        "ringW": WAVE_W,
        "ringH": WAVE_H,
        "stripW": STRIP_W,
        "stripH": BEAM_H,
    }


# ---------------------------------------------------------------- previews

ZOOM = 5
BEAM_DOWN = 48.0                                              # the bottom beam's slope down to its lane, degrees


def beam_path(top: bool, src):
    """Where the beam runs, painting px, out to the far left: straight out of the ball along the top lane (it leaves the
    ball at that lane's beam height); for the bottom lane down at BEAM_DOWN to the lane, then along it. Returns the
    segments and where the bottom one meets its lane."""
    src = np.array(src, float)
    if top:
        return [(src, np.array([-4000.0, src[1]]))], None
    y = BEAM_AXIS["bottom"]
    a = math.radians(BEAM_DOWN)
    land = np.array([src[0] - (y - src[1]) / math.tan(a), y])
    return [(src, land), (land, np.array([-4000.0, y]))], land


def beam_layer(img: Image.Image, beam, k: int, ox: float, oy: float, cell_left: float) -> None:
    """The beam drawn onto img, where painting (0, 0) is at (ox, oy) and the DJ's cell starts at x cell_left: its
    colours keyed to the cell, so a strip tiled on leftward from the cell's edge carries on without a seam. The flare
    where it leaves the ball and the splash where it meets its lane go on top."""
    top, src = beam
    segments, land = beam_path(top, src)
    to = lambda q: (q[0] + ox, q[1] + oy)  # noqa: E731
    for a, b in segments:
        start, end = to(a), to(b)
        end = (max(end[0], -BEAM_HALF - 4), end[1])
        draw_beam(img, start, end, k, end[0] - cell_left)
    if land is not None:
        beam_flare(img, *to(land), k, splash=True)
    beam_flare(img, *to(src), k)


def beam_overlay(d: "Drawn", box) -> Image.Image | None:
    """A beam frame's light within the DJ's cell, to lay over his frame: baked as its own frame."""
    beam, k = _beam_of(d)
    if beam is None:
        return None
    img = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    beam_layer(img, beam, k, OX - box[0], OY - box[1], 0)
    return img


def render_dj(name):
    return [draw(p) for p in ANIMATIONS[name][0]()]


def _box(images, floor_row):
    return br.crop_box(images, floor_row)


def _stage(img, box, zoom=ZOOM, left=0, beam=None, k=0):
    """A frame on the mid-dark ground with the floor and the top lane marked; left extends the ground to the left so a
    beam has room to run."""
    w, h = box[2] - box[0] + left, box[3] - box[1]
    out = Image.new("RGBA", (w, h), br.BG)
    d = ImageDraw.Draw(out)
    floor = FLOOR + OY - box[1]
    top = TOP_LANE_Y + OY - box[1]
    d.line([(0, floor), (w, floor)], fill=(84, 92, 104, 255))
    for x in range(0, w, 4):
        d.point((x, top), fill=(84, 92, 104, 255))
        d.point((x + 1, top), fill=(84, 92, 104, 255))
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer.paste(img.crop(box), (left, 0))
    out.alpha_composite(layer)
    if beam is not None:
        beam_layer(out, beam, k, OX - box[0] + left, OY - box[1], left)
    return out.resize((w * zoom, h * zoom), Image.NEAREST)


def _beam_of(d: Drawn):
    if "beam" in d.extra and "beam_src" in d.extra:
        return (d.extra["beam"][0], d.extra["beam_src"]), d.extra["beam"][1]
    return None, 0


def previews(out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    rendered = {name: render_dj(name) for name in ANIMATIONS}
    failures = [f"{n}[{i}] {f}" for n, frs in rendered.items() for i, d in enumerate(frs) for f in d.failures]
    box = _box([d.image for frs in rendered.values() for d in frs], FLOOR + OY)
    LEFT = 70

    def stage(d, zoom=ZOOM, left=0):
        beam, k = _beam_of(d)
        return _stage(d.image, box, zoom, left if beam is not None else left, beam if left else None, k)

    single = ["groove", "point-top", "point-bottom", "drop", "hurt", "defeat"]
    for name in single:
        _, fps, loop, _ = ANIMATIONS[name]
        imgs = [stage(d) for d in rendered[name]]
        durs = [round(1000 / fps)] * len(imgs)
        if loop:
            imgs, durs = imgs * 3, durs * 3
        else:
            durs[-1] = {"defeat": 1500, "point-top": 700, "point-bottom": 700}.get(name, 400)
        br.gif(out / f"{name}.gif", imgs, durs)
    for lane in ("top", "bottom"):
        seq, durs = [], []
        for part, times, hold in (("windup", 1, 500), ("loop", 4, None), ("release", 1, 400)):
            name = f"beam-{lane}-{part}"
            fps = ANIMATIONS[name][1]
            for _ in range(times):
                for d in rendered[name]:
                    seq.append(stage(d, left=LEFT))
                    durs.append(round(1000 / fps))
            if hold:
                durs[-1] = hold
        br.gif(out / f"beam-{lane}.gif", seq, durs)
    # the speaker
    spk = {name: [draw_speaker(p) for p in make()] for name, (make, _, _) in SPEAKER_ANIMS.items()}
    sbox = (0, 0, SW, SH)

    def sstage(img, zoom=ZOOM):
        o = Image.new("RGBA", (SW, SH), br.BG)
        ImageDraw.Draw(o).line([(0, SPK_FLOOR), (SW, SPK_FLOOR)], fill=(84, 92, 104, 255))
        o.alpha_composite(img)
        return o.resize((SW * zoom, SH * zoom), Image.NEAREST)
    for name, frames in spk.items():
        _, fps, loop = SPEAKER_ANIMS[name]
        imgs = [sstage(f) for f in frames]
        durs = [round(1000 / fps)] * len(imgs)
        if loop:
            imgs, durs = imgs * 4, durs * 4
        else:
            durs[-1] = 900
        br.gif(out / f"{name}.gif", imgs, durs)
    # the effects
    waves = [shockwave(k) for k in range(5)]
    wimgs = []
    for k in range(10):
        o = Image.new("RGBA", (90, WAVE_H + 4), br.BG)
        ImageDraw.Draw(o).line([(0, WAVE_H), (90, WAVE_H)], fill=(84, 92, 104, 255))
        o.alpha_composite(waves[k % 5], (90 - WAVE_W - k * 7, 1))
        wimgs.append(o.resize((90 * ZOOM, (WAVE_H + 4) * ZOOM), Image.NEAREST))
    br.gif(out / "shockwave.gif", wimgs, [83] * len(wimgs))
    strips = [beam_strip(k) for k in range(4)]
    simgs = []
    for k in range(8):
        o = Image.new("RGBA", (STRIP_W * 3, BEAM_H + 4), br.BG)
        for t in range(3):
            o.alpha_composite(strips[k % 4], (t * STRIP_W, 2))
        simgs.append(o.resize((o.width * ZOOM, o.height * ZOOM), Image.NEAREST))
    br.gif(out / "beam-strip.gif", simgs, [125] * len(simgs))

    # sheet: DJ rows, then the speaker, the shockwave and the strip
    cell = (box[2] - box[0], box[3] - box[1])
    rows = [(n, ANIMATIONS[n][1], [(stage(d, 1), bool(d.failures)) for d in rendered[n]]) for n in ANIMATIONS]
    zoom = 3
    srows = [(n, SPEAKER_ANIMS[n][1], [sstage(f, 1) for f in frs]) for n, frs in spk.items()]
    srows.append(("shockwave", 12, [w for w in waves]))
    srows.append(("beam-strip", 8, [s for s in strips]))
    widths = [len(f) * (cell[0] * zoom + 4) for _, _, f in rows]
    width = max(widths) + 100
    height = len(rows) * (cell[1] * zoom + 14) + len(srows) * (SH * zoom + 14)
    sheet = Image.new("RGBA", (width, height), (30, 32, 38, 255))
    d = ImageDraw.Draw(sheet)
    y = 0
    for name, fps, frames in rows:
        d.text((4, y + 4), f"{name}\n{fps} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        for i, (img, bad) in enumerate(frames):
            x = 100 + i * (cell[0] * zoom + 4)
            sheet.alpha_composite(img.resize((img.width * zoom, img.height * zoom), Image.NEAREST), (x, y))
            hit = ANIMATIONS[name][3]
            label = f"{i}{' !' if bad else ''}{' beat' if hit == i else ''}"
            d.text((x + 2, y + cell[1] * zoom + 1), label, fill=(255, 120, 120, 255) if bad else (160, 160, 160, 255))
        y += cell[1] * zoom + 14
    for name, fps, frames in srows:
        d.text((4, y + 4), f"{name}\n{fps} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        for i, img in enumerate(frames):
            x = 100 + i * (SW * zoom + 8)
            if img.size != (SW, SH):
                o = Image.new("RGBA", (max(img.width, 8), max(img.height, 8)), br.BG)
                o.alpha_composite(img)
                img = o
            sheet.alpha_composite(img.resize((img.width * zoom, img.height * zoom), Image.NEAREST), (x, y))
        y += SH * zoom + 14
    sheet.save(out / "sheet.png")
    parts_sheet(out / "parts.png")
    fight(out, rendered, spk, waves)
    (out / "box.txt").write_text(
        f"DJ cell {cell} at {box} of the canvas; pivot (floor under his boots, painting x 64) "
        f"{(64 + OX - box[0], FLOOR + OY - box[1])}\n"
        f"speaker cell {(SW, SH)}; pivot (floor under the cabinet, its middle) {(SW // 2, SPK_FLOOR)}\n"
        f"shockwave {(WAVE_W, WAVE_H)} bottom on the lane floor; beam strip {(STRIP_W, BEAM_H)} tiling, its axis "
        f"{FLOOR - BEAM_AXIS['bottom']:.0f} px over the lane floor\n")
    return failures


# where things stand in the fight scene, painting px (the DJ's own frame)
TOP_SPK_X = -34.0        # the top speaker's left edge, on the ledge
LOW_SPK_X = -18.0        # the bottom speaker's left edge, on the floor in front of the booth
SCENE = (-170, -34, 136, 112)


def _spk_at(scene, img, x, floor_y, ox, oy):
    scene.alpha_composite(img, (int(x - SOX + ox), int(floor_y - SPK_FLOOR + oy)))


def fight(out, rendered, spk, waves, zoom=3):
    """groove x2 with the speakers thumping; point-top with the top speaker charging; drop with the top speaker's
    blast and the ring rolling down the top lane; groove; beam-bottom; the top speaker overloads; dashed through it
    breaks and he's hurt; groove; defeat."""
    ox, oy = -SCENE[0], -SCENE[1]
    W, H = SCENE[2] - SCENE[0], SCENE[3] - SCENE[1]
    seq, durs = [], []
    state = {"top": ("speaker-thump", 0), "low": ("speaker-thump", 0), "waves": [], "wreck": False}

    def frame(d: Drawn, ms, top=None, low=None, t=0):
        sc = Image.new("RGBA", (W, H), br.BG)
        dr = ImageDraw.Draw(sc)
        dr.rectangle([0, FLOOR + oy, W, H], fill=(40, 44, 52, 255))
        dr.rectangle([0, TOP_LANE_Y + oy, W + TOP_SPK_X - 30, TOP_LANE_Y + oy + 3], fill=(70, 78, 90, 255))
        _spk_at(sc, top, TOP_SPK_X, TOP_LANE_Y, ox, oy)
        _spk_at(sc, low, LOW_SPK_X, FLOOR, ox, oy)
        sc.alpha_composite(d.image, (ox - OX, oy - OY))
        beam, k = _beam_of(d)
        if beam is not None:
            beam_layer(sc, beam, k, ox, oy, ox - OX)
        for wv in state["waves"]:
            wx, lane_y, kk = wv
            sc.alpha_composite(waves[kk % 5], (int(wx + ox), int(lane_y - WAVE_H + 1 + oy)))
        seq.append(sc.resize((W * zoom, H * zoom), Image.NEAREST))
        durs.append(ms)
        state["waves"] = [(wx - 6, ly, kk + 1) for wx, ly, kk in state["waves"] if wx > SCENE[0] - 30]

    def spk_frame(which, t):
        name, start = state[which]
        frs = spk[name]
        loop = SPEAKER_ANIMS[name][2]
        i = t - start
        return frs[i % len(frs)] if loop else frs[min(i, len(frs) - 1)]

    clock = [0]

    def play(name, times=1, hold=None, top=None, low=None, on_frame=None):
        fps = ANIMATIONS[name][1]
        frs = rendered[name]
        for _ in range(times):
            for i, d in enumerate(frs):
                if on_frame:
                    on_frame(i)
                t = clock[0]
                frame(d, round(1000 / fps), spk_frame("top", t), spk_frame("low", t))
                clock[0] += 1
        if hold:
            durs[-1] = hold

    def set_spk(which, name):
        state[which] = (name, clock[0])

    play("groove", 2)
    set_spk("top", "speaker-charge")
    play("point-top", hold=500)

    def drop_cue(i):
        if i == 2:
            set_spk("top", "speaker-blast")
        if i == 3:
            state["waves"].append((TOP_SPK_X - WAVE_W + 2, TOP_LANE_Y, 0))
    play("drop", hold=250, on_frame=drop_cue)
    set_spk("top", "speaker-thump")
    play("groove", 1)
    set_spk("low", "speaker-thump")
    play("beam-bottom-windup", hold=400)
    play("beam-bottom-loop", 3)
    play("beam-bottom-release")
    set_spk("top", "speaker-overload")
    play("groove", 3)
    set_spk("top", "speaker-broken")
    play("hurt", hold=200)
    play("groove", 2)
    state["low"] = ("speaker-thump", 10 ** 6)   # it stops with him
    play("defeat", hold=1800)
    br.gif(out / "fight.gif", seq, durs)


def parts_sheet(path: Path) -> None:
    rigx = rig()
    marks = {"body": [NECK, SHOULDER_N, SHOULDER_F, HIP], "glove_n": [REST_N["wrist"]], "glove_f": [REST_F["wrist"]],
             "deck": []}
    tiles = [br.tile(rigx.parts[n].image, n, marks[n]) for n in ("body", "glove_n", "glove_f", "deck")]
    tiles.append(br.tile(_spk_image(), "speaker\n(own grid)", [WOOFER[:2], TWEETER[:2]]))
    tiles.append(br.tile(_shift_booth(rigx), "flight case\n(drawn)"))
    # the drawn parts on their own: the sleeves at rest and the ball
    f = Frame(REST)
    s, e, w = f.arm(SHOULDER_N, REST_N["wrist"], UPPER_N, FORE_N, -1)
    sl = _sleeve(rigx, s, e, w, SLEEVE_N, SLEEVE_N - .6)
    tiles.append(br.tile(_shift_to_native(sl), "sleeve\n(drawn)"))
    ball, _, _ = draw_ball(Ball(), BALL_C)
    tiles.append(br.tile(_shift_to_native(ball), "ball\n(drawn)"))
    ball2, _, _ = draw_ball(Ball(spin=.5, dark=.0, missing=8, roll=20), BALL_C)
    tiles.append(br.tile(_shift_to_native(ball2), "ball spun,\ntiles off"))
    br.tiles_sheet(path, tiles)


def _shift_booth(rigx):
    case = np.zeros((N, N, 4), np.uint8)
    small = rigx.booth_big[br.K // 2::br.K, br.K // 2::br.K]
    case[:small.shape[0], :small.shape[1]] = small
    return case


def _shift_to_native(img):
    return img[OY:OY + N, OX:OX + N].copy()


if __name__ == "__main__":
    problems = previews(Path(sys.argv[1]))
    print("\n".join(problems) if problems else "every joint holds, every frame in one piece")
    sys.exit(1 if problems else 0)
