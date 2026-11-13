"""The slipper and the rolled newspaper as swatters: what a hand brings down on a cockroach, from the back of the room.

Each is one strip of poses the game picks by hand (obstacles/swatter.ts), not a loop:
  0 far       small and dim, raised, waiting in the back of the scene over its lane
  1 windback  pulled up and back before the swing
  2-4 swing   coming in towards the camera, growing and turning flat, with a smear of where it just was
  5 impact    flat on the ledge, squashed by the slap
  6 landed    lying flat along the ledge
  7-8 peel    the held end lifting first, then going back into the room

From the picked renders in art/sprites/enemies (raised, swinging and flat stills, each read at its own pixel
grid with its ground line taken off). Both are held by one end and swung about it (see _swing_strip). The in-betweens
are made on the native image blown up 8x (scaled, turned, squashed, all nearest) and read back 8x with pixels.down, so
every pose stays on the texel grid; only the slipper's two mid-swing poses are renders of their own. Nothing is
rotated or scaled at runtime.

Two builds: without a hand (what the game uses) and with the hand holding it (`-hand`), kept for comparison: its arm
reaches in from the top right, its cut end dithered away so it never ends in a hard edge.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ni

from pixels import at_size, down, up

PICKED = "art/sprites/enemies"
WORK = 8
HAZE = np.array([70, 78, 88], float)


def _still(name: str, factor: int, flip_v: bool = False, mirror: bool = False) -> np.ndarray:
    a = at_size(f"{PICKED}/{name}.png", factor, ground=True)
    a = a[::-1] if flip_v else a
    return np.ascontiguousarray(a[:, ::-1] if mirror else a)


def _hazed(a: np.ndarray, amount: float) -> np.ndarray:
    if amount <= 0:
        return a
    out = a.astype(float)
    out[..., :3] = out[..., :3] * (1 - amount) + HAZE * amount
    return out.astype(np.uint8)


def _darker(a: np.ndarray, amount: float) -> np.ndarray:
    out = a.astype(float)
    out[..., :3] *= 1 - amount
    return out.astype(np.uint8)


def _pose(a: np.ndarray, scale: float = 1, tilt: float = 0, squash: float = 1, stretch: float = 1) -> np.ndarray:
    """Scaled, squashed towards the ledge and tipped up at the left by `tilt` degrees, on the 8x grid, read back."""
    if scale == 1 and tilt == 0 and squash == 1 and stretch == 1:
        return a
    big = Image.fromarray(np.ascontiguousarray(up(a, WORK)))
    w, h = big.size
    big = big.resize((max(WORK, round(w * scale * stretch)), max(WORK, round(h * scale * squash))), Image.NEAREST)
    if tilt:
        big = big.rotate(-tilt, resample=Image.NEAREST, expand=True)
    pad_w, pad_h = -big.width % WORK, -big.height % WORK
    if pad_w or pad_h:
        grown = Image.new("RGBA", (big.width + pad_w, big.height + pad_h))
        grown.paste(big, (pad_w // 2, pad_h))
        big = grown
    out = down(np.asarray(big), WORK)
    ys, xs = np.nonzero(out[..., 3])
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def _over(*layers: tuple[np.ndarray, int, int]) -> np.ndarray:
    """Layers placed by their bottom right corner, offset (dx, dy): later ones on top."""
    w = max(l.shape[1] + abs(dx) for l, dx, _ in layers)
    h = max(l.shape[0] + abs(dy) for l, _, dy in layers)
    canvas = np.zeros((h, w, 4), np.uint8)
    for l, dx, dy in layers:
        y0, x0 = h - l.shape[0] - max(0, -dy), w - l.shape[1] - max(0, -dx)
        y0, x0 = max(0, y0 + min(0, dy)), max(0, x0 + min(0, dx))
        region = canvas[y0:y0 + l.shape[0], x0:x0 + l.shape[1]]
        solid = l[:region.shape[0], :region.shape[1], 3] > 0
        region[solid] = l[:region.shape[0], :region.shape[1]][solid]
    return canvas


# The streak behind a swinging pose: how far back along the swing (up and to the right) each band reaches, in texels,
# and how dark it is against the object's own colour. Solid bands (a dither would catch the glow texel by texel)
STREAK = [(3, .55), (6, .38), (9, .24)]


def _smear(pose: np.ndarray) -> np.ndarray:
    """One object, and behind it a streak along the swing: the ground it just swept, in its own darker colour, in three
    hard bands thinning out (solid, then dithered), no outline and nothing of its shape inside. Never a second copy."""
    pad = STREAK[-1][0]
    h, w = pose.shape[:2]
    canvas = np.zeros((h + pad, w + pad, 4), np.uint8)
    body = np.zeros(canvas.shape[:2], bool)
    body[pad:, :w] = pose[..., 3] > 0
    solid = pose[pose[..., 3] > 0][:, :3].astype(float)
    base = np.median(solid, axis=0)
    swept = np.zeros_like(body)
    inner = 0
    for reach, shade in STREAK:
        band = np.zeros_like(body)
        for d in range(inner + 1, reach + 1):
            # Back along the swing: up and to the right, one texel each way per step, thinner the further back (a taper
            # down to a point, so it is a streak, never a second outline of the object)
            shrunk = ni.binary_erosion(body, iterations=d // 2) if d > 1 else body
            band[:-d, d:] |= shrunk[d:, :-d]
        band &= ~body & ~swept
        canvas[band] = np.append((base * shade).astype(np.uint8), 255)
        swept |= band
        inner = reach
    canvas[pad:, :w][pose[..., 3] > 0] = pose[pose[..., 3] > 0]
    ys2, xs2 = np.nonzero(canvas[..., 3])
    return canvas[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]


def _fade_arm(a: np.ndarray) -> np.ndarray:
    """The forearm's far end (top right) dithered away in two steps, so it reaches in rather than ends."""
    out = a.copy()
    h, w = out.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    d = (xs / w) - (ys / h)  # 1 at the top right corner
    checker = (xs + ys) % 2 == 0
    out[(d > .55) & checker, 3] = 0
    out[d > .75, 3] = 0
    return out


