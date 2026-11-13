"""The slipper and the rolled newspaper as swatters: what a hand brings down on a cockroach, from the back of the room.

Each is one strip of poses the game picks by hand (obstacles/swatter.ts), not a loop:
  0 far       small and dim, raised, waiting in the back of the scene over its lane
  1 windback  pulled up and back before the swing
  2-4 swing   coming in towards the camera, growing and turning flat, with a smear of where it just was
  5 impact    flat on the ledge, squashed by the slap
  6 landed    lying flat along the ledge
  7-8 peel    one end lifting first, then going back into the room

From the picked renders in art/sprites/enemies (raised, swinging and flat stills, each read at its own pixel
grid with its ground line taken off). The in-betweens are made on the native image blown up 8x (scaled, turned,
squashed, all nearest) and read back 8x with pixels.down, so every pose stays on the texel grid. Nothing is rotated or
scaled at runtime.

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


def _strip(far: np.ndarray, mid: np.ndarray, flat: np.ndarray, sole: int, lead_left: bool = False) -> list[np.ndarray]:
    """lead_left: the striking end (the slipper's toe, the paper's far end) is at the left, towards the runner, and the
    held end at the right, where the hand is: the fastest frame comes down striking end first, and the peel lifts the
    held end first."""
    held = -1 if lead_left else 1
    poses = [
        _hazed(_pose(far, .5), .45),
        # Wound back: the striking end cocked up
        _hazed(_pose(far, .48, tilt=12), .45),
        _hazed(_smear(_pose(far, .72)), .25),
        _hazed(_smear(_pose(mid, .9)), .1),
        # The fastest frame: stretched a little along the swing
        _smear(_pose(flat, tilt=12 * held, stretch=1.12)),
        _with_sole(_pose(flat, squash=.72, stretch=1.08), sole) if sole else _pose(flat, squash=.72, stretch=1.08),
        _with_sole(flat, sole) if sole else flat,
        _pose(flat, tilt=14 * held),
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


def slipper(hand: bool = False) -> list[Image.Image]:
    if hand:
        far = _fade_arm(_still("slipper-swat-far", 2, flip_v=True))
        mid = _fade_arm(_still("slipper-swat-mid", 2, flip_v=True))
        flat = _fade_arm(_still("slipper-swat-flat", 1))
        frames = _strip(far, mid, flat, 0)
    else:
        # The renders hold it by the toe: mirrored, so the toe leads down at the runner and the hand has the heel
        frames = _strip(_still("slipper-swat-far-nohand", 1, mirror=True), _still("slipper-swat-mid-nohand", 1, mirror=True),
                        _still("slipper-flat", 2, mirror=True), 1, lead_left=True)
    return [Image.fromarray(f) for f in frames]


def newspaper(hand: bool = False) -> list[Image.Image]:
    if hand:
        far = _fade_arm(_still("newspaper-swat-far", 2, flip_v=True))
        mid = _fade_arm(_still("newspaper-swat-mid", 2, flip_v=True))
        flat = _fade_arm(_still("newspaper-swat-flat", 2))
        frames = _strip(far, mid, flat, 0)
    else:
        # The raised renders lead with the gripped end: mirrored, so the roll's far end (its spiral) comes down first;
        # lying flat, that end is already at the left
        frames = _strip(_still("newspaper-swat-far-nohand", 1, mirror=True), _still("newspaper-swat-mid-nohand", 1, mirror=True),
                        _still("newspaper-flat", 2), 0, lead_left=True)
    return [Image.fromarray(f) for f in frames]


SWATTERS = {
    "flipper-swat": lambda: slipper(),
    "newspaper-swat": lambda: newspaper(),
    "flipper-swat-hand": lambda: slipper(hand=True),
    "newspaper-swat-hand": lambda: newspaper(hand=True),
}
