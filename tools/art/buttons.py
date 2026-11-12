"""The touch buttons: a worn console button in pixel art, one plate with three faces (lane, gun, dash) and a pause one.

Drawn procedurally at native size (one texel = one world block, SPRITE_SCALE px in the game), with light from the top
left and no outline anywhere: the bezel is steel lit along its top edge and dark underneath, the cap a shaded dome in the
button's colour, the icon embossed on it in cream with a shadow cast on the cap. Pressed, the cap sinks 2 texels and
loses its dome, and the groove it leaves shows. The dash has two more faces: its cooldown (the cap gone grey and flat)
and a lit one for the flash when it is ready again. Frames are named btn-<name>_<state>; their pivot is the middle of
the plate. src/ui/TouchControls.ts and GameHUD use them.
"""
import numpy as np
from PIL import Image, ImageDraw


BIG = 64          # canvas of the big buttons: a plate 60 texels across, with room under it for its shadow
SMALL = 28        # the pause button: a plate 24 across
LIGHT = np.array([-.55, -.83])  # towards the light on the screen: up and to the left
SINK = 2          # texels the cap goes down pressed

# Ramps, dark to light. Muted and warm, as lit by the levels' lamps
STEEL = [(22, 24, 32), (44, 48, 58), (74, 80, 92), (112, 118, 128), (158, 164, 172)]
CAPS = {
    "lane": [(70, 34, 22), (122, 62, 30), (172, 94, 38), (208, 128, 56), (236, 170, 96)],
    "gun": [(62, 22, 30), (108, 34, 42), (150, 48, 52), (186, 70, 66), (220, 110, 92)],
    "dash": [(20, 56, 68), (32, 92, 106), (46, 130, 140), (78, 168, 170), (136, 208, 198)],
    "pause": [(46, 40, 38), (76, 66, 58), (108, 94, 78), (142, 126, 102), (182, 164, 134)],
}
GREY = [(24, 30, 34), (38, 48, 52), (52, 64, 68), (66, 80, 84), (84, 98, 100)]   # the dash while it recharges
LIT = [(40, 100, 112), (66, 150, 156), (110, 200, 196), (170, 234, 220), (226, 252, 240)]  # ...and for its flash
CREAM = [(98, 84, 70), (156, 140, 112), (212, 198, 166), (242, 234, 208)]          # the icon: dark, mid, light, lit
DIM = [(36, 46, 50), (66, 78, 80), (92, 104, 104), (112, 124, 122)]
WHITE = [(150, 196, 196), (214, 240, 232), (246, 254, 248), (255, 255, 255)]
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def _quantise(level: np.ndarray, steps: int, dither: float = .5) -> np.ndarray:
    """level in 0..1 to a step index, with a little ordered dither where two steps meet."""
    h, w = level.shape
    noise = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
    return np.clip(np.floor(level * (steps - 1) + .5 + (noise - .5) * dither), 0, steps - 1).astype(int)


def _paint(img: np.ndarray, mask: np.ndarray, index: np.ndarray, ramp: list[tuple[int, int, int]]) -> None:
    table = np.array(ramp, np.uint8)
    img[mask, :3] = table[index[mask]]
    img[mask, 3] = 255


