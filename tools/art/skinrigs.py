"""Level skins as animated sprites: the same enemy behaviour drawn as something that fits the level.

The game plays a skin with its base enemy's animation keys and frame indices, so every skin provides, for each animation
of its base that depicts the thing itself, a strip with the SAME frame count, order and meaning. SKIN_RIGS maps
"<skinId>/<baseAnim>" to a function returning that strip in the form the base's own rig returns:

    kind  base animation (frames)     returned as                          the frames, in order
    ----  --------------------------  -----------------------------------  ---------------------------------------------
    nat   onion (6)                   native RGBA arrays, square canvas    wobble loop (objects.wobble)
    nat   spray (6)                   native arrays                        shake loop, nozzle towards the left
    nat   jellyfish (8)               native arrays                        pulse loop (objects.jellyfish)
    nat   cat (12)                    native arrays                        0-7 sitting / walking loop; 8, 9 look up
                                                                           (turning, looking); 10, 11 look down; the
                                                                           behaviour holds 8-11 while it crouches and
                                                                           leaps (obstacles/catPaw.ts, behaviours.ts)
    nat   bird (8)                    native arrays                        0-7 flap loop; frame 4 is the dive pose
                                                                           (obstacles/bird.ts DIVE_FRAME)
    game  glue (6)                    PIL frames at game size, one canvas  0-3 shine sliding over it, 4-5 at rest
    game  bleach (4)                  game size                            the jug rocking at the back of the shelf
                                                                           (dimmed, spout at the left, no red glow)
    game  bleach-drop (4)             game size                            0-2 a bead swelling at the spout (no glow),
                                                                           3 the falling drop (the only lit frame)
    game  bleach-splash (3)           game size                            crown, full burst, the puddle it leaves
    game  lamp (2)                    game size, hangs from its top        0 off, 1 on (rays baked in)
    game  mop (4)                     game size                            0 raised, 1 raised mirrored, 2 sweeping,
                                                                           3 sweeping mirrored (frames 0, 1 windup,
                                                                           2 press / lift, 2, 3 sweep)
    game  vacuum (2)                  game size                            standing, a texel down: it shudders
    game  hen (2)                     game size                            0 standing, 1 rearing back before the peck
    game  hen-head (1)                game size                            the head alone, what darts down to peck
    game  frog (2)                    game size                            0 mouth shut, 1 mouth open, throat swollen
                                                                           (the tongue is drawn by the game)
    game  centipede (2)               game size                            0 as drawn, 1 its legs rippled
    game  boot (2)                    game size                            0 lifted (hazed, no glow), 1 stomped down
    game  gull (2)                    game size                            0 gliding, 1 diving
    game  wasp (3)                    game size                            0 hovering, 1 hovering a texel down, 2 dive
    game  bug-zapper (2)              game size, hangs from its top        0 idle, 1 discharging (a bolt)
    game  robot-vacuum (4)            game size                            0, 1 driving (shudder up / down), 2, 3 broken
                                                                           and smoking (shudder up / down; hit once)
    game  repeller (2)                game size                            0 idle, 1 lit up as a ring leaves it
    game  aerosol (3)                 game size                            0 standing, 1 rattling (tilted), 2 bursting
    game  spray-big (3)               game size                            the can shaking (0, tilt, tilt back)
    game  flipper-swat (9)            game size, one canvas, grips in one  0 far (dim, small, raised) 1 windback 2-4 swing
          newspaper-swat (9)          column, landed pose centred          5 impact 6 landed (flat on the ledge) 7-8 peel
                                                                           (swatters.py, behaviours.ts SWAT_FRAMES)

"nat" frames go through the bake's _resize (one whole factor per strip, sized by area), "game" frames are already at game
size and go straight to the padding / glow. Canvas conventions are the base's: game-size strips share one canvas per
animation with the object standing on the bottom edge (lamp, zapper and bleach-drop hang from the top), horizontally
centred, the pivot on the bottom edge. A skin is scaled so its subject has about the area of the base's and never
overshoots the base's canvas by more than 15 %, so its body sits where the base's does (same baseline, similar extent):
the game keeps the BASE enemy's hitbox (size and baseline from the base frame) whatever the skin's frame size, so the hurt
zone does not follow a bigger or smaller picture. The bake skips a skin whole unless every part of its base is here with
the base's exact frame count (cast.ts SKIN_PARTS: bleach + bleach-drop + bleach-splash, hen + hen-head, ...).

SKIN_RIGS holds only the skins in REVIEWED (stills in art/sprites/enemies/skins, strips looked at and fixed); ALL_RIGS has a
strip builder for every skin of the SKIN dict in enemies_render.py (per-skin arguments in OPTS), for skins named in preview.
Stills are named <skin>.png and <skin>-<pose>.png (poses: raised/flat for the swatters, on, sweep, open, dive, zap, broken,
explosion), SKINRIGS_STILLS overrides the folder (tests with stand-ins).

`python3 tools/art/skinrigs.py preview OUTDIR [skin ...]` writes contact sheets and GIFs without touching public/ (no names:
the reviewed skins). The bake's size rules are replicated there, not imported (bake.py is being restructured).
Run from the repo root (every rig module reads art/ by relative path).
"""
import math
import os
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hopact  # noqa: E402
import objects  # noqa: E402
import pixels  # noqa: E402
import swatters  # noqa: E402
from gunact import GUNACT  # noqa: E402
from hopact import HOPACT, _canvas, _pose  # noqa: E402
from pixels import down, native, up  # noqa: E402

STILLS = os.environ.get("SKINRIGS_STILLS", "art/sprites/enemies/skins")
WORK = 8

