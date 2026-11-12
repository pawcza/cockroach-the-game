"""The roach up on its hind legs with a pistol: the boss fight's animations.

The run's rig draws a still body over legs on the floor; here the body bends. It is cut in three (abdomen, thorax,
head) and each part is turned about its joint, so the roach can rear, stand, curl into a roll and look ahead while
its legs stay planted. Legs are solved after the turn, from where the hips went to where the feet should be.

These frames use a taller and wider cell than the run's, on the same pixel grid, with their pivot on the same point
of the roach: switching between a run frame and one of these, nothing jumps. The pistol is pixel art drawn at native
size on top of the baked frame, in its own colours whatever the skin, the near hand drawn over its grip.
"""
import math
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

import roach

S = (roach.CROP[2] - roach.CROP[0]) / roach.CELL[0]  # canvas px per native px
# Native px added to the run's cell: left, top, right, bottom
GROW = (0, 29, 4, 1)
CELL = (roach.CELL[0] + GROW[0] + GROW[2], roach.CELL[1] + GROW[1] + GROW[3])
CROP = (roach.CROP[0] - GROW[0] * S, roach.CROP[1] - GROW[1] * S,
        roach.CROP[2] + GROW[2] * S, roach.CROP[3] + GROW[3] * S)
# The run cell's centre, which is the sprite's position in the game
PIVOT = ((roach.CELL[0] / 2 + GROW[0]) / CELL[0], (roach.CELL[1] / 2 + GROW[1]) / CELL[1])
# Where the run canvas's (0, 0) sits in this one, and its size: room for the crop and a margin
OX, OY = math.ceil(-CROP[0]) + 16, math.ceil(-CROP[1]) + 16
SIZE = (math.ceil(CROP[2]) + OX + 16, max(768, math.ceil(CROP[3])) + OY + 16)

GROUND = roach.GROUND
# Joints on the 768 px body: the hind hip the abdomen turns about, the belly end of the cut between abdomen and thorax,
# and the top of the neck. A part turns about the end of its cut that keeps it overlapping its neighbour.
HIP = (300, 452)
WAIST = (464, 446)
WAIST_TOP = (464, 272)  # curling forward, the thorax turns about the top of the cut instead
NECK = (566, 306)
CUT_WAIST, CUT_NECK = 464, 566
FAR = (-26, -10)  # the far side's legs, as the run draws them: a little behind and above

# The pistol, one character per native pixel: k outline, m gunmetal, l its light top edge, d shadow, g the grip
PISTOL = [
    "..lllllllllll.",
    ".lmmmmmmmmmmmw",
    ".kmmmmmmmmmmmk",
    "..kddddkkdddk.",
    "..kggk.k.k....",
    ".kgggk.kk.....",
    ".kggk.........",
    "kggk..........",
    ".kk...........",
]
INK = {"k": (30, 32, 40, 255), "m": (104, 112, 128, 255), "l": (192, 200, 214, 255), "w": (236, 240, 246, 255),
       "d": (70, 76, 90, 255), "g": (74, 80, 94, 255)}
GRIP = (3.0, 5.5)  # where the hand holds it, in its pixels
MUZZLE = (14.0, 2.0)


def _pistol_pixels() -> np.ndarray:
    out = np.zeros((len(PISTOL), len(PISTOL[0]), 4), np.uint8)
    for y, row in enumerate(PISTOL):
        for x, ch in enumerate(row):
            if ch in INK:
                out[y, x] = INK[ch]
    return out


TRIGGER = (8.5, 4.5)  # the trigger guard, which a finger spins it on