def _shift(mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(mask)
    h, w = mask.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = mask[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def _plate(size: int, ramp, pressed: bool = False, flat: bool = False) -> tuple[np.ndarray, tuple[float, float]]:
    """The plate: its shadow, bezel, groove and cap, without an icon; and where the middle of the cap is."""
    img = np.zeros((size, size, 4), np.uint8)
    ys, xs = np.mgrid[0:size, 0:size] + .5
    r_out = size / 2 - 2
    bezel_w = max(3, round(r_out / 5))
    cx, cy = size / 2, r_out + 1
    dx, dy = xs - cx, ys - cy
    d = np.hypot(dx, dy)
    along = (dx * LIGHT[0] + dy * LIGHT[1]) / np.maximum(d, 1e-6)  # 1 towards the light, -1 away
    # Its shadow on the world, offset down: pressed, the plate lies closer to it
    sd = np.hypot(dx, ys - (cy + (1.5 if pressed else 2.5)))
    img[..., :3] = 8
    img[..., 3] = np.where(sd <= r_out + (0 if pressed else .5), 120, 0)

    r_in = r_out - bezel_w
    s = (d - r_in) / bezel_w                                   # 0 at the cap's edge, 1 at the rim
    facing = np.where(s > .5, along, -along)                   # the outer slope faces out, the inner slope faces the cap
    steel = .5 + facing * .36 * (np.abs(s - .5) * 2 + .4)
    steel = np.where(np.abs(s - .5) < .12, .48, steel)
    index = _quantise(np.clip(steel, 0, 1), 5, .2)
    index = np.where((d > r_out - 1.2) & (along > .45), 4, index)       # the lit edge of the rim
    index = np.where((d > r_out - 1.2) & (along < -.35), 0, index)      # and its dark underside
    _paint(img, d <= r_out, index, STEEL)
    # The groove the cap sits in: pressed, it shows as a crescent over the cap's top
    _paint(img, d <= r_in + .8, np.zeros_like(index), STEEL)

    sink = SINK if pressed else 0
    cd = np.hypot(dx, dy - sink)
    r_cap = r_in - 1 - (.6 if pressed else 0)
    cap = (cd <= r_cap) & (d <= r_in + .8)
    u = cd / r_cap
    cap_along = (dx * LIGHT[0] + (dy - sink) * LIGHT[1]) / np.maximum(cd, 1e-6)
    tilt = np.clip((u - .5) / .5, 0, 1) ** 1.3 * (.6 if pressed or flat else 1.0)
    spec = np.exp(-(((dx + r_cap * .34) ** 2 + (dy - sink + r_cap * .4) ** 2) / (r_cap * .3) ** 2)) * (0 if pressed or flat else .22)
    level = .5 + cap_along * tilt * .5 + (-.1 if pressed else .1) + spec
    _paint(img, cap, _quantise(np.clip(level, 0, 1), len(ramp), .28), ramp)
    return img, (cx, cy + sink)


def _rows(rows: list[str]) -> dict[str, np.ndarray]:
    """An ASCII picture to a mask per character."""
    h, w = len(rows), max(len(r) for r in rows)
    out: dict[str, np.ndarray] = {}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                out.setdefault(ch, np.zeros((h, w), bool))[y, x] = True
    return out


def _emboss(img: np.ndarray, parts: dict[str, np.ndarray], tones: dict[str, list], middle: tuple[float, float]) -> None:
    """The picture centred on the cap's middle: each part's top and left edge lit, its right and underside dark, and a
    shadow cast down and right onto the cap. Parts are painted in the order of tones; the later one overlaps."""
    h, w = next(iter(parts.values())).shape
    ox, oy = round(middle[0] - w / 2), round(middle[1] - h / 2)
    height, width = img.shape[:2]

    def place(mask: np.ndarray) -> np.ndarray:
        out = np.zeros((height, width), bool)
        out[oy:oy + h, ox:ox + w] = mask
        return out

    placed = {key: place(parts[key]) for key in tones if key in parts}
    solid = np.zeros((height, width), bool)
    for m in placed.values():
        solid |= m
    cast = _shift(solid, 1, 1) & ~solid & (img[..., 3] == 255)
    img[cast, :3] = (img[cast, :3] * .5).astype(np.uint8)
    for key, m in placed.items():
        ramp = tones[key]
        top, left = m & ~_shift(m, 0, 1), m & ~_shift(m, 1, 0)
        bottom, right = m & ~_shift(m, 0, -1), m & ~_shift(m, -1, 0)
        idx = np.full(m.shape, 2)
        idx[top | left] = 3
        idx[bottom | right] = 1
        idx[(top | left) & (bottom | right)] = 2   # a line one texel thin keeps its body colour
        _paint(img, m, idx, ramp)


def _canvas(w: int, h: int) -> Image.Image:
    return Image.new("L", (w, h), 0)


def _mask(im: Image.Image) -> np.ndarray:
    return np.asarray(im) > 0


def _lane() -> tuple[dict, dict]:
    """Two ledges and a double arrow between them."""
    w = 31
    rows = ["S" * w] * 3 + ["." * w] * 2
    for n in range(1, 12, 2):
        rows.append("." * ((w - n) // 2) + "A" * n + "." * ((w - n) // 2))
    rows += ["." * 13 + "AAAAA" + "." * 13] * 3
    for n in range(11, 0, -2):
        rows.append("." * ((w - n) // 2) + "A" * n + "." * ((w - n) // 2))
    rows += ["." * w] * 2 + ["S" * w] * 3
    return _rows(rows), {"S": CREAM, "A": CREAM}


# The pistol from armed.py, drawn big: slide, frame and trigger guard, the grip leaning back, a few dark notches
GUN = [
    "...S...................S......",
    "..SSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    "..FFFFFFFFFFFFFFFFFFFFFFFFF...",
    "..GGGGGGGFFFFFFFFFFFFFFFF.....",
    "..GGGGGGGG.......FFFF.FF......",
    "..GGGGGGGG.......FF.FFFF......",
    "..GGGGGGGG.......FF..FF.......",
    "..GGGGGGGG........FFFF........",
    "..GGGGGGGG....................",
    "...GGGGGGGG...................",
    "...GGGGGGGG...................",
    "...GGGGGGGG...................",
    "..GGGGGGGGG...................",
    "..GGGGGGGGG...................",
]
# Rear serrations and the front sight's notch, one character per texel like GUN
NOTCHES = ["." * 30] + [
    "....D.D.D.....................",
    "....D.D.D...............D.....",
    "....D.D.D...............D.....",
    "....D.D.D...............D.....",
] + ["." * 30] * 14


def _gun() -> tuple[dict, dict]:
    parts = _rows(GUN)
    parts["D"] = _rows(NOTCHES)["D"]
    return parts, {"S": CREAM, "F": [CREAM[0], CREAM[0], CREAM[1], CREAM[2]], "G": [CREAM[0], CREAM[0], CREAM[1], CREAM[2]],
                   "D": [DIM[0], DIM[0], DIM[0], DIM[1]]}


def _dash() -> tuple[dict, dict]:
    """The roach streaking right, side on, with speed lines behind it."""
    w, h = 42, 22
    wings, seam, pronotum, head, legs, lines = (_canvas(w, h) for _ in range(6))
    d = ImageDraw.Draw(wings)
    d.ellipse((14, 4, 31, 15), fill=255)
    d.polygon([(16, 6), (11, 10), (16, 13)], fill=255)    # the wing cases taper to a point behind
    ImageDraw.Draw(seam).line((14, 10, 29, 10), fill=255)
    ImageDraw.Draw(pronotum).ellipse((28, 5, 36, 14), fill=255)
    d = ImageDraw.Draw(head)
    d.ellipse((35, 8, 40, 13), fill=255)
    d.line((37, 8, 33, 3), fill=255)            # antennae, laid back along the run
    d.line((33, 3, 27, 1), fill=255)
    d.line((38, 8, 37, 3), fill=255)
    d.line((37, 3, 32, 0), fill=255)
    leg = ImageDraw.Draw(legs)
    for (x0, y0), (x1, y1) in (((32, 14), (36, 18)), ((24, 14), (24, 18)), ((19, 14), (13, 17))):
        leg.line((x0, y0, x1, y1), fill=255)
        leg.line((x1, y1, x1 + (2 if x1 > x0 else -3), 21), fill=255)
    speed = ImageDraw.Draw(lines)
    for y, x0, x1 in ((2, 8, 20), (6, 2, 11), (10, 0, 9), (14, 3, 12)):
        speed.rectangle((x0, y, x1, y + 1), fill=255)
    parts = {"L": _mask(lines), "G": _mask(legs), "W": _mask(wings), "S": _mask(seam), "P": _mask(pronotum), "H": _mask(head)}
    dark = [CREAM[0], CREAM[0], CREAM[1], CREAM[2]]
    return parts, {"L": CREAM, "G": dark, "W": CREAM, "S": [DIM[0]] * 4, "P": dark, "H": CREAM}


def _pause() -> tuple[dict, dict]:
    return _rows(["BBB..BBB"] * 9), {"B": CREAM}


ICONS = {"lane": _lane, "gun": _gun, "dash": _dash, "pause": _pause}
STATES = {"lane": ["up", "down"], "gun": ["up", "down"], "dash": ["up", "down", "cool", "flash"], "pause": ["up", "down"]}


def _button(name: str, state: str) -> np.ndarray:
    size = SMALL if name == "pause" else BIG
    cool, lit = state == "cool", state == "flash"
    img, middle = _plate(size, GREY if cool else LIT if lit else CAPS[name], state == "down", flat=cool)
    parts, tones = ICONS[name]()
    tint = DIM if cool else WHITE if lit else None
    _emboss(img, parts, {k: tint or v for k, v in tones.items()}, middle)
    return img


def frames() -> dict[str, tuple[list[Image.Image], tuple[float, float]]]:
    out = {}
    for name, states in STATES.items():
        size = SMALL if name == "pause" else BIG
        out[f"btn-{name}"] = ([Image.fromarray(_button(name, s)) for s in states], (.5, (size / 2 - 1) / size))
    return out
