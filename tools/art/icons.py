"""The home screen's icons: small pictures for the menu buttons, drawn like the touch buttons' (buttons.py).

Procedural, at native size (one texel = SPRITE_SCALE px in the game), light from the top left, no outline: each part is
lit along its top and left edges, dark along its right and underside, and casts a translucent shadow one texel down and
right. Cream on the menu's dark slabs, since the slab is the button; a second, lit frame in the focus text's warm white
for the focused button. Frames are named btn-<name>, frame 0 idle and 1 lit, pivot in the middle (the transparent
texel around each keeps the shadow in). src/ui/shared.ts createButton draws them.

The achievements' icons (ach-<name>, one frame, 24 texels square, full colour) are drawn the same way, one set of parts per
picture, each part in its own colour ramp. The apple, beer and pill are the pickups' own art shrunk to fit, the bosses'
heads are cut from their portraits. src/systems/achievementView.ts says which achievement has which.
"""
import numpy as np
from PIL import Image, ImageDraw

import pixels
from buttons import CREAM, _canvas, _mask, _paint, _rows, _shift

# The focus text colour's family, dark to lit, for the focused button's icon
LIT_CREAM = [(128, 104, 62), (206, 176, 104), (244, 218, 150), (255, 241, 194)]
GOLD = [(120, 84, 24), (176, 130, 40), (232, 193, 90), (255, 232, 150)]   # the badge: the game's gold, 0xe8c15a
SHADOW = (0, 0, 0, 150)
PAD = 1  # transparent texels around the picture, for its shadow


def _dim(ramp: list) -> list:
    """The same ramp one step down, for parts that sit behind or are shaded: legs, seams, the wire of a hanger."""
    return [ramp[0], ramp[0], ramp[1], ramp[2]]


def _draw(w: int, h: int, fn) -> np.ndarray:
    im = _canvas(w, h)
    fn(ImageDraw.Draw(im))
    return _mask(im)


def _roach(w: int, h: int, antennae: bool = True) -> dict[str, np.ndarray]:
    """The game's roach side on, facing right (art/sprites/roach.png): long flat wing cases tapering behind, the shield
    over its head with a dark gap before it, a small head with its eye, three bent legs and the antennae swept forward
    and up. Proportions of a w x h canvas."""
    def at(fx: float, fy: float) -> tuple[float, float]:
        return fx * (w - 1), fy * (h - 1)

    wings, seam, shield, gap, head, eye, legs, feel = (_canvas(w, h) for _ in range(8))
    d = ImageDraw.Draw(wings)
    d.ellipse((*at(.02, .24), *at(.68, .78)), fill=255)
    d.polygon([at(.12, .40), at(.0, .62), at(.14, .72)], fill=255)
    ImageDraw.Draw(seam).line((*at(.12, .54), *at(.60, .44)), fill=255)
    ImageDraw.Draw(shield).ellipse((*at(.62, .16), *at(.84, .78)), fill=255)
    ImageDraw.Draw(gap).line((*at(.63, .28), *at(.63, .66)), fill=255)
    ImageDraw.Draw(head).ellipse((*at(.82, .40), *at(.97, .80)), fill=255)
    ImageDraw.Draw(eye).point([at(.90, .52)], fill=255)
    leg = ImageDraw.Draw(legs)
    for hip, knee, foot in (((.76, .74), (.88, .90), (.97, 1.0)), ((.46, .76), (.48, .92), (.42, 1.0)), ((.20, .72), (.06, .84), (.0, 1.0))):
        leg.line((*at(*hip), *at(*knee)), fill=255)
        leg.line((*at(*knee), *at(*foot)), fill=255)
    parts = {"G": _mask(legs), "W": _mask(wings), "S": _mask(seam), "P": _mask(shield), "X": _mask(gap), "H": _mask(head), "E": _mask(eye)}
    if antennae:
        f = ImageDraw.Draw(feel)
        f.line((*at(.90, .42), *at(.96, .18)), fill=255)
        f.line((*at(.96, .18), *at(.99, .0)), fill=255)
        f.line((*at(.86, .42), *at(.80, .14)), fill=255)
        f.line((*at(.80, .14), *at(.68, .04)), fill=255)
        parts["A"] = _mask(feel)
    return parts


ROACH_TONES = {"A": _dim(CREAM), "G": _dim(CREAM), "W": CREAM, "S": [CREAM[0]] * 4, "P": CREAM, "X": [CREAM[0]] * 4, "H": CREAM, "E": [CREAM[0]] * 4}


def _roach_icon() -> tuple[dict, dict]:
    return _roach(26, 15), ROACH_TONES


def _roaches_icon() -> tuple[dict, dict]:
    """Two, one behind the other: the one behind is cut back a texel round the one in front, so they read apart."""
    w, h, rw, rh = 28, 21, 20, 12
    back, front = _roach(rw, rh, antennae=False), _roach(rw, rh)
    parts: dict[str, np.ndarray] = {}
    front_all = np.zeros((h, w), bool)
    for key, m in front.items():
        placed = np.zeros((h, w), bool)
        placed[h - rh:, :rw] = m
        parts["f" + key] = placed
        front_all |= placed
    keep_out = front_all | _shift(front_all, 1, 0) | _shift(front_all, -1, 0) | _shift(front_all, 0, 1) | _shift(front_all, 0, -1)
    for key, m in back.items():
        placed = np.zeros((h, w), bool)
        placed[:rh, w - rw:] = m
        parts["b" + key] = placed & ~keep_out
    order = [f"b{k}" for k in "GWSPXHE"] + [f"f{k}" for k in "AGWSPXHE"]
    tones = {**{f"b{k}": v for k, v in ROACH_TONES.items()}, **{f"f{k}": v for k, v in ROACH_TONES.items()}}
    return {k: parts[k] for k in order if k in parts}, {k: tones[k] for k in order if k in parts}