def pistol(angle: float, about: tuple[float, float] = GRIP) -> tuple[Image.Image, dict[str, tuple[float, float]]]:
    """The pistol turned (degrees, anticlockwise) about a point of itself: the image, and where its about point, grip
    and muzzle are in it. Turned at eight times size and sampled back down per pixel, so it stays crisp pixel art."""
    k, pad = 8, 12
    big = cv2.resize(_pistol_pixels(), None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST)
    big = cv2.copyMakeBorder(big, pad * k, pad * k, pad * k, pad * k, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0))
    centre = ((about[0] + pad) * k, (about[1] + pad) * k)
    turned = cv2.warpAffine(big, cv2.getRotationMatrix2D(centre, angle, 1), big.shape[1::-1], flags=cv2.INTER_NEAREST)
    small = turned[k // 2::k, k // 2::k].copy()
    box = Image.fromarray(small).getbbox()
    a = math.radians(angle)

    def where(point):
        dx, dy = point[0] - about[0], point[1] - about[1]
        return (about[0] + pad - box[0] + dx * math.cos(a) + dy * math.sin(a),
                about[1] + pad - box[1] - dx * math.sin(a) + dy * math.cos(a))
    return Image.fromarray(small).crop(box), {"about": where(about), "grip": where(GRIP), "muzzle": where(MUZZLE)}


def _turn(degrees: float, about: tuple[float, float]) -> np.ndarray:
    """Anticlockwise on screen, as cv2 turns."""
    m = np.eye(3)
    m[:2] = cv2.getRotationMatrix2D((float(about[0]), float(about[1])), degrees, 1)
    return m


def _move(dx: float, dy: float) -> np.ndarray:
    m = np.eye(3)
    m[0, 2], m[1, 2] = dx, dy
    return m


def _at(m: np.ndarray, point) -> tuple[float, float]:
    x, y = point
    return (m[0, 0] * x + m[0, 1] * y + m[0, 2], m[1, 0] * x + m[1, 1] * y + m[1, 2])


# Hips: a point well inside each leg's body segment (0 abdomen, 1 thorax), turned with that segment, so a leg always
# starts under the body whatever the pose; the far side's are a little behind and above, as the run draws them.
# Rear to front: hind, middle, front. Femur and tibia lengths are the run's.
HIPS = (((306, 400), 0), ((496, 380), 1), ((548, 356), 1))
LIMBS = ((54, 94), (54, 82), (54, 82))
NEAR_WIDTH, FAR_WIDTH = 15, 11


@dataclass
class Pose:
    """pitch: the abdomen's turn up about the hind hip (degrees, anticlockwise); bend: the thorax's further turn about
    the waist; nod: the head's about the neck (negative looks down). The body is then moved so the hind hip is at hip.
    feet: per leg, near hind, middle, front then far hind, middle, front: a point on the canvas.
    knees: per leg, the side the knee goes: 1 clockwise of the line from hip to foot, -1 anticlockwise.
    reach: leg lengths per pair (hind, middle, front), from the run's.
    gun: (angle, where its spin_on point is on the canvas) or None. hands: legs drawn over the pistol, holding it."""
    pitch: float = 0
    bend: float = 0
    nod: float = 0
    hip: tuple[float, float] = HIP
    feet: list = field(default_factory=list)
    knees: tuple = (1, 1, 1, 1, 1, 1)
    reach: tuple = (1.0, 1.0, 1.0)
    sway: float = 0
    lift: float = 0
    gun: tuple[float, tuple[float, float]] | None = None
    hands: tuple = ()
    spin_on: tuple[float, float] = GRIP  # the point of the pistol that gun's point is, and that it turns about


def _matrices(pose: Pose) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    abdomen = _move(pose.hip[0] - HIP[0], pose.hip[1] - HIP[1]) @ _turn(pose.pitch, HIP)
    thorax = abdomen @ _turn(pose.bend, WAIST if pose.bend >= 0 else WAIST_TOP)
    head = thorax @ _turn(pose.nod, NECK)
    return abdomen, thorax, head


def _parts(body: np.ndarray) -> list[np.ndarray]:
    body = body.copy()
    body[400:, 490:560, 3] = 0  # the stubs of the painting's own legs under the thorax: the rig draws its own
    xs = np.arange(body.shape[1])[None, :]
    parts = []
    for keep in (xs < CUT_WAIST, (xs >= CUT_WAIST) & (xs < CUT_NECK), xs >= CUT_NECK):
        part = body.copy()
        part[~np.broadcast_to(keep, body.shape[:2]), 3] = 0
        parts.append(part)
    return parts


def _place_on(canvas: np.ndarray, image: np.ndarray, m: np.ndarray) -> None:
    warp = (_move(OX, OY) @ m)[:2]
    out = cv2.warpAffine(image, warp, canvas.shape[1::-1], flags=cv2.INTER_NEAREST)
    solid = out[..., 3] > 128
    canvas[solid] = out[solid]


def _leg(img, hip, foot, femur, tibia, near, knee):
    """Two segments from hip to foot, the knee to one side; a foot out of reach is reached for along the line."""
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    toward = math.atan2(dy, dx)
    reach = max(1.0, min(math.hypot(dx, dy), femur + tibia - 1))
    cosine = max(-1, min(1, (femur ** 2 + reach ** 2 - tibia ** 2) / (2 * femur * reach)))
    bend = toward + knee * math.acos(cosine)
    knee_at = (hip[0] + femur * math.cos(bend), hip[1] + femur * math.sin(bend))
    foot = (hip[0] + reach * math.cos(toward), hip[1] + reach * math.sin(toward))
    roach._limb(img, [(hip[0] + OX, hip[1] + OY), (knee_at[0] + OX, knee_at[1] + OY), (foot[0] + OX, foot[1] + OY)],
                NEAR_WIDTH if near else FAR_WIDTH, near)


def _antennae(img, head: np.ndarray, sway: float, lift: float) -> None:
    turned = math.atan2(-head[1, 0], head[0, 0])  # the head's turn, anticlockwise
    base = _at(head, (660, 300))
    for spread, length in ((0, 1.0), (-.42, .8)):
        points, x, y, angle = [], base[0], base[1], -1.0 + spread + lift - turned
        for segment in range(5):
            points.append((x + OX, y + OY))
            angle += .10 + sway * .10 * segment
            x += 36 * length * math.cos(angle)
            y += 36 * length * math.sin(angle)
        cv2.polylines(img, [np.int32(points)], False, roach.ANTENNA, 9, cv2.LINE_8)


def hips(pose: Pose) -> list[tuple[float, float]]:
    """Each leg's hip on the canvas: near hind, middle, front, then the far ones."""
    mats = _matrices(pose)
    near = [_at(mats[segment], point) for point, segment in HIPS]
    return near + [(x + FAR[0], y + FAR[1]) for x, y in near]


def _bake(canvas: np.ndarray) -> Image.Image:
    box = (CROP[0] + OX, CROP[1] + OY, CROP[2] + OX, CROP[3] + OY)
    return Image.fromarray(canvas).resize(CELL, Image.BOX, box=box)


def seated(pitch: float, x: float, sink: float = 4) -> tuple[float, float]:
    """The hind hip, at x, high enough that the abdomen turned up by pitch rests its tip on the floor."""
    ys, xs = np.nonzero(roach.BODY[::4, :CUT_WAIST:4, 3] > 128)
    m = _turn(pitch, HIP)
    lowest = max(m[1, 0] * x4 + m[1, 1] * y4 + m[1, 2] for x4, y4 in zip(xs * 4, ys * 4))
    return x, HIP[1] + GROUND + sink - lowest


def native(point) -> tuple[float, float]:
    return round((point[0] - CROP[0]) / S, 2), round((point[1] - CROP[1]) / S, 2)


# Each frame's anchors, as frames are made; and any leg whose hip came out off the body (frame, leg): must stay empty
_made: list[dict] = []
detached: list[tuple[int, int]] = []


@dataclass
class _Layers:
    """A pose drawn at canvas size: legs and body, the legs drawn over the pistol, where the body is, the pistol."""
    under: np.ndarray
    hands: np.ndarray
    body: np.ndarray
    gun: tuple[float, tuple[float, float]] | None
    spin_on: tuple[float, float]
    anchors: dict


def _draw(pose: Pose) -> _Layers:
    mats = _matrices(pose)
    at = hips(pose)
    under = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
    hands = np.zeros_like(under)
    for n in (3, 4, 5, 0, 1, 2):  # far legs first, behind
        femur, tibia = (v * pose.reach[n % 3] for v in LIMBS[n % 3])
        target = hands if (pose.gun and n in pose.hands) else under
        _leg(target, at[n], pose.feet[n], femur, tibia, n < 3, pose.knees[n])
    for part, m in zip(_parts(roach.BODY), mats):
        _place_on(under, part, m)
    body = _body_mask(mats)
    for n, (x, y) in enumerate(at):
        x, y = int(round(x)) + OX, int(round(y)) + OY
        if not body[y - 4:y + 5, x - 4:x + 5].all():  # the hip, and half a pixel round it, all on the body
            detached.append((len(_made), n))
    _antennae(under, mats[2], pose.sway, pose.lift)
    hands[body] = 0  # the arms start under the body like every leg
    return _Layers(under, hands, body, pose.gun, pose.spin_on, _anchors(mats))


def _body_mask(mats) -> np.ndarray:
    mask = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
    for part, m in zip(_parts(roach.BODY), mats):
        _place_on(mask, part, m)
    return mask[..., 3] > 128


def _finish(layers: _Layers, turn: float = 0.0, about=(0.0, 0.0)) -> Image.Image:
    """Bakes the layers, turned as one (degrees, anticlockwise, about a canvas point): the pistol in between."""
    spin = _turn(turn, about)
    under, hands = layers.under, layers.hands
    if turn:
        warp = (_move(OX, OY) @ spin @ _move(-OX, -OY))[:2]
        under = cv2.warpAffine(under, warp, under.shape[1::-1], flags=cv2.INTER_NEAREST)
        hands = cv2.warpAffine(hands, warp, hands.shape[1::-1], flags=cv2.INTER_NEAREST)
    image = _bake(under)
    anchors = {name: (list(native(_at(spin, value))) if isinstance(value, tuple) else value)
               for name, value in layers.anchors.items()}
    if turn:
        anchors["angle"] = round(anchors["angle"] - turn, 2)
        anchors["angles"] = {name: round(v - turn, 2) for name, v in anchors["angles"].items()}
    if layers.gun:
        angle, at = layers.gun[0] + turn, native(_at(spin, layers.gun[1]))
        gun, points = pistol(angle, layers.spin_on)
        corner = (round(at[0] - points["about"][0]), round(at[1] - points["about"][1]))
        _paste(image, gun, corner)
        image.alpha_composite(_bake(hands))
        for name in ("grip", "muzzle"):
            anchors[name] = [round(corner[0] + points[name][0], 2), round(corner[1] + points[name][1], 2)]
    _made.append(anchors)
    return image


def frame(pose: Pose) -> Image.Image:
    return _finish(_draw(pose))


def _paste(image: Image.Image, layer: Image.Image, corner) -> None:
    over = Image.new("RGBA", image.size)
    over.paste(layer, corner)
    image.alpha_composite(over)


def _anchors(mats) -> dict:
    """On the canvas still: _finish turns them with the frame and makes them cell pixels."""
    abdomen, thorax, head = mats
    on = {"head": head, "back": abdomen, "tail": abdomen, "side": abdomen, "shoulder": thorax}
    out = {name: _at(on[name], point) for name, point in roach.ANCHORS.items()}
    turn = lambda m: round(-math.degrees(math.atan2(-m[1, 0], m[0, 0])), 2)  # noqa: E731  clockwise, as the game turns
    out["angle"] = turn(abdomen)
    out["angles"] = {name: turn(on[name]) for name in roach.ANCHORS}
    return out


def frames_with_anchors(make):
    _made.clear()
    frames = make()
    return frames, list(_made)


def stand(pitch=40, bend=35, nod=-58, x=330, crouch=0, lean=0, grip=(120, 40), gun=0.0, mid="brace",
          reach=(1.3, 2.0, 1.15), sway=0.0, lift=0.0, arms=None, spin_on=GRIP, spread=(70, -46),
          brace=(200, 160)) -> Pose:
    """Up on the hind legs, the abdomen's tip on the floor, the hind feet planted wide and the middle ones braced on
    the floor ahead: a four-point base. crouch lowers the body over its feet (the knees take it), lean moves it
    forward. Both front legs hold the pistol at grip, measured from the near front hip so the gun moves with the chest,
    turned by gun degrees (gun None: the hands are there empty). arms: other points for the near and far front feet
    (the far one None tucks it against the chest). mid "tuck" folds the middle legs flat under the belly instead."""
    hx, hy = seated(pitch, x)
    pose = Pose(pitch=pitch, bend=bend, nod=nod, hip=(hx + lean, hy + crouch), reach=reach, sway=sway, lift=lift,
                spin_on=spin_on)
    at = hips(pose)
    feet = [None] * 6
    feet[0], feet[3] = (x + spread[0], GROUND), (x + spread[1] + FAR[0], GROUND + FAR[1])
    if mid == "brace":
        feet[1], feet[4] = (x + brace[0], GROUND), (x + brace[1] + FAR[0], GROUND + FAR[1])
    else:
        feet[1], feet[4] = _tucked_foot(at[1], pose), _tucked_foot(at[4], pose)
    hold = (at[2][0] + grip[0], at[2][1] + grip[1])
    near, far = arms or (hold, (hold[0] + 8, hold[1] - 4))
    feet[2], feet[5] = near, far if far is not None else _tucked_foot(at[5], pose)
    pose.feet = feet
    # Hind knees forward, middle knees up and back as braced arms, front elbows down; tucked legs fold forward
    pose.knees = (-1, 1 if mid == "brace" else -1, 1, -1, 1 if mid == "brace" else -1, 1 if far is not None else -1)
    pose.gun = None if gun is None else (gun, hold)
    pose.hands = (2,)
    return pose


def _tucked_foot(hip, pose: Pose) -> tuple[float, float]:
    """A foot folded back along the belly, inside the body's outline: the leg lies flat under it, out of sight."""
    thorax = _matrices(pose)[1]
    toward = (thorax[0, 0] * -1 + thorax[0, 1] * -.6, thorax[1, 0] * -1 + thorax[1, 1] * -.6)  # back and up the body
    return (hip[0] + 60 * toward[0], hip[1] + 60 * toward[1])


def crawl(bob=0, sway=0.0, lift=0.0) -> Pose:
    """On all six, every foot where the run's rig rests it, the body lowered by bob."""
    pose = Pose(hip=(HIP[0], HIP[1] + bob), sway=sway, lift=lift)
    pose.feet = [(x + reach + (FAR[0] if n >= 3 else 0), GROUND + (FAR[1] if n >= 3 else 0))
                 for n, (x, _, reach) in enumerate(roach.LEGS * 2)]
    pose.knees = (-1, -1, -1, -1, -1, -1)
    return pose


# Where the falling pistol is caught: both hands up over the head, from the near front hip
REACH_UP = (60, -118)


def rear():
    up = dict(nod=-40, gun=None, grip=REACH_UP)
    return [
        frame(crawl(bob=24, sway=-.5, lift=-.15)),                                               # crouch
        frame(stand(pitch=18, bend=26, nod=-36, crouch=-6, grip=(140, 90), gun=None, sway=-1.0,
                    brace=(220, 180))),                                                           # push off
        frame(stand(pitch=46, bend=42, crouch=-24, sway=-1.4, lift=.3, **{**up, "grip": (64, -132)})),  # overshoot
        frame(stand(crouch=-8, sway=.4, **up)),                                                   # settle
        frame(stand(crouch=0, sway=.1, lift=.05, **up)),                                          # hands up, waiting
    ]


def catch():
    return [
        frame(stand(nod=-40, crouch=14, grip=(REACH_UP[0], REACH_UP[1] + 14), sway=-.6, lift=-.1)),  # it lands, heavy
        frame(stand(nod=-50, crouch=10, grip=(100, -30), gun=-14, sway=-.3)),                       # brought down
        frame(stand(crouch=3, grip=(122, 44), gun=4, sway=.4)),                                     # into aim
    ]


def aim():
    """Breathing: the whole roach sinks a pixel and rises, chest, arms and pistol together."""
    frames = []
    for i in range(4):
        t = i / 4 * math.tau
        frames.append(frame(stand(crouch=round(8 - 8 * math.cos(t)), bend=35 + 1.2 * math.sin(t),
                                  sway=.5 * math.sin(t), lift=.06 * math.cos(t))))
    return frames


def shoot():
    """At 20 fps, 250 ms: the kick, held a beat, then the recovery, an overshoot forward and settled."""
    return [
        frame(stand(pitch=36, bend=20, nod=-36, crouch=20, grip=(92, 2), gun=34, sway=-1.9, lift=.4)),   # kick
        frame(stand(pitch=36, bend=21, nod=-38, crouch=22, grip=(95, 6), gun=28, sway=-1.5, lift=.3)),   # held
        frame(stand(pitch=39, bend=32, nod=-54, crouch=10, grip=(114, 32), gun=6, sway=.1)),             # recover
        frame(stand(pitch=41, bend=38, nod=-62, crouch=3, lean=4, grip=(126, 46), gun=-5, sway=.8)),     # overshoot
        frame(stand(crouch=0, sway=.4)),                                                                 # settle
    ]


# Curled up for the roll: the thorax bent down over the belly, every leg pulled in under it, the pistol hugged to
# the chest, the antennae laid back
TUCK = dict(pitch=60, bend=-60, nod=-60)


def _ball() -> Pose:
    pose = Pose(pitch=TUCK["pitch"], bend=TUCK["bend"], nod=TUCK["nod"], sway=-.6, lift=-1.1, reach=(.8, .8, 1.0))
    at = hips(pose)
    chest = _at(_matrices(pose)[1], (520, 400))
    pose.feet = [(at[n][0] + dx, at[n][1] + dy) for n, (dx, dy) in
                 enumerate([(50, -30), (30, -40), (0, 0), (50, -30), (30, -40), (0, 0)])]
    hold = (chest[0] + 10, chest[1] + 20)
    pose.feet[2], pose.feet[5] = hold, (hold[0] + 6, hold[1] - 6)
    pose.knees = (-1, -1, 1, -1, -1, 1)
    pose.gun = (-80, hold)
    pose.hands = (2,)
    return pose


def flip():
    """Crouch, then the ball turned as one through the air, then open into a squashed landing and up into aim."""
    layers = _draw(_ball())
    ys, xs = np.nonzero(layers.body)
    centre = ((xs.min() + xs.max()) / 2 - OX, (ys.min() + ys.max()) / 2 - OY)
    target = (392, 284)
    shift = _move(target[0] - centre[0], target[1] - centre[1])
    warp = (_move(OX, OY) @ shift @ _move(-OX, -OY))[:2]
    layers.under = cv2.warpAffine(layers.under, warp, layers.under.shape[1::-1], flags=cv2.INTER_NEAREST)
    layers.hands = cv2.warpAffine(layers.hands, warp, layers.hands.shape[1::-1], flags=cv2.INTER_NEAREST)
    layers.gun = (layers.gun[0], _at(shift, layers.gun[1]))
    layers.anchors = {k: (_at(shift, v) if isinstance(v, tuple) else v) for k, v in layers.anchors.items()}
    frames = [frame(stand(crouch=24, pitch=36, bend=30, sway=-.8))]                    # launch: aim, crouched
    for turn in (-12, -84, -156, -228, -300):
        frames.append(_finish(layers, turn, target))
        _made[-1]["hide"] = True  # curled up and spinning, nothing worn has a place to sit: worn items hide
    frames.append(frame(stand(crouch=28, pitch=36, bend=30, grip=(112, 50), sway=1.0, lift=.15)))  # land, squashed
    frames.append(frame(stand(crouch=8, sway=.5)))                                                 # up into aim
    return frames


def win():
    """The near hand raises the pistol beside the head and spins it on its trigger guard, the far arm folded in;
    then tosses it up and away, and the roach drops onto all six, ready to run."""
    up = dict(nod=-44, grip=(104, -84), spin_on=TRIGGER, arms=((0, 0), None))
    frames = [frame(stand(crouch=10, grip=(116, 48), gun=-12, sway=-.3))]                       # dip
    for angle, sway in ((80, .5), (170, .7), (260, .4), (350, .6)):                              # raise it, then twirl
        pose = stand(**{**up, "gun": angle, "sway": sway})
        pose.feet[2] = pose.gun[1]
        frames.append(frame(pose))
    toss = stand(nod=-36, gun=None, arms=((0, 0), None), sway=-.9, lift=.2)                    # let go: up it goes
    hand = (hips(toss)[2][0] + 70, hips(toss)[2][1] - 116)
    toss.feet[2] = hand
    toss.gun, toss.spin_on = (40, (hand[0] + 60, hand[1] - 110)), TRIGGER
    frames.append(frame(toss))
    frames += [
        frame(stand(pitch=16, bend=18, nod=-24, crouch=-4, grip=(140, 100), gun=None, sway=.8,
                    brace=(220, 180))),                                                   # down on all six
        frame(crawl(bob=20, sway=1, lift=.1)),                                                    # lands
        frame(crawl(bob=0, sway=.4)),                                                             # ready to run
    ]
    return frames


ARMED = {"rear": rear, "catch": catch, "aim": aim, "shoot": shoot, "flip": flip, "win": win}


# The shot's own sprites, in native pixels: the muzzle flash (bursting, then fading), and the spent casing tumbling
# (lying, then standing). w white, y yellow, o orange, r red; b brass, s its shine, n its dark end.
FLASH = [
    ["....o....",
     "..o.yo...",
     ".oyywyo.o",
     "oywwwwyyy",
     ".oyywyo.o",
     "..o.yo...",
     "....o...."],
    ["...o...",
     ".oyyo..",
     "oywwyyo",
     ".oyyo..",
     "...o..."],
    [".r.",
     "rov",
     ".r."],
]
CASING = [["sbb", "nbb"], ["sn", "bb", "bb"]]
SPARK = {"w": (255, 255, 236, 255), "y": (255, 222, 90, 255), "o": (255, 150, 40, 235), "r": (220, 80, 30, 200),
         "v": (255, 190, 80, 220), "b": (214, 160, 62, 255), "s": (255, 230, 150, 255), "n": (130, 86, 34, 255)}


def _pixels(rows: list[str], size: tuple[int, int] | None = None, at: tuple[int, int] = (0, 0)) -> Image.Image:
    image = Image.new("RGBA", size or (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in SPARK:
                image.putpixel((x + at[0], y + at[1]), SPARK[ch])
    return image


def props() -> dict[str, tuple[list[Image.Image], tuple[float, float]]]:
    """The pistol on its own (falling from the sky, its grip as the pivot), the muzzle flash (its pivot where the
    muzzle is: the middle of its left edge) and the casing."""
    gun, points = pistol(0)
    grip = points["grip"]
    flash = [_pixels(rows, (9, 7), (0, (7 - len(rows)) // 2)) for rows in FLASH]
    casing = [_pixels(rows, (3, 3), ((3 - len(rows[0])) // 2, (3 - len(rows)) // 2)) for rows in CASING]
    return {
        "pistol": ([gun], (grip[0] / gun.width, grip[1] / gun.height)),
        "flash": (flash, (0.0, .5)),
        "casing": (casing, (.5, .5)),
    }