# Every skin and the animation of its base enemy that sizes it (the strips it provides are in SKIN_RIGS)
_BASES = {
    "onion": "lv2-fern lv4-toadstool lv5-bauble",
    "bleach": "lv2-pipe lv3-barrel lv4-resin-stub lv5-candle",
    "glue": "lv3-tomato lv4-resin",
    "flipper-swat": "lv3-flyswatter lv4-branch lv6-mug lv7-slide lv8-slipper lv9-bottle lv10-sign",
    "newspaper-swat": "lv4-frond lv6-vinyl lv7-windbreak lv8-scroll lv9-label lv10-pipe",
    "spray": "lv4-puffball lv5-snowcan lv6-extinguisher lv7-sunscreen lv8-thurible",
    "lamp": "lv4-flashlight lv5-treelight lv6-spotlight",
    "mop": "lv4-rake lv7-seaweed",
    "vacuum": "lv4-molehole lv6-speaker",
    "bird": "lv5-angel lv6-coaster",
    "hen": "lv5-goose lv7-cormorant lv8-spacehen",
    "cat": "lv6-dog lv7-crab lv8-alien lv9-lynx lv10-mutant",
    "frog": "lv5-carp lv6-blower lv7-octopus lv8-blob",
    "centipede": "lv7-shrimp",
    "boot": "lv7-sandals",
    "jellyfish": "lv8-satellite lv9-shotglass lv10-fridge",
    "bison": "lv10-trolley",
    "hedgehog": "lv10-wire",
    "gull": "lv8-meteor lv9-eagle lv10-vulture",
    "wasp": "lv8-ufo lv9-mosquito lv10-drone",
    "bug-zapper": "lv8-antenna lv9-tree",
    "robot-vacuum": "lv8-rover lv9-boar",
    "aerosol": "lv8-moonrock lv9-vodka",
    "repeller": "lv9-mushrooms",
}
SKIN_BASE = {skin: anim for anim, skins in _BASES.items() for skin in skins.split()}

# ── Stills ──────────────────────────────────────────────────────────────


def path(skin: str, pose: str = "") -> str:
    return f"{STILLS}/{skin}{'-' + pose if pose else ''}.png"


# Skins whose picture is dark enough to sink into the dark rooms and the red glow: lit up by this gain (outlines stay dark)
LIFT: dict[str, float] = {}
# Skins made of fine leaves, needles, mesh: their dark interior lines would all read as outline at game size and turn the
# object black. The interior's dark pixels are painted over with the colour round them (the silhouette keeps its outline)
SOFT: set[str] = set()
# Skins with a hole in the picture (a lantern's handle loop) where the render's white shows through: pure white goes
HOLLOW: set[str] = {"lv4-flashlight"}


def _soft(a: np.ndarray, dark: float = 80, reach: int = 2) -> np.ndarray:
    from scipy import ndimage as ni
    out = a.copy()
    solid = a[..., 3] > 0
    lum = a[..., :3].astype(float) @ np.array([.299, .587, .114])
    inside = ni.binary_erosion(solid, iterations=2)
    bad = inside & (lum < dark)
    good = (solid & ~bad).astype(float)
    k = 2 * reach + 1
    weight = ni.uniform_filter(good, k) + 1e-9
    for c in range(3):
        mean = ni.uniform_filter(a[..., c].astype(float) * good, k) / weight
        out[bad, c] = np.clip(mean[bad], 0, 255).astype(np.uint8)
    return out


def nat(skin: str, pose: str = "", flip: bool = False, flipv: bool = False) -> np.ndarray:
    """The picked still at its painted grid, trimmed; flip mirrors it left to right, flipv top to bottom."""
    a = native(path(skin, pose))
    if skin in HOLLOW:
        a = a.copy()
        a[a[..., :3].min(2) > 238, 3] = 0
    if skin in SOFT:
        a = _soft(a)
    if skin in LIFT:
        a = a.copy()
        lum = a[..., :3].astype(float) @ np.array([.299, .587, .114])
        lit = (a[..., 3] > 0) & (lum > 45)
        gain = np.array(LIFT[skin] if isinstance(LIFT[skin], tuple) else (LIFT[skin],) * 3, float)
        a[lit, :3] = np.clip(a[lit, :3].astype(float) * (1 + gain), 0, 255).astype(np.uint8)
    if flip:
        a = a[:, ::-1]
    if flipv:
        a = a[::-1]
    return np.ascontiguousarray(a)


def cell(skin: str, pose: str = "") -> float:
    """Render px per painted pixel of a still."""
    return pixels.grid(path(skin, pose))[0]


def _area(a: np.ndarray) -> int:
    return int((a[..., 3] > 0).sum())


# ── What the base looks like (to size a skin by) ────────────────────────

GAME_BASES = {**HOPACT, **GUNACT, **swatters.SWATTERS}
NATIVE_BASES = {**objects.OBJECTS, "cat": None, "bird": None, "bison": None}


@lru_cache(maxsize=None)
def base_frames(anim: str) -> list[np.ndarray]:
    """The base animation's own frames from its rig (native arrays or game-size ones)."""
    if anim in ("cat", "bird", "bison"):
        import creatures
        return creatures.CREATURES[anim]()
    if anim in GAME_BASES:
        return [np.asarray(f) for f in GAME_BASES[anim]()]
    return objects.OBJECTS[anim]()


@lru_cache(maxsize=None)
def base_size(anim: str) -> tuple[int, int, int]:
    """Width, height and subject area (px) of a game-size base's first frame."""
    f = base_frames(anim)[0]
    return f.shape[1], f.shape[0], _area(f)


def scale_for(a: np.ndarray, anim: str, grow: float = 1.0) -> float:
    """Game px per painted pixel that gives the subject the base's area, capped to 15 % over its canvas."""
    w, h, area = base_size(anim)
    s = math.sqrt(area * grow ** 2 / _area(a))
    return min(s, 1.15 * w * grow / a.shape[1], 1.15 * h * grow / a.shape[0])


class Fit:
    """Poses of one skin at one scale: the primary still is sized to the base, the other stills of the strip share its
    render px per game px (they are different renders, on their own grids), `extra` nudges one of them."""

    def __init__(self, skin: str, anim: str, pose: str = "", flip: bool = False, grow: float = 1.0, size: float | None = None):
        self.skin, self.flip = skin, flip
        a = nat(skin, pose, flip)
        s = size if size is not None else scale_for(a, anim, grow)
        self.rpg = cell(skin, pose) / s

    def __call__(self, pose: str = "", extra: float = 1.0, flip: bool | None = None, **how) -> np.ndarray:
        flip = self.flip if flip is None else flip
        a = nat(self.skin, pose, flip)
        return _pose(a, cell(self.skin, pose) / self.rpg * extra, **how)


# ── Colour helpers ──────────────────────────────────────────────────────


def tint(a: np.ndarray, dark, mid, light) -> np.ndarray:
    """Recoloured by luminance: the darkest pixels go to `dark`, the middle to `mid`, the brightest to `light`."""
    out = a.copy()
    solid = out[..., 3] > 0
    lum = (out[..., :3].astype(float) @ np.array([.299, .587, .114])) / 255
    lo, hi = lum[solid].min(), lum[solid].max()
    t = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1)
    ramp = np.array([dark, mid, light], float)
    low = t < .5
    col = np.where(low[..., None], ramp[0] + (ramp[1] - ramp[0]) * (t * 2)[..., None],
                   ramp[1] + (ramp[2] - ramp[1]) * ((t - .5) * 2)[..., None])
    out[solid, :3] = col[solid].astype(np.uint8)
    return out