TROPHY = [
    "..RRRRRRRRRRRRRR..",
    "HHH.CCCCCCCCCC.HHH",
    "H.H.CCLCCCCCCC.H.H",
    "H.H.CCLCCCCCCC.H.H",
    "HHH.CCLCCCCCCC.HHH",
    ".HH.CCCCCCCCCC.HH.",
    "....CCCCCCCCCC....",
    ".....CCCCCCCC.....",
    "......CCCCCC......",
    ".......CCCC.......",
    ".......SSSS.......",
    "........SS........",
    "........SS........",
    ".......SSSS.......",
    "....BBBBBBBBBB....",
    "....BBBBBBBBBB....",
]


def _trophy() -> tuple[dict, dict]:
    parts = _rows(TROPHY)
    shine = parts.pop("L")
    parts["C"] = parts["C"] | shine
    parts["L"] = shine
    return parts, {"H": _dim(CREAM), "R": CREAM, "C": CREAM, "L": [CREAM[2], CREAM[3], CREAM[3], CREAM[3]], "S": CREAM, "B": CREAM}


def _podium() -> tuple[dict, dict]:
    """Three steps, the middle one highest, a star over it."""
    w, h = 19, 18
    side, mid, right = (_canvas(w, h) for _ in range(3))
    ImageDraw.Draw(side).rectangle((0, 10, 5, 17), fill=255)
    ImageDraw.Draw(mid).rectangle((6, 8, 12, 17), fill=255)
    ImageDraw.Draw(right).rectangle((13, 13, 18, 17), fill=255)
    pic = _rows(["...X...", "...X...", "XXXXXXX", ".XXXXX.", "..XXX..", ".XX.XX.", ".X...X."])["X"]
    star = np.zeros((h, w), bool)
    star[0:7, 6:13] = pic
    return {"L": _mask(side), "M": _mask(mid), "R": _mask(right), "T": star}, \
        {"L": CREAM, "M": CREAM, "R": CREAM, "T": [CREAM[1], CREAM[2], CREAM[3], CREAM[3]]}


def _hanger() -> tuple[dict, dict]:
    """A wire hanger: the hook, the two slopes and the bar."""
    w, h = 20, 15
    hook = _draw(w, h, lambda d: (d.arc((7, 0, 12, 5), 150, 400, fill=255), d.line((9, 5, 9, 6), fill=255)))
    wire = _draw(w, h, lambda d: (d.line((9, 6, 1, 12), fill=255, width=2), d.line((10, 6, 18, 12), fill=255, width=2)))
    bar = _draw(w, h, lambda d: d.rectangle((0, 12, 19, 14), fill=255))
    return {"K": hook | _shift(hook, 1, 0), "W": wire, "B": bar}, {"K": CREAM, "W": CREAM, "B": CREAM}


def _cog() -> tuple[dict, dict]:
    """A disc with eight square teeth and a hole in the hub."""
    w = 18
    ys, xs = np.mgrid[0:w, 0:w] + .5
    r = np.hypot(xs - w / 2, ys - w / 2)
    teeth = _draw(w, w, lambda d: [d.rectangle(box, fill=255) for box in (
        (7, 0, 10, 2), (7, 15, 10, 17), (0, 7, 2, 10), (15, 7, 17, 10),
        (2, 2, 4, 4), (13, 2, 15, 4), (2, 13, 4, 15), (13, 13, 15, 15))])
    for x, y in ((2, 2), (15, 2), (2, 15), (15, 15)):    # the corners of the diagonal teeth, rounded off
        teeth[y, x] = False
    return {"C": ((r <= 6.6) | teeth) & ~(r <= 2.7)}, {"C": CREAM}


