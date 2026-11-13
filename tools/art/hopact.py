"""The hop act's enemies (levels 1-2: the glue trap, the dripping bleach, the light, the mop) and the dash act's
(levels 3-6: the vacuum, the hen, the frog, the house centipede, the dancing boots, the spray's big can; and the
hedgehog, kept for level 9).

From the picked renders in art/sprites/enemies, each read at its own pixel grid (pixels.at_size) and shrunk by a
whole factor. Motion is made on the native image blown up 8x and read back 8x (pixels.down), so it stays on the texel
grid; glints are drawn on native pixels. Each strip shares one canvas per animation.
"""
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ni

from pixels import at_size, down, native, strip_ground, up

PICKED = "art/sprites/enemies"
WORK = 8


def _still(name: str, factor: int) -> np.ndarray:
    return at_size(f"{PICKED}/{name}.png", factor, ground=True)


def _pose(a: np.ndarray, scale: float = 1, squash: float = 1, tilt: float = 0) -> np.ndarray:
    if scale == 1 and squash == 1 and tilt == 0:
        return a
    big = Image.fromarray(np.ascontiguousarray(up(a, WORK)))
    w, h = big.size
    big = big.resize((max(WORK, round(w * scale)), max(WORK, round(h * scale * squash))), Image.NEAREST)
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


def _canvas(poses: list[np.ndarray], anchor: str = "bottom") -> list[Image.Image]:
    """One canvas for the strip: poses centred, standing on its bottom edge (or hanging from its top)."""
    width = max(p.shape[1] for p in poses)
    height = max(p.shape[0] for p in poses)
    out = []
    for p in poses:
        c = np.zeros((height, width, 4), np.uint8)
        x0 = (width - p.shape[1]) // 2
        y0 = height - p.shape[0] if anchor == "bottom" else 0
        c[y0:y0 + p.shape[0], x0:x0 + p.shape[1]] = p
        out.append(Image.fromarray(c))
    return out


def _glint(a: np.ndarray, position: float, width: float = .12, strength: float = .6) -> np.ndarray:
    """A diagonal band of light across the object, on native pixels: the glue's wet shine."""
    out = a.astype(float)
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    band = np.exp(-(((xs / w + ys / h * .6) - position) / width) ** 2) * strength
    out[..., :3] += (255 - out[..., :3]) * band[..., None]
    return out.astype(np.uint8)


# A fly stuck in the glue, seen from above: dark body and legs, pale wings (k dark, w wing)
FLY = ["ww.ww", "wwkww", ".kkk.", "k.k.k"]
GNAT = ["w.w", "wkw", "kkk", "k.k"]
INK = (34, 26, 18, 255)
WING = (214, 226, 232, 255)


def _stamp(a: np.ndarray, pattern: list[str], x: int, y: int) -> None:
    for j, row in enumerate(pattern):
        for i, c in enumerate(row):
            if c != "." and 0 <= y + j < a.shape[0] and 0 <= x + i < a.shape[1] and a[y + j, x + i, 3]:
                a[y + j, x + i] = INK if c == "k" else WING


def _strand(a: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> None:
    """A glossy strand of glue: a one-texel line, lighter than the glue under it."""
    for t in np.linspace(0, 1, max(abs(x1 - x0), abs(y1 - y0)) + 1):
        x, y = round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)
        if a[y, x, 3]:
            a[y, x, :3] = np.minimum(255, a[y, x, :3].astype(int) + 70)


def glue() -> list[Image.Image]:
    """The glue trap: two flies stuck on the glue, glossy strands, and a shine sliding across it, then a rest. A low flat
    thing on the ledge: a third of its render's grid, well short of the roach's length."""
    tray = at_size(f"{PICKED}/glue-trap.png", 1, ground=True)
    frames = []
    for i in range(6):
        shiny = down(_glint(tray, -.2 + i * .35) if i < 4 else tray, 3)
        h, w = shiny.shape[:2]
        for x0, y0, x1, y1 in ((int(w * .3), int(h * .35), int(w * .45), int(h * .3)), (int(w * .55), int(h * .5), int(w * .7), int(h * .42))):
            _strand(shiny, x0, y0, x1, y1)
        _stamp(shiny, FLY, int(w * .3), int(h * .3))
        _stamp(shiny, GNAT, int(w * .58), int(h * .42))
        frames.append(shiny)
    return _canvas(frames)


def _bright(a: np.ndarray, colour=(196, 240, 60), amount: float = .45) -> np.ndarray:
    """Pushed towards a bright yellow-green: the bleach's drop and splash, so they read against any kitchen."""
    out = a.astype(float)
    lum = out[..., :3] @ np.array([.299, .587, .114]) / 255
    target = np.array(colour, float)
    out[..., :3] = out[..., :3] * (1 - amount) + target * (.5 + lum[..., None]) * amount
    return np.clip(out, 0, 255).astype(np.uint8)


# The back of the room the jug sits in: it is dimmed towards this, and smaller, so it reads as scenery behind the lane
BACKDROP = np.array([44, 58, 62], float)


def _backdrop(a: np.ndarray, amount: float) -> np.ndarray:
    out = a.astype(float)
    out[..., :3] = out[..., :3] * (1 - amount) + BACKDROP * amount
    return out.astype(np.uint8)