def _with_sole(a: np.ndarray, thickness: int = 1) -> np.ndarray:
    """A darker edge under a flat pose, so it reads as lying on the ledge."""
    return _over((_darker(a, .55), 0, thickness), (a, 0, 0))


def _strip(far: np.ndarray, mid: np.ndarray, flat: np.ndarray, sole: int) -> list[np.ndarray]:
    """The hand variants' strip, from rotated raised renders: the held end leading."""
    poses = [
        _hazed(_pose(far, .5), .45),
        # Wound back: the striking end cocked up
        _hazed(_pose(far, .48, tilt=12), .45),
        _hazed(_smear(_pose(far, .72)), .25),
        _hazed(_smear(_pose(mid, .9)), .1),
        # The fastest frame: stretched a little along the swing
        _smear(_pose(flat, tilt=12, stretch=1.12)),
        _with_sole(_pose(flat, squash=.72, stretch=1.08), sole) if sole else _pose(flat, squash=.72, stretch=1.08),
        _with_sole(flat, sole) if sole else flat,
        _pose(flat, tilt=14),
        _hazed(_pose(mid, .82), .25),
    ]
    # One canvas for the strip, every pose standing on its bottom edge, centred
    width = max(p.shape[1] for p in poses)
    height = max(p.shape[0] for p in poses)
    out = []
    for p in poses:
        canvas = np.zeros((height, width, 4), np.uint8)
        x0 = (width - p.shape[1]) // 2
        canvas[height - p.shape[0]:, x0:x0 + p.shape[1]] = p
        out.append(canvas)
    return out