def _flag() -> tuple[dict, dict]:
    """A start flag, chequered, on a pole."""
    w, h = 18, 20
    pole = _draw(w, h, lambda d: d.rectangle((1, 0, 2, 19), fill=255))
    cloth = np.zeros((h, w), bool)
    dark = np.zeros((h, w), bool)
    for x in range(4, 17):
        sway = 1 if (x // 4) % 2 == 0 else 0       # the cloth rises and falls along its length
        for y in range(2 + sway, 11 + sway):
            cloth[y, x] = True
            if ((x - 4) // 3 + (y - 2 - sway) // 3) % 2 == 1:
                dark[y, x] = True
    return {"P": pole, "F": cloth, "D": dark}, {"P": _dim(CREAM), "F": CREAM, "D": [CREAM[0]] * 4}


def _calendar() -> tuple[dict, dict]:
    """A tear-off sheet: two rings on top, a header band and today's number."""
    w, h = 16, 18
    page = _draw(w, h, lambda d: d.rectangle((1, 3, 14, 17), fill=255))
    rings = _draw(w, h, lambda d: (d.rectangle((4, 0, 5, 4), fill=255), d.rectangle((10, 0, 11, 4), fill=255)))
    band = _draw(w, h, lambda d: d.rectangle((1, 3, 14, 6), fill=255))
    digits = {"1": [".X.", "XX.", ".X.", ".X.", "XXX"], "4": ["X.X", "X.X", "XXX", "..X", "..X"]}
    number = np.zeros((h, w), bool)
    for i, ch in enumerate("14"):
        for y, row in enumerate(digits[ch]):
            for x, c in enumerate(row):
                if c == "X":
                    number[10 + y, 4 + i * 4 + x] = True
    return {"P": page, "B": band, "N": number, "R": rings}, {"P": CREAM, "B": _dim(CREAM), "N": [CREAM[0]] * 4, "R": _dim(CREAM)}


def _info() -> tuple[dict, dict]:
    w = 16
    ys, xs = np.mgrid[0:w, 0:w] + .5
    disc = np.hypot(xs - w / 2, ys - w / 2) <= 7.4
    glyph = _rows([
        ".......XX.......",
        ".......XX.......",
        "................",
        "......XXX.......",
        ".......XX.......",
        ".......XX.......",
        ".......XX.......",
        "......XXXX......",
    ])["X"]
    mark = np.zeros((w, w), bool)
    mark[4:4 + glyph.shape[0], :] = glyph
    return {"D": disc & ~mark, "I": mark}, {"D": CREAM, "I": [CREAM[0]] * 4}


def _stats() -> tuple[dict, dict]:
    """A bar chart: four bars rising left to right on a base line."""
    w, h = 18, 16
    bars = _draw(w, h, lambda d: [d.rectangle((x, top, x + 2, 13), fill=255) for x, top in ((1, 9), (5, 5), (9, 7), (13, 1))])
    base = _draw(w, h, lambda d: d.rectangle((0, 14, 17, 15), fill=255))
    return {"B": bars, "L": base}, {"B": CREAM, "L": _dim(CREAM)}


def _back() -> tuple[dict, dict]:
    """An arrow pointing left: a solid head and a thick shaft."""
    head = _rows([
        "......X.........",
        ".....XX.........",
        "....XXX.........",
        "...XXXX.........",
        "..XXXXX.........",
        ".XXXXXX.........",
        "..XXXXX.........",
        "...XXXX.........",
        "....XXX.........",
        ".....XX.........",
        "......X.........",
    ])["X"]
    shaft = _rows([
        "................",
        "................",
        "................",
        "................",
        ".......XXXXXXXX.",
        ".......XXXXXXXX.",
        ".......XXXXXXXX.",
        "................",
        "................",
        "................",
        "................",
    ])["X"]
    return {"S": shaft, "H": head}, {"S": CREAM, "H": CREAM}


def _crumb() -> tuple[dict, dict]:
    """A bread crumb, the currency: a lumpy golden chunk with a darker pore or two."""
    rows = [
        "...XXXX..",
        ".XXXXXXX.",
        "XXXPXXXXX",
        "XXXXXXPXX",
        ".XXXXXXXX",
        "..XXXXX..",
    ]
    parts = _rows(rows)
    body = parts["X"] | parts["P"]
    return {"C": body, "P": parts["P"]}, {"C": GOLD, "P": [GOLD[0]] * 4}


def _badge() -> tuple[dict, dict]:
    ys, xs = np.mgrid[0:7, 0:7] + .5
    return {"B": np.hypot(xs - 3.5, ys - 3.5) <= 3.4}, {"B": GOLD}


# --- The achievements' icons (ach-<name>): 22 texels square, full colour, drawn the same way as the menu icons above ---
ACH = 22


def _ramp(r: int, g: int, b: int) -> list:
    """Dark to lit around a body colour: the dark edge, a darker shade, the body, the lit edge."""
    def mul(k: float) -> tuple:
        return tuple(min(255, round(c * k)) for c in (r, g, b))
    return [mul(.4), mul(.62), (r, g, b), tuple(min(255, round(c * 1.28 + 22)) for c in (r, g, b))]


RED, GREEN, BLUE, BROWN, STEEL_, SAND, PURPLE, TEAL, PINK, ORANGE, INK, YELLOW, PALE, WOOD, GLASS = (
    _ramp(*c) for c in ((196, 58, 52), (84, 164, 66), (66, 114, 196), (136, 92, 56), (140, 148, 162), (222, 208, 170),
                        (142, 88, 196), (58, 164, 168), (218, 108, 148), (232, 136, 48), (54, 50, 62), (244, 214, 84),
                        (236, 230, 212), (112, 74, 46), (150, 196, 214)))
GOLD_ = GOLD

GLYPHS = {
    "0": ["XXX", "X.X", "X.X", "X.X", "XXX"], "1": [".X.", "XX.", ".X.", ".X.", "XXX"], "2": ["XXX", "..X", "XXX", "X..", "XXX"],
    "3": ["XXX", "..X", "XXX", "..X", "XXX"], "4": ["X.X", "X.X", "XXX", "..X", "..X"], "5": ["XXX", "X..", "XXX", "..X", "XXX"],
    "K": ["X.X", "X.X", "XX.", "X.X", "X.X"], "!": [".X.", ".X.", ".X.", "...", ".X."],
    "?": ["XXX", "..X", ".XX", "...", ".X."], "X": ["X.X", "X.X", ".X.", "X.X", "X.X"],
}


def _text(text: str, at: tuple[int, int], scale: int = 1) -> np.ndarray:
    """Pixel digits (3x5) as a mask on the icon's canvas, the top left corner at `at`."""
    out = np.zeros((ACH, ACH), bool)
    x = at[0]
    for ch in text:
        for gy, row in enumerate(GLYPHS[ch]):
            for gx, c in enumerate(row):
                if c == "X":
                    out[at[1] + gy * scale:at[1] + (gy + 1) * scale, x + gx * scale:x + (gx + 1) * scale] = True
        x += 4 * scale
    return out


def _a(fn) -> np.ndarray:
    return _draw(ACH, ACH, fn)


def _centred(parts: dict) -> dict:
    """The parts of a picture of any size, moved together into the middle of the icon's canvas."""
    union = np.zeros(next(iter(parts.values())).shape, bool)
    for m in parts.values():
        union |= m
    ys, xs = np.nonzero(union)
    h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    oy, ox = (ACH - h) // 2, (ACH - w) // 2
    out = {}
    for key, m in parts.items():
        placed = np.zeros((ACH, ACH), bool)
        placed[oy:oy + h, ox:ox + w] = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        out[key] = placed
    return out


def _disc(cx: float, cy: float, r: float) -> np.ndarray:
    ys, xs = np.mgrid[0:ACH, 0:ACH] + .5
    return np.hypot(xs - cx, ys - cy) <= r


def _poly(*points) -> np.ndarray:
    return _a(lambda d: d.polygon(list(points), fill=255))


def _rect(x0: int, y0: int, x1: int, y1: int) -> np.ndarray:
    return _a(lambda d: d.rectangle((x0, y0, x1, y1), fill=255))


def _shoe() -> tuple[dict, dict]:
    sole = _rect(1, 16, 20, 19)
    upper = _poly((2, 15), (2, 6), (8, 5), (10, 9), (15, 11), (20, 14), (20, 15))
    cap = _a(lambda d: d.ellipse((13, 11, 21, 16), fill=255)) & _poly((13, 11), (21, 11), (21, 16), (13, 16))
    laces = _a(lambda d: [d.line((8 + i * 2, 9 + i, 6 + i * 2, 11 + i), fill=255) for i in range(3)])
    stripe = _a(lambda d: d.line((3, 13, 11, 13), fill=255))
    return {"S": sole, "U": upper, "C": cap & ~sole, "L": laces & upper, "T": stripe & upper}, \
        {"S": PALE, "U": BLUE, "C": _ramp(92, 150, 224), "L": PALE, "T": RED}


def _roach_colour() -> tuple[dict, dict]:
    parts = _centred(_roach(22, 12))
    dark = _ramp(98, 62, 36)
    return parts, {"A": dark, "G": dark, "W": BROWN, "S": INK, "P": _ramp(158, 108, 64), "X": INK, "H": _ramp(158, 108, 64), "E": INK}


def _warning() -> tuple[dict, dict]:
    tri = _poly((11, 1), (21, 19), (1, 19))
    mark = _a(lambda d: (d.rectangle((10, 8, 11, 13), fill=255), d.rectangle((10, 15, 11, 16), fill=255)))
    return {"T": tri, "M": mark & tri}, {"T": YELLOW, "M": INK}


def _bolt() -> tuple[dict, dict]:
    bolt = _poly((14, 0), (4, 12), (10, 12), (7, 21), (18, 8), (12, 8))
    return {"B": bolt}, {"B": TEAL}


def _wall() -> tuple[dict, dict]:
    wall = _rect(1, 3, 20, 18)
    mortar = _a(lambda d: [d.line((1, y, 20, y), fill=255) for y in (7, 12, 16)]
                + [d.line((x, 3, x, 6), fill=255) for x in (7, 14)] + [d.line((x, 8, x, 11), fill=255) for x in (4, 11, 18)]
                + [d.line((x, 13, x, 15), fill=255) for x in (7, 14)])
    crack = _a(lambda d: d.line([(11, 3), (9, 7), (12, 10), (9, 14), (11, 18)], fill=255))
    return {"W": wall, "M": mortar & wall, "K": crack & wall}, {"W": RED, "M": SAND, "K": INK}


def _calendar_colour() -> tuple[dict, dict]:
    page = _rect(2, 3, 19, 20)
    band = _rect(2, 3, 19, 7)
    rings = _a(lambda d: (d.rectangle((6, 0, 7, 4), fill=255), d.rectangle((14, 0, 15, 4), fill=255)))
    tick = _a(lambda d: d.line([(6, 14), (9, 17), (15, 10)], fill=255, width=2))
    return {"P": page, "B": band, "R": rings, "T": tick}, {"P": PALE, "B": RED, "R": STEEL_, "T": GREEN}


def _clipboard() -> tuple[dict, dict]:
    board = _rect(3, 2, 18, 20)
    paper = _rect(5, 5, 16, 18)
    clip = _rect(7, 0, 13, 4)
    lines = _a(lambda d: [d.line((7, y, 14, y), fill=255) for y in (8, 11, 14)])
    tick = _a(lambda d: d.line([(7, 15), (9, 17), (14, 12)], fill=255, width=1))
    return {"B": board, "P": paper, "L": lines, "C": clip, "T": tick & ~lines}, {"B": WOOD, "P": PALE, "L": STEEL_, "C": STEEL_, "T": GREEN}


def _infinity() -> tuple[dict, dict]:
    ring = _a(lambda d: (d.ellipse((0, 5, 11, 16), outline=255, width=3), d.ellipse((10, 5, 21, 16), outline=255, width=3)))
    return {"I": ring}, {"I": PURPLE}


def _tree() -> tuple[dict, dict]:
    trunk = _rect(9, 15, 12, 21)
    low = _poly((10, 8), (1, 18), (20, 18))
    mid = _poly((10, 4), (3, 13), (18, 13))
    top = _poly((10, 0), (5, 8), (16, 8))
    return {"T": trunk, "L": low, "M": mid, "U": top}, {"T": BROWN, "L": _ramp(52, 120, 56), "M": GREEN, "U": _ramp(116, 188, 82)}


def _hydrant() -> tuple[dict, dict]:
    body = _rect(6, 8, 15, 19)
    dome = _a(lambda d: d.ellipse((6, 3, 15, 12), fill=255))
    arms = _a(lambda d: (d.rectangle((2, 10, 18, 13), fill=255)))
    base = _rect(4, 17, 17, 20)
    nut = _rect(9, 1, 12, 3)
    return {"B": body, "A": arms, "D": dome, "S": base, "N": nut}, {"B": RED, "A": RED, "D": RED, "S": INK, "N": YELLOW}


def _moon() -> tuple[dict, dict]:
    moon = _disc(10, 11, 9.4) & ~_disc(14.5, 8, 8)
    stars = _a(lambda d: [d.point(p, fill=255) for p in ((17, 14), (19, 4), (14, 19))])
    return {"M": moon, "S": stars}, {"M": YELLOW, "S": PALE}


def _eye() -> tuple[dict, dict]:
    white = _poly((0, 11), (6, 5), (15, 5), (21, 11), (15, 17), (6, 17))
    white |= _a(lambda d: d.ellipse((2, 5, 19, 17), fill=255))
    iris = _disc(10.5, 11, 5.2)
    pupil = _disc(10.5, 11, 2.4)
    glint = _a(lambda d: d.rectangle((8, 8, 9, 9), fill=255))
    return {"W": white, "I": iris, "P": pupil, "G": glint}, {"W": PALE, "I": _ramp(60, 150, 100), "P": INK, "G": [PALE[3]] * 4}


def _coin(text: str, scale: int, left: int, top: int) -> tuple[dict, dict]:
    disc = _disc(11, 11, 10.4)
    rim = disc & ~_disc(11, 11, 8.2)
    return {"D": disc, "R": rim, "T": _text(text, (left, top), scale)}, {"D": GOLD_, "R": _ramp(214, 168, 56), "T": _ramp(120, 84, 24)}


def _halo() -> tuple[dict, dict]:
    parts = _roach(22, 11)
    shifted = {}
    for k, m in parts.items():
        placed = np.zeros((ACH, ACH), bool)
        placed[9:20, :] = m[:, :ACH]
        shifted[k] = placed
    ring = _a(lambda d: d.ellipse((5, 0, 16, 5), outline=255, width=2))
    dark = _ramp(98, 62, 36)
    tones = {"A": dark, "G": dark, "W": BROWN, "S": INK, "P": _ramp(158, 108, 64), "X": INK, "H": _ramp(158, 108, 64), "E": INK}
    return {**shifted, "O": ring}, {**tones, "O": GOLD_}


def _peak() -> tuple[dict, dict]:
    rock = _poly((0, 20), (8, 6), (12, 10), (15, 4), (21, 20))
    snow = _poly((8, 6), (5, 11), (8, 10), (10, 12), (12, 10)) | _poly((15, 4), (12, 9), (14, 8), (16, 10), (18, 9))
    pole = _rect(15, 0, 15, 4)
    flag = _rect(16, 0, 19, 2)
    return {"R": rock, "S": snow & rock, "P": pole, "F": flag}, {"R": _ramp(112, 104, 120), "S": PALE, "P": INK, "F": RED}


def _flame() -> tuple[dict, dict]:
    outer = _poly((11, 0), (6, 8), (3, 13), (4, 18), (8, 21), (14, 21), (18, 18), (19, 12), (15, 6), (14, 11), (11, 7))
    mid = _poly((10, 9), (6, 14), (7, 18), (10, 20), (14, 20), (16, 17), (14, 13), (12, 15))
    core = _poly((10, 14), (8, 18), (10, 20), (13, 20), (13, 17))
    return {"O": outer, "M": mid, "C": core}, {"O": RED, "M": ORANGE, "C": YELLOW}


def _jar() -> tuple[dict, dict]:
    jar = _a(lambda d: d.rounded_rectangle((3, 5, 18, 21), radius=3, fill=255))
    fruit = _a(lambda d: d.rounded_rectangle((4, 9, 17, 20), radius=2, fill=255))
    lid = _rect(5, 1, 16, 5)
    label = _rect(7, 12, 14, 17)
    return {"J": jar, "F": fruit, "L": lid, "P": label}, {"J": GLASS, "F": RED, "L": GOLD_, "P": PALE}


def _cycle() -> tuple[dict, dict]:
    ring = _a(lambda d: (d.arc((1, 1, 20, 20), 200, 330, fill=255, width=3), d.arc((1, 1, 20, 20), 20, 150, fill=255, width=3)))
    heads = _poly((15, 0), (21, 5), (14, 7)) | _poly((6, 21), (0, 16), (7, 14))
    return {"R": ring, "H": heads}, {"R": PURPLE, "H": PURPLE}


def _shield() -> tuple[dict, dict]:
    outer = _poly((1, 2), (20, 2), (20, 11), (16, 17), (10, 21), (5, 17), (1, 11))
    inner = _poly((4, 5), (17, 5), (17, 11), (14, 15), (10, 18), (7, 15), (4, 11))
    spark = _a(lambda d: (d.line((10, 7, 10, 15), fill=255), d.line((6, 11, 14, 11), fill=255)))
    return {"O": outer, "I": inner, "S": spark}, {"O": STEEL_, "I": BLUE, "S": PALE}


def _medal4() -> tuple[dict, dict]:
    ribbon = _poly((4, 0), (10, 0), (13, 10), (8, 10)) | _poly((17, 0), (11, 0), (8, 10), (13, 10))
    disc = _disc(11, 14, 7.4)
    rim = disc & ~_disc(11, 14, 5.4)
    return {"R": ribbon, "D": disc, "E": rim, "T": _text("4", (9, 11))}, {"R": RED, "D": GOLD_, "E": _ramp(214, 168, 56), "T": _ramp(120, 84, 24)}


def _map() -> tuple[dict, dict]:
    sheet = _poly((1, 4), (7, 2), (14, 4), (20, 2), (20, 18), (14, 20), (7, 18), (1, 20))
    folds = _a(lambda d: (d.line((7, 2, 7, 18), fill=255), d.line((14, 4, 14, 20), fill=255)))
    trail = _a(lambda d: [d.point(p, fill=255) for p in ((3, 15), (5, 13), (8, 12), (10, 14), (12, 12), (13, 9))])
    cross = _a(lambda d: (d.line((14, 6, 18, 10), fill=255), d.line((18, 6, 14, 10), fill=255)))
    return {"M": sheet, "F": folds & sheet, "T": trail, "X": cross}, {"M": SAND, "F": _ramp(176, 160, 120), "T": INK, "X": RED}


def _shell() -> tuple[dict, dict]:
    """The empty wing cases and shield of a moulted roach, seen from above."""
    cases = _a(lambda d: d.ellipse((3, 4, 18, 21), fill=255))
    shield = _a(lambda d: d.ellipse((5, 0, 16, 7), fill=255))
    seam = _rect(10, 7, 10, 20) & cases
    shine = _a(lambda d: d.line((6, 12, 7, 8), fill=255)) & cases
    return {"C": cases, "P": shield, "S": seam, "H": shine}, {"C": _ramp(150, 100, 58), "P": _ramp(176, 124, 72), "S": INK, "H": _ramp(206, 160, 108)}


def _burst() -> tuple[dict, dict]:
    pts = []
    for i in range(16):
        r = 10.6 if i % 2 == 0 else 5.2
        a = np.pi * 2 * i / 16 - np.pi / 2
        pts.append((11 + r * np.cos(a), 11 + r * np.sin(a)))
    star = _poly(*pts)
    return {"S": star, "C": _disc(11, 11, 4.2)}, {"S": ORANGE, "C": YELLOW}


def _peace() -> tuple[dict, dict]:
    ring = _a(lambda d: d.ellipse((1, 1, 20, 20), outline=255, width=3))
    cross = _a(lambda d: (d.line((10, 2, 10, 19), fill=255, width=2), d.line((10, 11, 4, 17), fill=255, width=2),
                          d.line((11, 11, 17, 17), fill=255, width=2)))
    return {"R": ring, "C": cross & _disc(10.5, 10.5, 9)}, {"R": GREEN, "C": GREEN}


def _pin() -> tuple[dict, dict]:
    pin = _disc(11, 8, 8) | _poly((4, 12), (18, 12), (11, 21))
    return {"P": pin, "H": _disc(11, 8, 3)}, {"P": RED, "H": PALE}


def _wardrobe() -> tuple[dict, dict]:
    box = _rect(3, 1, 18, 19)
    doors = _rect(5, 3, 16, 17)
    split = _rect(10, 3, 10, 17)
    knobs = _a(lambda d: (d.rectangle((8, 9, 8, 11), fill=255), d.rectangle((12, 9, 12, 11), fill=255)))
    feet = _a(lambda d: (d.rectangle((4, 19, 6, 20), fill=255), d.rectangle((15, 19, 17, 20), fill=255)))
    return {"B": box, "D": doors, "S": split, "K": knobs, "F": feet}, {"B": WOOD, "D": BROWN, "S": INK, "K": GOLD_, "F": WOOD}


def _chat() -> tuple[dict, dict]:
    one = _a(lambda d: d.rounded_rectangle((0, 1, 13, 10), radius=2, fill=255)) | _poly((2, 9), (6, 9), (2, 14))
    two = _a(lambda d: d.rounded_rectangle((8, 9, 21, 18), radius=2, fill=255)) | _poly((19, 17), (15, 17), (19, 21))
    return {"A": one, "B": two}, {"A": BLUE, "B": GREEN}


def _crown() -> tuple[dict, dict]:
    body = _poly((1, 17), (1, 5), (6, 11), (11, 2), (16, 11), (21, 5), (21, 17))
    band = _rect(1, 15, 20, 19)
    gems = _a(lambda d: [d.rectangle((x, 16, x + 1, 17), fill=255) for x in (4, 10, 16)])
    return {"C": body, "B": band, "G": gems}, {"C": GOLD_, "B": _ramp(214, 168, 56), "G": RED}


def _trophy_colour() -> tuple[dict, dict]:
    parts = _rows(TROPHY)
    shine = parts.pop("L")
    parts["C"] = parts["C"] | shine
    parts = _centred(parts)
    return parts, {"H": _ramp(214, 168, 56), "R": GOLD_, "C": GOLD_, "S": _ramp(214, 168, 56), "B": WOOD}


def _gun_colour() -> tuple[dict, dict]:
    slide = _rect(1, 5, 20, 9)
    barrel = _rect(1, 10, 14, 11)
    grip = _poly((2, 10), (8, 10), (9, 20), (3, 20))
    guard = _a(lambda d: d.arc((8, 9, 15, 16), 20, 160, fill=255))
    sight = _rect(19, 3, 20, 4)
    return {"G": grip, "B": barrel, "A": guard, "S": slide, "T": sight}, {"G": WOOD, "B": STEEL_, "A": STEEL_, "S": _ramp(104, 112, 126), "T": STEEL_}


def _clock() -> tuple[dict, dict]:
    face = _disc(11, 11, 10.4)
    rim = face & ~_disc(11, 11, 8.4)
    hands = _a(lambda d: (d.line((11, 11, 11, 5), fill=255), d.line((11, 11, 15, 13), fill=255)))
    ticks = _a(lambda d: [d.point(p, fill=255) for p in ((11, 3), (11, 19), (3, 11), (19, 11))])
    return {"F": face, "R": rim, "T": ticks & ~rim, "H": hands}, {"F": PALE, "R": STEEL_, "T": INK, "H": INK}


def _star() -> tuple[dict, dict]:
    pts = []
    for i in range(10):
        r = 10.4 if i % 2 == 0 else 4.4
        a = np.pi * 2 * i / 10 - np.pi / 2
        pts.append((11 + r * np.cos(a), 11.6 + r * np.sin(a)))
    return {"S": _poly(*pts)}, {"S": GOLD_}


def _unknown() -> tuple[dict, dict]:
    disc = _disc(11, 11, 10)
    mark = _a(lambda d: (d.arc((6, 3, 15, 11), 180, 40, fill=255, width=2), d.line((11, 11, 11, 13), fill=255, width=2),
                         d.rectangle((10, 16, 11, 17), fill=255)))
    return {"D": disc, "Q": mark}, {"D": _ramp(66, 58, 70), "Q": _ramp(150, 138, 140)}


ACH_ICONS = {
    "shoe": _shoe, "roach": _roach_colour, "warning": _warning, "bolt": _bolt, "wall": _wall, "calendar": _calendar_colour,
    "clipboard": _clipboard, "infinity": _infinity, "tree": _tree, "hydrant": _hydrant, "moon": _moon, "eye": _eye,
    "coin-5k": lambda: _coin("5K", 1, 5, 8), "coin-10k": lambda: _coin("10K", 1, 5, 8), "halo": _halo, "peak": _peak, "flame": _flame,
    "jar": _jar, "cycle": _cycle, "shield": _shield, "medal-4": _medal4, "map": _map, "shell": _shell, "burst": _burst,
    "peace": _peace, "pin": _pin, "wardrobe": _wardrobe, "chat": _chat, "crown": _crown, "trophy": _trophy_colour,
    "gun": _gun_colour, "clock": _clock, "star": _star, "unknown": _unknown,
}


# Where each boss's head is in its portrait (art/sprites/bosses, read as portraits.py does): the square window x, y, side
BOSS_HEADS = {"lodzia": (0, 0, 100, 0xd9578f), "bigos": (4, 0, 114, 0x9b5cff), "zlewiatan": (0, 0, 112, 0x2fb9a0),
              "eksterminator": (4, 0, 104, 0xd8d03a)}


def _sprite_on_canvas(rgba: np.ndarray, disc: np.ndarray | None = None) -> Image.Image:
    """Pixels of any size, centred on the 24 texel canvas with the icons' shadow one texel down and right."""
    size = ACH + PAD * 2
    h, w = rgba.shape[:2]
    img = np.zeros((size, size, 4), np.uint8)
    oy, ox = (size - h) // 2, (size - w) // 2
    solid = np.zeros((size, size), bool)
    solid[oy:oy + h, ox:ox + w] = rgba[..., 3] > 0
    img[_shift(solid, 1, 1) & ~solid] = SHADOW
    img[oy:oy + h, ox:ox + w][rgba[..., 3] > 0] = rgba[rgba[..., 3] > 0]
    return Image.fromarray(img)


def _head(name: str) -> Image.Image:
    """A boss's head: the portrait cut to its head, averaged down to the icon's size and brightened, on a disc in his colour."""
    import portraits
    from PIL import ImageEnhance
    x, y, side, accent = BOSS_HEADS[name]
    rgb = np.asarray(Image.open(portraits.SRC / f"{name}-portrait.png").convert("RGB"))
    texels = portraits.reduce(rgb, portraits.background(rgb))
    portraits.defringe(texels)
    texels = portraits.crop(texels)
    window = np.zeros((side, side, 4), np.uint8)
    cut = texels[y:y + side, x:x + side]
    window[:cut.shape[0], :cut.shape[1]] = cut
    alpha = window[..., 3:4] / 255.0
    near = Image.fromarray((window[..., :3] * alpha).astype(np.uint8)).resize((ACH - 2, ACH - 2), Image.BOX)
    cover = np.asarray(Image.fromarray(window[..., 3]).resize((ACH - 2, ACH - 2), Image.BOX)).astype(float) / 255
    colour = np.where(cover[..., None] > 0, np.asarray(near) / np.maximum(cover[..., None], 1e-3), 0)
    pic = Image.fromarray(np.clip(colour, 0, 255).astype(np.uint8))
    for enhance, amount in ((ImageEnhance.Brightness, 1.35), (ImageEnhance.Contrast, 1.25), (ImageEnhance.Color, 1.2)):
        pic = enhance(pic).enhance(amount)
    head = np.zeros((ACH, ACH, 4), np.uint8)
    head[1:-1, 1:-1, :3] = np.asarray(pic)
    head[1:-1, 1:-1, 3] = (cover > .5) * 255
    r, g, b = accent >> 16, (accent >> 8) & 255, accent & 255
    backing = _disc(ACH / 2, ACH / 2, ACH / 2 - .4)
    out = np.zeros((ACH, ACH, 4), np.uint8)
    rim = backing & ~_disc(ACH / 2, ACH / 2, ACH / 2 - 2)
    out[backing] = (r * .3, g * .3, b * .3, 255)
    out[rim] = (r * .8, g * .8, b * .8, 255)
    top = head[..., 3] > 0
    out[top] = head[top]
    return _sprite_on_canvas(out)


def _pickup(frame: Image.Image) -> Image.Image:
    """A pickup's own art (frame 0, its glow dropped) at the icon's size: shrunk on the 8x grid when it is taller than the canvas."""
    rgba = np.asarray(frame).copy()
    solid = rgba[..., 3] == 255
    ys, xs = np.nonzero(solid)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    rgba[~solid[ys.min():ys.max() + 1, xs.min():xs.max() + 1]] = 0
    scale = min(1, ACH / max(rgba.shape[:2]))
    if scale < 1:
        w, h = round(rgba.shape[1] * scale), round(rgba.shape[0] * scale)
        big = Image.fromarray(pixels.up(rgba, 8)).resize((w * 8, h * 8), Image.NEAREST)
        rgba = pixels.down(np.asarray(big), 8)
    return _sprite_on_canvas(rgba)


def ach_frames(sheet: dict | None) -> dict[str, tuple[list[Image.Image], tuple[float, float]]]:
    """The achievements' icons. `sheet` is the bake's animations so far: the apple, beer and pill icons are the pickups' own art."""
    out = {f"ach-{name}": ([Image.fromarray(_render(*make()))], (.5, .5)) for name, make in ACH_ICONS.items()}
    for name, art in (("apple", "apple"), ("beer", "beer-1"), ("pill", "pill")):
        if sheet is not None:   # the preview below has no bake behind it, so no pickups
            out[f"ach-{name}"] = ([_pickup(sheet[art][0][0])], (.5, .5))
    for name in BOSS_HEADS:
        out[f"ach-boss-{name}"] = ([_head(name)], (.5, .5))
    return out


ICONS = {"roach": _roach_icon, "roaches": _roaches_icon, "calendar": _calendar, "trophy": _trophy, "podium": _podium,
         "hanger": _hanger, "cog": _cog, "flag": _flag, "info": _info, "stats": _stats, "back": _back,
         "crumb": _crumb}


def _render(parts: dict, tones: dict) -> np.ndarray:
    """The picture on a transparent frame: parts painted in the order of tones, each lit top-left and dark bottom-right,
    and a shadow one texel down and right behind the lot."""
    h, w = next(iter(parts.values())).shape
    img = np.zeros((h + PAD * 2 + h % 2, w + PAD * 2 + w % 2, 4), np.uint8)   # an even size, so it centres on the pixel grid

    def place(mask: np.ndarray) -> np.ndarray:
        out = np.zeros(img.shape[:2], bool)
        out[PAD:PAD + h, PAD:PAD + w] = mask
        return out

    placed = {key: place(parts[key]) for key in tones if key in parts}
    solid = np.zeros(img.shape[:2], bool)
    for m in placed.values():
        solid |= m
    img[_shift(solid, 1, 1) & ~solid] = SHADOW
    for key, m in placed.items():
        top, left = m & ~_shift(m, 0, 1), m & ~_shift(m, 1, 0)
        bottom, right = m & ~_shift(m, 0, -1), m & ~_shift(m, -1, 0)
        idx = np.full(m.shape, 2)
        idx[top | left] = 3
        idx[bottom | right] = 1
        idx[(top | left) & (bottom | right)] = 2   # a line one texel thin keeps its body colour
        _paint(img, m, idx, tones[key])
    return img


def frames(sheet: dict | None = None) -> dict[str, tuple[list[Image.Image], tuple[float, float]]]:
    out = {}
    for name, make in ICONS.items():
        parts, tones = make()
        lit = {k: LIT_CREAM if v is CREAM else _dim(LIT_CREAM) if v == _dim(CREAM) else v for k, v in tones.items()}
        out[f"btn-{name}"] = ([Image.fromarray(_render(parts, tones)), Image.fromarray(_render(parts, lit))], (.5, .5))
    parts, tones = _badge()
    out["btn-badge"] = ([Image.fromarray(_render(parts, tones))], (.5, .5))
    out.update(ach_frames(sheet))
    return out


if __name__ == "__main__":
    # A sheet of every icon at 6x on the menu's slab colour, idle above and lit below: python3 tools/art/icons.py <out.png>
    import sys

    scale, gap = 6, 4
    sheet_frames = frames()
    width = sum(f[0][0].width for f in sheet_frames.values()) + gap * (len(sheet_frames) + 1)
    height = max(f[0][0].height for f in sheet_frames.values())
    sheet = Image.new("RGBA", (width * scale, (height * 2 + gap * 3) * scale), (21, 16, 13, 255))
    x = gap
    for name, (fs, _) in sheet_frames.items():
        for row, f in enumerate(fs):
            sheet.alpha_composite(f.resize((f.width * scale, f.height * scale), Image.NEAREST), (x * scale, (gap + row * (height + gap)) * scale))
        x += fs[0].width + gap
    sheet.convert("RGB").save(sys.argv[1] if len(sys.argv) > 1 else "icons.png")