def bleach() -> list[Image.Image]:
    """The jug, tipped on its side with its cap down at the left, rocking a little as it drips: at the back of the upper
    shelf, smaller and dimmed towards the room behind, so it is plainly not in the lane. Only its drop is lit."""
    jug = np.rot90(_still("bleach-bottle", 1), 1)  # a quarter turn: lying, cap at the left
    # Tipped well over the edge: its cap end down, plainly pouring
    return _canvas([_backdrop(_pose(np.ascontiguousarray(jug), .8, tilt=t), .45) for t in (-32, -34, -32, -30)])


def bleach_drop() -> list[Image.Image]:
    """A drop swelling at the cap (three sizes, harmless-looking: no glow, bake.py's PARTLY_LIT), then whole and falling
    (with the enemies' red glow, shown only once it is under the shelf)."""
    drop = _bright(_still("bleach-drop", 1))
    return _canvas([_pose(drop, s) for s in (.6, 1, 1.4)] + [_pose(drop, 1.6)], anchor="top")


def bleach_splash() -> list[Image.Image]:
    """The splash: a crown, its full burst, and the puddle it leaves. About as wide as the spot it wets."""
    splash = _bright(_pose(_still("bleach-splash", 1), .85))
    return _canvas([_pose(splash, .7), splash, _bright(_pose(splash, 1.05, squash=.35), amount=.3)])


def lamp() -> list[Image.Image]:
    """The bare bulb off, and on (with its baked rays). Hanging from its cord at the top."""
    # The two renders sit on different grids: the unlit bulb is scaled to the lit one's size
    off = _pose(_still("lamp", 1), .8)
    on = _still("lamp-on", 1)
    return _canvas([off, on], anchor="top")


def mop() -> list[Image.Image]:
    """Raised over its lane, then pressed down sweeping; each twice, mirrored, so the strings sway."""
    raised = _still("mop-raised", 1)
    sweep = _still("mop-sweep", 1)
    return _canvas([raised, np.ascontiguousarray(raised[:, ::-1]), sweep, np.ascontiguousarray(sweep[:, ::-1])])


# ── The dash act ────────────────────────────────────────────────────────


def vacuum() -> list[Image.Image]:
    """The vacuum cleaner, nozzle to the right; a second frame a texel down, so it shudders as it runs."""
    v = _still("vacuum", 1)
    shook = np.zeros((v.shape[0] + 1, v.shape[1], 4), np.uint8)
    shook[1:] = v
    still = np.zeros_like(shook)
    still[:-1] = v
    return _canvas([still, shook])


def hen() -> list[Image.Image]:
    """The hen, and the hen rearing back before she pecks."""
    # Rearing back is her own still leaned back (the peck render is a differently coloured hen)
    h = _still("hen", 1)
    return _canvas([h, _pose(h, tilt=10)])


def hen_head() -> list[Image.Image]:
    """Her head and comb, cut from the still: what darts down to peck."""
    h = _still("hen", 1)
    head = h[: int(h.shape[0] * .3), : int(h.shape[1] * .45)].copy()
    ys, xs = np.nonzero(head[..., 3])
    return _canvas([head[ys.min():ys.max() + 1, xs.min():xs.max() + 1]])


def frog() -> list[Image.Image]:
    """The frog, and the frog with its mouth open, throat swollen."""
    return _canvas([_still("frog", 1), _still("frog-open", 1)])


def centipede() -> list[Image.Image]:
    """The house centipede seen from above, facing right; flipped top to bottom for the second frame, so its legs ripple."""
    c = _still("centipede", 1)
    return _canvas([c, np.ascontiguousarray(c[::-1])])


def _boots() -> tuple[np.ndarray, np.ndarray]:
    """The render's two boots apart: the one stepping down in front, and the one lifted behind it."""
    a = strip_ground(native(f"{PICKED}/boots-lifted.png"))
    h, w = a.shape[:2]
    front_mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(front_mask, [np.int32([(26, 7), (40, 7), (40, 36), (15, 36), (15, 25), (26, 24)])], 1)
    keep = lambda img: _largest(img)  # noqa: E731
    front = a.copy()
    front[front_mask == 0, 3] = 0
    back = a.copy()
    back[front_mask > 0, 3] = 0
    return keep(front), keep(back)


def _largest(a: np.ndarray) -> np.ndarray:
    labels, count = ni.label(a[..., 3] > 0)
    if count > 1:
        sizes = ni.sum(np.ones_like(labels), labels, range(1, count + 1))
        a = a.copy()
        a[labels != (int(np.argmax(sizes)) + 1), 3] = 0
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def boot() -> list[Image.Image]:
    """One dancing boot: lifted (heel up, toe down, as the render's back boot), then stomped flat."""
    down_boot, lifted = _boots()
    return _canvas([lifted, down_boot])


def hedgehog() -> list[Image.Image]:
    """The hedgehog, and curled into its charge."""
    return _canvas([_still("hedgehog", 1), _still("hedgehog-charge", 1)])


def spray_big() -> list[Image.Image]:
    """The spray's big can, for its cloud wall: half again as big, shaking."""
    can = _pose(native("art/sprites/spray.png"), 1.5)
    return _canvas([_pose(can, tilt=t) if t else can for t in (0, 3, -3)])


HOPACT = {
    "glue": glue,
    "bleach": bleach,
    "bleach-drop": bleach_drop,
    "bleach-splash": bleach_splash,
    "lamp": lamp,
    "mop": mop,
    "vacuum": vacuum,
    "hen": hen,
    "hen-head": hen_head,
    "frog": frog,
    "centipede": centipede,
    "boot": boot,
    "hedgehog": hedgehog,
    "spray-big": spray_big,
}