def shifted(a: np.ndarray, dy: int) -> np.ndarray:
    out = np.zeros((a.shape[0] + abs(dy), a.shape[1], 4), np.uint8)
    out[max(0, dy):max(0, dy) + a.shape[0]] = a
    return out


def brighter(a: np.ndarray, amount: float) -> np.ndarray:
    out = a.astype(float)
    out[..., :3] += (255 - out[..., :3]) * amount
    return out.astype(np.uint8)


# ── Native-size strips (the bake sizes them) ────────────────────────────


def _blown(a: np.ndarray) -> np.ndarray:
    """objects._load for an array: the still on a square canvas, blown up for the warps (objects._native_frames reads back)."""
    h, w = a.shape[:2]
    side = int(max(h, w) * 1.24)
    canvas = np.zeros((side, side, 4), np.uint8)
    top = side - h - int(side * .05)
    canvas[top:top + h, (side - w) // 2:(side - w) // 2 + w] = a
    big = up(canvas, max(1, math.ceil(objects.WORK / side)))
    objects._UP[id(big)] = max(1, math.ceil(objects.WORK / side))
    return big


@lru_cache(maxsize=None)
def _baked_area(anim: str) -> int:
    """Solid texels of the base animation's first frame after the bake's own size rules."""
    return _area(np.asarray(_resize(base_frames(anim), anim)[0]))


def sized(skin: str, anim: str, pose: str = "", flip: bool = False, grow: float = 1.0) -> np.ndarray:
    """A still for a strip the bake sizes by area: pre-scaled so that, after the bake's whole-factor reduction, it has the
    base's baked area (the bake can only halve and third; a finer-grained skin would come out twice the base)."""
    a = nat(skin, pose, flip)
    s = math.sqrt(_baked_area(anim) * grow ** 2 / _area(a))
    return _pose(a, s) if abs(s - 1) > .05 else a


def _frames(source: np.ndarray, fields) -> list[np.ndarray]:
    big = _blown(source)
    return objects._native_frames(big, [objects._warp(big, f) for f in fields])


def onion(skin: str, flip: bool = False, angle: float = .09) -> list[np.ndarray]:
    return _frames(sized(skin, "onion", flip=flip), [objects._rock(angle * math.sin(i / 6 * math.tau)) for i in range(6)])


def spray(skin: str, flip: bool = False) -> list[np.ndarray]:
    """The nozzle (or what puffs) towards the left, the runner: `flip` mirrors a render that came out facing right."""
    return _frames(sized(skin, "spray", flip=flip), [objects._rock(a) for a in (0, .05, -.05, .03, -.03, 0)])


def jellyfish(skin: str) -> list[np.ndarray]:
    source = sized(skin, "jellyfish")
    fields = []
    for i in range(8):
        t = i / 8

        def field(u, v, t=t):
            pulse = .09 * math.sin(t * math.tau)
            bell = 1 - objects._smooth(v, .1, .55)
            return ((u - .5) * pulse * bell * 1.5 + .035 * np.sin((t + v * 1.4) * math.tau) * objects._smooth(v, .45, .95),
                    -(v - .2) * pulse * .6 - .02 * math.sin(t * math.tau))
        fields.append(field)
    return _frames(source, fields)


def _cat_warp(skin: str, flip: bool = False, up_deg: float = 10, down_deg: float = 12) -> list[np.ndarray]:
    """0-7: sitting, breathing, a little weight shifting; 8, 9: looking up (turning, then looking: the nose rises, the front
    lifts); 10, 11: looking down (the front sinks into a crouch). The animal faces left; `flip` mirrors one drawn facing right."""
    source = sized(skin, "cat", flip=flip)
    fields = []
    for i in range(8):
        t = i / 8
        fields.append(objects._rock(.012 * math.sin(t * math.tau), bob=.008 * math.sin((t + .25) * math.tau)))
    # A positive angle of objects._rock turns the top towards the left: leaning forward, for a left-facing animal
    for angle, squash in [(-up_deg * .5, -.015), (-up_deg, -.03), (down_deg * .5, .04), (down_deg, .08)]:
        def field(u, v, angle=angle, squash=squash):
            fu, fv = objects._rock(math.radians(angle))(u, v)
            sq = objects._squash(squash)(u, v)
            return fu + sq[0], fv + sq[1]
        fields.append(field)
    return _frames(source, fields)


def _grow(a: np.ndarray, box: tuple, dx: int, dy: int) -> np.ndarray:
    """A part of the picture (box: fractions x0, y0, x1, y1) also drawn dx, dy texels off its place: a tail, a claw, an ear
    twitching. The union of both, so nothing opens a hole in the body."""
    h, w = a.shape[:2]
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    out = a.copy()
    piece = a[y0:y1, x0:x1]
    ys, xs = np.nonzero(piece[..., 3])
    ty, tx = ys + y0 + dy, xs + x0 + dx
    ok = (ty >= 0) & (ty < h) & (tx >= 0) & (tx < w)
    free = out[ty[ok], tx[ok], 3] == 0
    out[ty[ok][free], tx[ok][free]] = piece[ys[ok][free], xs[ok][free]]
    return out


def _breathe(a: np.ndarray, at: float = .55) -> np.ndarray:
    """One texel shorter: a row left out at `at` of its height, so the chest rises and falls."""
    cut = int(a.shape[0] * at)
    return np.concatenate([a[:cut], a[cut + 1:]])


def _stand(poses: list[np.ndarray]) -> list[np.ndarray]:
    """Native poses on one canvas, standing on its bottom edge, centred."""
    return [np.asarray(f) for f in _canvas(poses)]


def cat(skin: str, flip: bool = False, tail: tuple | None = (.72, 0, 1, .7), part: tuple | None = None, tilt_up: float = 9,
        tilt_down: float = 11, pounce_extra: float = 1.0, grow: float = 1.0) -> list[np.ndarray]:
    """0-7: idle (breathing, `tail` and `part` boxes twitching a texel); 8 and 10: the wind-up crouch, the head turned up or
    down; 9 and 11: the pounce, stretched out in the air, aimed up or down (obstacles/catPaw.ts holds 9 / 11 through the
    leap). Stills: <skin>.png, -crouch, -pounce, each facing left (`flip` mirrors them)."""
    if not os.path.exists(path(skin, "crouch")) or not os.path.exists(path(skin, "pounce")):
        return _cat_warp(skin, flip)
    idle0 = nat(skin, "", flip)
    s = grow * math.sqrt(_baked_area("cat") / _area(idle0))
    rpg = cell(skin) / s

    def still(pose: str, extra: float = 1.0) -> np.ndarray:
        return _pose(nat(skin, pose, flip), cell(skin, pose) / rpg * extra)

    idle = still("")
    iw, ih = idle.shape[1], idle.shape[0]

    def fitted(pose: str, extra: float) -> np.ndarray:
        """A crouch or pounce as big on screen as the idle: its width the idle's, its height at most 1.1 times the idle's."""
        raw = nat(skin, pose, flip)
        k = min(iw / raw.shape[1], 1.1 * ih / raw.shape[0]) * extra
        return _pose(raw, k)

    crouch, pounce = fitted("crouch", 1.0), fitted("pounce", pounce_extra)
    frames = []
    breath = [0, 0, 1, 1, 1, 0, 0, 0]
    wag = [0, -1, -2, -1, 0, 1, 2, 1]
    for i in range(8):
        f = _breathe(idle) if breath[i] else idle
        if tail:
            f = _grow(f, tail, 0, wag[i])
        if part:
            f = _grow(f, part, wag[(i + 3) % 8] // 2, wag[(i + 3) % 8])
        frames.append(f)
    frames += [_pose(crouch, tilt=tilt_up), _pose(pounce, tilt=tilt_up), _pose(crouch, tilt=-tilt_down), _pose(pounce, tilt=-tilt_down)]
    return _stand(frames)


def trolley(skin: str, flip: bool = False, lean: float = .05, wheels: tuple | None = (0, .78, 1, 1)) -> list[np.ndarray]:
    """The bison's 8-frame gallop (played faster pawing and charging, slower walking back), as a trolley: a hop on the
    gallop's beat, leaning into the charge, the basket rattling and the wheels flickering a texel."""
    source = sized(skin, "bison", flip=flip)
    frames = _frames(source, [
        objects._rock(lean + .018 * math.sin(i / 8 * math.tau * 2), bob=.02 * abs(math.sin(i / 8 * math.tau * 2 + .4)) - .01)
        for i in range(8)])
    if wheels:
        frames = [_grow(f, wheels, (1, -1)[i % 2], 0) for i, f in enumerate(frames)]
    return frames


def wire(skin: str) -> list:
    """The hedgehog's two frames: 0 the ball rolling along, 1 the charge (the same ball spinning fast, sparks off the ground)."""
    f = Fit(skin, "hedgehog")
    ball = f()
    if os.path.exists(path(skin, "charge")):
        return _canvas([ball, f("charge")])
    return _canvas([ball, _pose(ball, tilt=30)])


def _scale_canvas(a: np.ndarray, s: float) -> np.ndarray:
    """A frame scaled by s on the 8x grid (nearest) and read back 8x: it stays on the texel grid."""
    big = Image.fromarray(np.ascontiguousarray(up(a, WORK)))
    big = big.resize((max(WORK, round(big.width * s)), max(WORK, round(big.height * s))), Image.NEAREST)
    pad_w, pad_h = -big.width % WORK, -big.height % WORK
    if pad_w or pad_h:
        grown = Image.new("RGBA", (big.width + pad_w, big.height + pad_h))
        grown.paste(big, (0, 0))
        big = grown
    return down(np.asarray(big), WORK)


def fit_frames(frames: list[np.ndarray], anim: str) -> list[np.ndarray]:
    """Frames made at the source's own size, cropped to one box and scaled together to the base's baked area."""
    ys, xs = zip(*[np.nonzero(f[..., 3]) for f in frames])
    box = (min(x.min() for x in xs), min(y.min() for y in ys), max(x.max() for x in xs) + 1, max(y.max() for y in ys) + 1)
    crops = [f[box[1]:box[3], box[0]:box[2]] for f in frames]
    s = math.sqrt(_baked_area(anim) / _area(crops[0]))
    return [_scale_canvas(c, s) for c in crops] if abs(s - 1) > .05 else crops


DOWNSTROKE = [0, 20, 54, 84, 98, 86, 52, 16]  # the base bird's wing angles: snaps down, recovers slower; frame 4 is the dive pose


def bird(skin: str, wings: list | None = None, dive: float = 22, thin: float = .45, far_sign: int = 1, swing: float = 1.0) -> list[np.ndarray]:
    """8 frames of flapping, frame 4 the dive pose. With `wings` (rig.Part list, polygons in percent of the render) the wings
    turn on the lattice like the pigeon's; without (a disc, a rock) the whole body beats: squashed thin on the downstroke and
    pitched nose down in frame 4."""
    if wings:
        import rig
        canvas, u, x0, y0 = pixels.lattice(path(skin))
        r = rig.Rig(canvas, wings)
        frames = []
        for angle in DOWNSTROKE:
            frames.append(pixels.read(r.pose({p.name: swing * angle * (.86 * far_sign if p.layer < 0 else 1) for p in wings},
                                             {"body": (0, (angle - 56) / 56 * 2.2)}), u, x0, y0))
        return fit_frames(frames, "bird")
    source = sized(skin, "bird")
    fields = []
    for i, angle in enumerate(DOWNSTROKE):
        beat = (angle - 56) / 56
        pitch = math.radians(dive) if i == 4 else 0

        def field(u, v, beat=beat, pitch=pitch):
            fu, fv = objects._rock(pitch)(u, v)
            su, sv = objects._squash(-thin * max(0, beat) * .5 + .12 * max(0, -beat))(u, v)
            return fu + su, fv + sv
        fields.append(field)
    return _frames(source, fields)


def boot(skin: str, front_poly: list, flip: bool = False) -> list:
    """The render has two feet: one stepping down in front, one lifted behind. `front_poly` (percent of the still) takes the
    front one; the rest is the lifted one, hazed towards the room like the base's (hopact.BOOT_HAZE)."""
    import cv2
    pair = Fit(skin, "boot", flip=flip, grow=1.41)()
    h, w = pair.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [np.int32([(x * w / 100, y * h / 100) for x, y in front_poly])], 1)
    front, back = pair.copy(), pair.copy()
    front[mask == 0, 3] = 0
    back[mask > 0, 3] = 0
    front, back = hopact._largest(front), hopact._largest(back)
    hazed = back.astype(float)
    hazed[..., :3] = hazed[..., :3] * (1 - hopact.BOOT_HAZE) + hopact.HAZE * hopact.BOOT_HAZE
    return _canvas([hazed.astype(np.uint8), front])


# ── Game-size strips (already at the size they are drawn at) ────────────


def _mirror(a: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(a[:, ::-1])


def glue(skin: str, flies: bool = False) -> list:
    """A shine sliding across it (frames 0-3), then at rest (4, 5); flies stuck in it where the glue is a trap."""
    tray = Fit(skin, "glue")()
    frames = []
    for i in range(6):
        g = hopact._glint(tray, -.2 + i * .35) if i < 4 else tray.copy()
        if flies:
            h, w = g.shape[:2]
            hopact._stamp(g, hopact.GNAT, int(w * .3), int(h * .3))
            hopact._stamp(g, hopact.GNAT, int(w * .6), int(h * .5))
        frames.append(g)
    return _canvas(frames)


def bleach(skin: str, flip: bool = False, tilt: float = 0, rock: float = 2) -> list:
    """The container tipped with its spout down at the left, rocking a little as it drips, dimmed into the room."""
    f = Fit(skin, "bleach", flip=flip)
    return _canvas([hopact._backdrop(f(tilt=tilt + r), .45) for r in (0, -rock, 0, rock)])


def _drop_of(a: np.ndarray, liquid) -> np.ndarray:
    """The base's drop or splash in the skin's liquid: dark outline, the liquid, a pale shine."""
    liquid = np.array(liquid, float)
    return tint(a, tuple(liquid * .22), tuple(liquid * .9), tuple(liquid + (255 - liquid) * .75))


def bleach_drop(liquid) -> list:
    """The bleach's bead swelling at the spout (three sizes) and the falling drop, in the liquid's colour."""
    drop = _drop_of(hopact._still("bleach-drop", 1), liquid)
    frames = _canvas([_pose(drop, s) for s in (.6, 1, 1.4)] + [_pose(drop, 1.6)], anchor="top")
    return [hopact._about_foot(f, hopact.BEAD_SIZE) for f in frames[:3]] + frames[3:]


def bleach_splash(liquid) -> list:
    splash = _drop_of(_pose(hopact._still("bleach-splash", 1), .85), liquid)
    return _canvas([_pose(splash, .7), splash, _pose(splash, 1.05, squash=.35)])


def lamp(skin: str, on_extra: float = 1.0, off_extra: float = 1.0) -> list:
    """Off and on, hanging by its cord. The dark one has the base's area; the lit one (rays included) shares its scale unless
    that would overgrow the base's canvas, then both shrink together."""
    off_a, on_a = nat(skin), nat(skin, "on")
    w, h, _ = base_size("lamp")
    rpg_off = cell(skin) / scale_for(off_a, "lamp")
    rpg_on = cell(skin, "on") / min(w / on_a.shape[1], h / on_a.shape[0])
    rpg = max(rpg_off, rpg_on)
    f = Fit(skin, "lamp", size=cell(skin) / rpg * on_extra)
    return _canvas([f("", extra=off_extra), f("on")], anchor="top")


def mop(skin: str, flip: bool = False) -> list:
    f = Fit(skin, "mop", flip=flip)
    raised, sweep = f(), f("sweep")
    return _canvas([raised, _mirror(raised), sweep, _mirror(sweep)])


def vacuum(skin: str, flip: bool = False, grow: float = 1.0, pulse: bool = False) -> list:
    """Standing, then a texel down: it shudders. `pulse` also lights its bright-coloured parts (a speaker's cone ring) on the
    second frame, so the two frames differ visibly."""
    v = Fit(skin, "vacuum", flip=flip, grow=grow)()
    second = v
    if pulse:
        second = v.copy()
        px = second[..., :3].astype(int)
        ring = (second[..., 3] > 0) & (px[..., 1] > px[..., 0] + 40)
        second[ring, :3] = np.minimum(255, second[ring, :3].astype(int) * 1.0 + 110).astype(np.uint8)
    return _canvas([shifted(v, -1), shifted(second, 1)])


def hen(skin: str, flip: bool = False, rear: float = 10) -> list:
    h = Fit(skin, "hen", flip=flip)()
    return _canvas([h, _pose(h, tilt=rear)])


def hen_head(skin: str, box: tuple, flip: bool = False) -> list:
    """The head cut from the standing figure: box = (x0, y0, x1, y1) as fractions of it."""
    h = Fit(skin, "hen", flip=flip)()
    H, W = h.shape[:2]
    head = h[int(H * box[1]):int(H * box[3]), int(W * box[0]):int(W * box[2])].copy()
    ys, xs = np.nonzero(head[..., 3])
    return _canvas([head[ys.min():ys.max() + 1, xs.min():xs.max() + 1]])


def frog(skin: str, flip: bool = False, open_extra: float = 1.0) -> list:
    f = Fit(skin, "frog", flip=flip)
    return _canvas([f(), f("open", extra=open_extra)])


def centipede(skin: str, flip: bool = False, ripple: str = "flip") -> list:
    c = Fit(skin, "centipede", flip=flip)()
    if ripple == "flip":
        second = np.ascontiguousarray(c[::-1])
    else:  # the legs (the lower part) slid a texel: a side view's ripple
        second = c.copy()
        h = c.shape[0]
        cut = int(h * .55)
        second[cut:] = np.roll(c[cut:], 1, axis=1)
    return _canvas([c, second])


def gull(skin: str, flip: bool = False) -> list:
    f = Fit(skin, "gull", flip=flip)
    return _canvas([f(), f("dive")])


def wasp(skin: str, flip: bool = False, dive_tilt: float = 0, grow: float = 1.0) -> list:
    f = Fit(skin, "wasp", flip=flip, grow=grow)
    hover = f()
    dive = f("dive", tilt=dive_tilt) if dive_tilt else f("dive")
    return _canvas([hover, shifted(hover, -1), dive])


def bug_zapper(skin: str) -> list:
    f = Fit(skin, "bug-zapper")
    return _canvas([f(), f("zap")], anchor="top")


def repeller(skin: str) -> list:
    r = Fit(skin, "repeller")()
    return _canvas([r, brighter(r, .35)])


def robot_vacuum(skin: str, flip: bool = False) -> list:
    f = Fit(skin, "robot-vacuum", flip=flip)
    whole, broken = f(), f("broken")
    return _canvas([shifted(whole, 1), shifted(whole, -1), shifted(broken, 1), shifted(broken, -1)])


def aerosol(skin: str, flip: bool = False, grow: float = 1.0) -> list:
    f = Fit(skin, "aerosol", flip=flip, grow=grow)
    can = f()
    return _canvas([can, _pose(can, tilt=6), f("explosion")])


def spray_big(skin: str, flip: bool = False) -> list:
    can = Fit(skin, "spray-big", flip=flip)()
    return _canvas([_pose(can, tilt=t) if t else can for t in (0, 3, -3)])


# The swatters: the base's own nine-pose machinery (swatters._swing_strip) fed with the skin's raised and flat stills
def _far_end(a: np.ndarray, head: str) -> tuple[tuple[float, float], float]:
    """Direction (x right, y down) from the grip to the far end of a raised still, and that direction's heading in degrees
    counterclockwise from the right. `head` says which end is the striking one: top, bottom, left or right."""
    ys, xs = np.nonzero(a[..., 3])
    pts = np.stack([xs, ys], 1).astype(float)
    c = pts.mean(0)
    w, v = np.linalg.eigh(np.cov((pts - c).T))
    axis = v[:, 1]
    proj = (pts - c) @ axis
    ends = pts[proj.argmax()], pts[proj.argmin()]
    key = {"top": lambda e: -e[1], "bottom": lambda e: e[1], "left": lambda e: -e[0], "right": lambda e: e[0]}[head]
    far, grip = max(ends, key=key), min(ends, key=key)
    d = (far - grip) / np.linalg.norm(far - grip)
    return (float(d[0]), float(d[1])), math.degrees(math.atan2(-d[1], d[0]))


def swat(skin: str, anim: str, head: str = "top", raised_flip: bool = False, raised_flipv: bool = False,
         flat_flip: bool = False, flat_flipv: bool = False, rest: int = 70, mids: str = "held",
         raised_extra: float = 1.0, flat_extra: float = 1.0, far: tuple | None = None, flat_squash: float = 1.0, flat_h: float = 1.6, pole: float = 0) -> list:
    """The nine poses of a swatter: raised render (far end `head` of the picture) swung about its grip and brought down to
    the flat render (far end at the left: `flat_flip` mirrors it). Sizes follow the base's raised and flat stills."""
    base_raised = swatters._still("slipper-swat-far-nohand" if anim == "flipper-swat" else "newspaper-swat-far-nohand", 1)
    base_flat = swatters._still("slipper-flat" if anim == "flipper-swat" else "newspaper-flat", 2)
    raised = nat(skin, "raised", raised_flip, raised_flipv)
    if pole:  # a sign's pole drawn longer: the stub's last row repeated down, `pole` times the picture's width
        rows = max(1, round(raised.shape[1] * pole))
        raised = np.concatenate([raised, np.repeat(raised[-2:-1], rows, axis=0)])
    flat = nat(skin, "flat", flat_flip, flat_flipv)
    r_scale = raised_extra * math.sqrt(_area(base_raised) / _area(raised))
    f_scale = flat_extra * min(1.12 * base_flat.shape[1] / flat.shape[1], flat_h * base_flat.shape[0] / flat.shape[0])
    raised, flat = _pose(raised, r_scale), _pose(flat, f_scale, squash=flat_squash)
    if flat.shape[0] < base_flat.shape[0]:  # a flat pose is low, but never lower than the base's own flat frame
        flat = _pose(flat, squash=base_flat.shape[0] / flat.shape[0])
    if mids == "held":
        mid_fn = lambda held, lying: (held(.72, 105), held(.9, 150))  # noqa: E731
    else:
        mid_fn = lambda held, lying: (lying(105, scale=.78), lying(145, scale=.92))  # noqa: E731
    end = _far_end(raised, head)
    if far:  # an object with no long axis (a mug): its far end's direction (x right, y down) by hand
        n = math.hypot(*far)
        end = ((far[0] / n, far[1] / n), math.degrees(math.atan2(-far[1], far[0])))
    frames = swatters._swing_strip(raised, end, flat, rest, mid_fn)
    return [Image.fromarray(f) for f in frames]


# ── Registry ────────────────────────────────────────────────────────────

# The liquid the bleach's drop and splash are recoloured to, per bleach skin
LIQUID = {"lv2-pipe": (150, 200, 235), "lv3-barrel": (140, 214, 96), "lv4-resin-stub": (232, 160, 40), "lv5-candle": (214, 40, 52)}

# Per skin and animation, the arguments its strip needs (which way the render faces, where the head is, ...): tuned by
# looking at the preview. Missing = the builder's defaults
from rig import Part  # noqa: E402

LIFT.update({"lv4-branch": .3, "lv4-frond": .15, "lv7-crab": (.12, .28, .02)})
SOFT.update({"lv4-branch", "lv4-frond", "lv6-mug"})

OPTS: dict[str, dict[str, dict]] = {
    "lv3-flyswatter": {"flipper-swat": {"head": "top", "flat_h": 2.6, "flat_extra": .9, "raised_extra": .75}},
    "lv4-branch": {"flipper-swat": {"head": "top"}},
    "lv4-frond": {"newspaper-swat": {"head": "top", "flat_flip": True}},
    # Wider when it lands: flat, the base's footprint (35 frame px) must be covered by the mug, not by air beside it
    "lv6-mug": {"flipper-swat": {"head": "right", "far": (1, -.5), "flat_extra": 1.35, "flat_squash": .8}},
    "lv6-vinyl": {"newspaper-swat": {"head": "right", "flat_flip": True}},
    "lv3-barrel": {"bleach": {"tilt": -28}},
    "lv10-drone": {"wasp": {"dive_tilt": -25, "grow": 1.1}},
    "lv10-sign": {"flipper-swat": {"head": "top", "far": (.15, -1), "flat_h": 3.2, "raised_extra": .9, "pole": .9}},
    "lv10-pipe": {"newspaper-swat": {"head": "top", "flat_flip": True, "raised_extra": .7, "flat_extra": .9, "flat_squash": 1.8}},
    "lv6-speaker": {"vacuum": {"grow": 1.15, "pulse": True}},
    "lv7-crab": {"cat": {"tail": None, "part": (0, .2, .4, .95), "pounce_extra": 1.0, "grow": .9}},
    "lv8-alien": {"cat": {"pounce_extra": 1.0, "tail": None, "grow": 1.0}},
    "lv6-dog": {"cat": {"pounce_extra": 1.0, "grow": 1.0}},
    "lv10-mutant": {"cat": {"grow": .9, "tail": (.72, 0, 1, .7)}},
    "lv9-lynx": {"cat": {"pounce_extra": 1.0, "grow": .9, "tail": (.8, .1, 1, .6)}},
    "lv4-resin": {"glue": {"flies": True}},
    "lv5-goose": {"hen-head": {"box": (0, 0, .4, .2)}},
    "lv7-shrimp": {"centipede": {"ripple": "shift"}},
    "lv7-sandals": {"boot": {"front_poly": [(36, 48), (52, 44), (58, 28), (100, 28), (100, 100), (36, 100)]}},
    "lv8-spacehen": {"hen-head": {"box": (0, 0, .6, .42)}},
    "lv8-moonrock": {"aerosol": {"grow": 1.55}},
    "lv7-cormorant": {"hen-head": {"box": (0, 0, .5, .25)}},
    "lv5-angel": {"bird": {"far_sign": -1, "swing": .8, "wings": [
        Part("far_wing", [(20, 13), (34, 15), (38, 36), (34, 47), (24, 44), (20, 28)], (34, 43), layer=-1),
        Part("wing", [(57, 40), (59, 27), (72, 24), (86, 14), (87, 34), (78, 48), (66, 52), (57, 51)], (58, 46))]}},
    "lv5-candle": {"bleach": {"tilt": -10}},
    "lv4-resin-stub": {"bleach": {"tilt": -20}},
    "lv7-slide": {"flipper-swat": {"head": "top"}},
    "lv8-slipper": {"flipper-swat": {"head": "top", "raised_flip": True, "raised_flipv": True}},
    "lv8-scroll": {"newspaper-swat": {"head": "top"}},
    "lv9-bottle": {"flipper-swat": {"head": "top", "raised_flip": True, "raised_flipv": True, "flat_flip": True}},
    "lv9-label": {"newspaper-swat": {"head": "top"}},
    "lv7-windbreak": {"newspaper-swat": {"head": "top"}},
}

_BUILDERS = {
    "onion": [("onion", onion)],
    "bleach": [("bleach", bleach), ("bleach-drop", lambda skin, **kw: bleach_drop(LIQUID[skin])),
               ("bleach-splash", lambda skin, **kw: bleach_splash(LIQUID[skin]))],
    "glue": [("glue", glue)],
    "flipper-swat": [("flipper-swat", lambda skin, **kw: swat(skin, "flipper-swat", **kw))],
    "newspaper-swat": [("newspaper-swat", lambda skin, **kw: swat(skin, "newspaper-swat", **kw))],
    "spray": [("spray", spray), ("spray-big", spray_big)],
    "lamp": [("lamp", lamp)],
    "mop": [("mop", mop)],
    "vacuum": [("vacuum", vacuum)],
    "bird": [("bird", bird)],
    "hen": [("hen", hen), ("hen-head", lambda skin, **kw: hen_head(skin, kw.pop("box", (0, 0, .45, .3)), **kw))],
    "cat": [("cat", cat)],
    "frog": [("frog", frog)],
    "centipede": [("centipede", centipede)],
    "boot": [("boot", boot)],
    "jellyfish": [("jellyfish", jellyfish)],
    "gull": [("gull", gull)],
    "wasp": [("wasp", wasp)],
    "bug-zapper": [("bug-zapper", bug_zapper)],
    "robot-vacuum": [("robot-vacuum", robot_vacuum)],
    "aerosol": [("aerosol", aerosol)],
    "repeller": [("repeller", repeller)],
    "bison": [("bison", lambda skin, **kw: trolley(skin, **kw))],
    "hedgehog": [("hedgehog", lambda skin, **kw: wire(skin, **kw))],
}

# SKIN_RIGS: "<skin>/<anim>" -> function returning the strip. Only skins whose stills are in place and whose strips were
# looked at and fixed are here (REVIEWED); the others can still be previewed by name
REVIEWED: set[str] = {"lv2-fern", "lv3-flyswatter", "lv4-branch", "lv4-frond", "lv6-mug", "lv6-vinyl", "lv7-slide", "lv7-windbreak", "lv8-slipper", "lv8-scroll", "lv9-bottle", "lv9-label", "lv2-pipe", "lv3-tomato", "lv3-barrel", "lv4-toadstool", "lv4-resin", "lv4-resin-stub", "lv4-puffball", "lv4-flashlight", "lv4-molehole", "lv5-bauble", "lv5-candle", "lv5-snowcan", "lv4-rake", "lv5-angel", "lv5-goose", "lv5-treelight", "lv5-carp", "lv6-extinguisher", "lv6-coaster", "lv6-dog", "lv6-blower", "lv6-spotlight", "lv6-speaker", "lv7-sunscreen", "lv7-cormorant", "lv7-crab", "lv7-octopus", "lv7-shrimp", "lv7-sandals", "lv7-seaweed", "lv8-thurible", "lv8-spacehen", "lv8-alien", "lv8-blob", "lv8-moonrock", "lv8-satellite", "lv8-meteor", "lv8-ufo", "lv8-antenna", "lv8-rover", "lv9-lynx", "lv9-vodka", "lv9-shotglass", "lv9-eagle", "lv9-mosquito", "lv9-tree", "lv9-mushrooms", "lv9-boar", "lv10-sign", "lv10-pipe", "lv10-mutant", "lv10-fridge", "lv10-vulture", "lv10-drone", "lv10-trolley", "lv10-wire"}
SKIN_RIGS: dict = {}
ALL_RIGS: dict = {}


def _register(skin: str, anim: str, builder) -> None:
    def make(skin=skin, anim=anim, builder=builder):
        return builder(skin, **dict(OPTS.get(skin, {}).get(anim, {})))
    ALL_RIGS[f"{skin}/{anim}"] = make
    if skin in REVIEWED:
        SKIN_RIGS[f"{skin}/{anim}"] = make


for _skin, _base in SKIN_BASE.items():
    for _anim, _builder in _BUILDERS[_base]:
        _register(_skin, _anim, _builder)


# ── Preview ─────────────────────────────────────────────────────────────

# What bake.py does after a rig (replicated, bake.py is not imported: it is being restructured and its module is heavy)
AREA, MAX_SIZE, FACTOR, PAD = 620, (48, 40), {"cat": 1.3, "bison": 1.25, "blackhole": 1.3}, 8
GLOW_RADIUS, GLOW_ALPHA, RED = 3.5, .8, (255, 40, 50)
UNLIT = {"bleach", "spray-big"}
PARTLY_LIT = {"bleach-drop": {3}, "boot": {1}}
FPS = {"onion": 6, "spray": 14, "jellyfish": 10, "cat": 10, "bird": 14, "glue": 8, "bleach": 4, "spray-big": 10}
BACKGROUND = (20, 19, 34)


def _drop_specks(frame: np.ndarray) -> np.ndarray:
    from scipy import ndimage as ni
    labels, count = ni.label(frame[..., 3] > 128)
    if count < 2:
        return frame
    sizes = ni.sum(np.ones_like(labels), labels, range(1, count + 1))
    out = frame.copy()
    out[np.isin(labels, np.nonzero(sizes < sizes.max() * .02)[0] + 1), 3] = 0
    return out


def _resize(frames: list[np.ndarray], name: str) -> list[Image.Image]:
    images = [_drop_specks(f) for f in frames]
    boxes = [Image.fromarray(i).getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox() for i in images]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    first = images[0][boxes[0][1]:boxes[0][3], boxes[0][0]:boxes[0][2]]
    area = (first[..., 3] > 128).sum()
    factor = FACTOR.get(name, 1)
    scale = min((AREA * factor / area) ** .5, MAX_SIZE[0] * factor / first.shape[1], MAX_SIZE[1] * factor / first.shape[0])
    n = min(range(1, 13), key=lambda k: abs(np.log(scale * k)))
    crops = [i[box[1]:box[3], box[0]:box[2]] for i in images]
    small = [pixels.down(c, n) for c in crops]
    palette = pixels.palette_of(small, 160)
    return [Image.fromarray(pixels.snap(f, palette)) for f in small]


def _padded(frame: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (frame.width + PAD * 2, frame.height + PAD * 2))
    canvas.alpha_composite(frame, (PAD, PAD))
    return canvas


def _with_glow(frame: Image.Image, colour=RED) -> Image.Image:
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


def baked(frames: list, anim: str) -> list[Image.Image]:
    """The frames of an animation as the bake leaves them (size rules of the base animation `anim`, padding, glow)."""
    if anim in NATIVE_BASES or anim in ("cat", "bird", "bison"):
        return [_with_glow(f) for f in _resize([np.asarray(f) for f in frames], anim)]
    lit = PARTLY_LIT.get(anim)
    return [_padded(Image.fromarray(np.asarray(f))) if anim in UNLIT or (lit is not None and i not in lit)
            else _with_glow(Image.fromarray(np.asarray(f))) for i, f in enumerate(frames)]


def _row(frames: list[Image.Image], scale: int, gap: int = 2) -> Image.Image:
    w = sum(f.width * scale + gap for f in frames)
    h = max(f.height for f in frames) * scale
    row = Image.new("RGB", (w, h), BACKGROUND)
    x = 0
    for f in frames:
        big = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
        row.paste(big, (x, h - big.height), big)  # standing on the baseline
        x += big.width + gap
    return row


def _sheet(rigs: dict, skin: str, anims: list[str], scale: int) -> Image.Image:
    rows = []
    for anim in anims:
        base = baked(base_frames(anim), anim)
        mine = baked(rigs[f"{skin}/{anim}"](), anim)
        rows.append((f"{skin}  /  {anim}   base {base[0].size}  skin {mine[0].size}", _row(base, scale), _row(mine, scale)))
    width = max(max(r[1].width, r[2].width) for r in rows) + 8
    height = sum(r[1].height + r[2].height + 34 for r in rows) + 8
    sheet = Image.new("RGB", (width, height), BACKGROUND)
    d = ImageDraw.Draw(sheet)
    y = 4
    for label, base, mine in rows:
        d.text((4, y), label, fill=(200, 200, 210))
        sheet.paste(base, (4, y + 14))
        y += base.height + 16
        sheet.paste(mine, (4, y + 2))
        y += mine.height + 18
    return sheet


def _gif(rigs: dict, skin: str, anim: str, target: Path, scale: int = 4) -> None:
    base = baked(base_frames(anim), anim)
    mine = baked(rigs[f"{skin}/{anim}"](), anim)
    fps = FPS.get(anim, 2)
    w, h = max(b.width for b in base + mine) * scale, max(b.height for b in base + mine) * scale
    out = []
    for i in range(max(len(base), len(mine))):
        both = Image.new("RGB", (w * 2 + 8, h), BACKGROUND)
        for n, strip in enumerate((base, mine)):
            f = strip[i % len(strip)]
            big = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
            both.paste(big, (n * (w + 8) + (w - big.width) // 2, h - big.height), big)
        out.append(both)
    out[0].save(target, save_all=True, append_images=out[1:], duration=int(1000 / fps), loop=0)


def preview(outdir: str, skins: list[str]) -> None:
    """Sheets and GIFs for the reviewed skins (SKIN_RIGS), or for the named ones (any whose stills exist)."""
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    rigs = ALL_RIGS if skins else SKIN_RIGS
    names = skins or sorted({k.split("/")[0] for k in SKIN_RIGS})
    levels: dict[str, list[Image.Image]] = {}
    for skin in names:
        anims = [k.split("/")[1] for k in rigs if k.startswith(skin + "/")]
        try:
            strips = {a: baked(rigs[f"{skin}/{a}"](), a) for a in anims}
        except FileNotFoundError as error:
            print(f"{skin}: missing still ({error.filename})", flush=True)
            continue
        wide = max(len(f) * f[0].width for f in strips.values())
        scale = max(1, min(4, 2800 // max(wide, 1)))
        _sheet(rigs, skin, anims, scale).save(out / f"{skin}.png")
        levels.setdefault(skin.split("-")[0], []).append(_sheet(rigs, skin, anims, 1))
        for anim in anims:
            _gif(rigs, skin, anim, out / f"{skin}__{anim}.gif")
        print(f"{skin}: {', '.join(anims)}", flush=True)
    for level, sheets in levels.items():
        combined = Image.new("RGB", (max(s.width for s in sheets), sum(s.height for s in sheets)), BACKGROUND)
        y = 0
        for s in sheets:
            combined.paste(s, (0, y))
            y += s.height
        combined.save(out / f"{level}-native.png")


if __name__ == "__main__":
    if sys.argv[1:2] == ["preview"]:
        preview(sys.argv[2], sys.argv[3:])
    else:
        sys.exit(__doc__)