def _end(a: np.ndarray, toward: tuple[float, float]) -> tuple[int, int]:
    """The texel at the far end of the shape in direction `toward` (x right, y down): the mean of its last two texels."""
    ys, xs = np.nonzero(a[..., 3])
    reach = xs * toward[0] + ys * toward[1]
    near = reach >= reach.max() - 2
    return int(round(xs[near].mean())), int(round(ys[near].mean()))


def _turn(a: np.ndarray, heel: tuple[int, int], degrees: float) -> tuple[np.ndarray, int]:
    """The pose turned counterclockwise by `degrees` about the `heel` texel, on the 8x grid and read back, and the heel's
    column in the result: the pivot of the swing stays where the hand is."""
    h, w = a.shape[:2]
    r = max(heel[0], w - heel[0], heel[1], h - heel[1]) + 2
    pad = np.zeros((2 * r + 1, 2 * r + 1, 4), np.uint8)
    pad[r - heel[1]:r - heel[1] + h, r - heel[0]:r - heel[0] + w] = a
    big = Image.fromarray(np.ascontiguousarray(up(pad, WORK)))
    c = r * WORK + WORK // 2
    out = down(np.asarray(big.rotate(degrees, resample=Image.NEAREST, center=(c, c))), WORK)
    ys, xs = np.nonzero(out[..., 3])
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1], r - xs.min()


# A swatter is swung by one end, the grip: held low, its far end (the slipper's toe, the roll's spiral) up and cocked
# back, turned about the grip, far end over the top and down until it slaps flat, far end first. Each pose is the far
# end's heading about the grip (degrees counterclockwise from the right), and the grips share one column of the
# canvas, so the pivot stays where the hand is. Flat, the far end is straight left, the grip's end to the right
FLAT_TOE, FLAT_HEADING = (-1., 0.), 180
# The raised render's far end as a direction in the render (x right, y down) and its heading. The slipper's raised
# render has the toe at the bottom and its sole facing away: flipped over, the toe is up with the sole to the front
SLIPPER_RAISED = ((.81, -.59), 37)
NEWSPAPER_RAISED = ((.37, -.93), 68)
# The picked mid-swing slipper stills: the toe's direction in each (measured off it: up and a little left, then low on
# the left) and the scale it is read at
SLIPPER_SWING = {"slipper-swing-105": ((-.15, -.99), .85), "slipper-swing-145": ((-.89, -.45), 1.0)}


def _look(frame: tuple[np.ndarray, int], haze: float = 0, smear: bool = False) -> tuple[np.ndarray, int]:
    # The streak only grows up and to the right of the pose: the grip keeps its column
    a, grip = frame
    return _hazed(_smear(a) if smear else a, haze), grip


def _slap(frame: tuple[np.ndarray, int]) -> tuple[np.ndarray, int]:
    return _with_sole(frame[0], 1), frame[1]


def _swing_strip(raised: np.ndarray, raised_end: tuple[tuple[float, float], int], flat: np.ndarray, rest: int,
                 mids) -> list[np.ndarray]:
    """The nine poses of a swatter held by one end. `mids(held, lying)` makes the two mid-swing frames, each a pose
    and its grip's column, from `held(scale, heading)` (the raised render turned about the grip) and `lying(heading,
    **how)` (the flat one); `rest` is the heading it waits at."""
    far_end, raised_heading = raised_end

    def about_grip(a: np.ndarray, toward: tuple[float, float], degrees: float) -> tuple[np.ndarray, int]:
        return _turn(a, _end(a, (-toward[0], -toward[1])), degrees)

    def held(scale: float, heading: float) -> tuple[np.ndarray, int]:
        return about_grip(_pose(raised, scale), far_end, heading - raised_heading)

    def lying(heading: float = FLAT_HEADING, **how) -> tuple[np.ndarray, int]:
        return about_grip(_pose(flat, **how), FLAT_TOE, heading - FLAT_HEADING)

    mid_a, mid_b = mids(held, lying)
    poses = [
        # Held by the grip, far end up and back; wound further back
        _look(held(.5, rest), .45), _look(held(.48, 48), .45),
        # The swing: far end up over the top and down, coming in towards the camera; the last, far end leading, still a
        # little grip high, stretched along the swing
        _look(mid_a, .25, True), _look(mid_b, .1, True), _look(lying(FLAT_HEADING + 12, stretch=1.12), 0, True),
        # The slap, then lying flat
        _slap(lying(squash=.72, stretch=1.08)), _slap(lying()),
        # The peel: the grip lifts first, then the far end follows it back up into the room
        _look(lying(FLAT_HEADING + 14)), _look(held(.82, 135), .25),
    ]
    # One canvas for the strip, every pose standing on its bottom edge, all grips in one column, the landed pose
    # centred (the hitbox is centred on the frame)
    landed, lx = poses[6]
    lefts = [lx - hx for _, hx in poses]
    room = max(0, -min(lefts), max(left + a.shape[1] for (a, _), left in zip(poses, lefts)) - landed.shape[1])
    width = landed.shape[1] + 2 * room
    height = max(a.shape[0] for a, _ in poses)
    out = []
    for (a, _), left in zip(poses, lefts):
        canvas = np.zeros((height, width, 4), np.uint8)
        canvas[height - a.shape[0]:, room + left:room + left + a.shape[1]] = a
        out.append(canvas)
    return out


def _slipper_strip() -> list[np.ndarray]:
    """The slipper is swatted by its heel, the sole towards the runner. Its mid-swing poses are renders of their own
    (a slipper turned in the air shows its sole and strap, which no turned still does), the rest turned stills."""
    def swung(name: str) -> tuple[np.ndarray, int]:
        toe, scale = SLIPPER_SWING[name]
        a = _pose(_still(name, 2), scale)
        return _turn(a, _end(a, (-toe[0], -toe[1])), 0)

    return _swing_strip(_still("slipper-swat-far-nohand", 1, flip_v=True), SLIPPER_RAISED,
                        _still("slipper-flat", 2, mirror=True), 70,
                        lambda held, lying: (swung("slipper-swing-105"), swung("slipper-swing-145")))


def _newspaper_strip() -> list[np.ndarray]:
    """The rolled newspaper is swung by its held end: low, the roll leaning back with its spiral end up. A roll looks
    the same turned about its axis, so its mid-swing poses are the flat render turned about the grip."""
    return _swing_strip(_still("newspaper-swat-far-nohand", 1), NEWSPAPER_RAISED, _still("newspaper-flat", 2), 68,
                        lambda held, lying: (lying(105, scale=.78), lying(145, scale=.92)))


def slipper(hand: bool = False) -> list[Image.Image]:
    if hand:
        far = _fade_arm(_still("slipper-swat-far", 2, flip_v=True))
        mid = _fade_arm(_still("slipper-swat-mid", 2, flip_v=True))
        flat = _fade_arm(_still("slipper-swat-flat", 1))
        frames = _strip(far, mid, flat, 0)
    else:
        frames = _slipper_strip()
    return [Image.fromarray(f) for f in frames]


def newspaper(hand: bool = False) -> list[Image.Image]:
    if hand:
        far = _fade_arm(_still("newspaper-swat-far", 2, flip_v=True))
        mid = _fade_arm(_still("newspaper-swat-mid", 2, flip_v=True))
        flat = _fade_arm(_still("newspaper-swat-flat", 2))
        frames = _strip(far, mid, flat, 0)
    else:
        frames = _newspaper_strip()
    return [Image.fromarray(f) for f in frames]


SWATTERS = {
    "flipper-swat": lambda: slipper(),
    "newspaper-swat": lambda: newspaper(),
    "flipper-swat-hand": lambda: slipper(hand=True),
    "newspaper-swat-hand": lambda: newspaper(hand=True),
}
