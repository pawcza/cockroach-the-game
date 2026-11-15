"""The home screen's icons: small pictures for the menu buttons, drawn like the touch buttons' (buttons.py).

Procedural, at native size (one texel = SPRITE_SCALE px in the game), light from the top left, no outline: each part is
lit along its top and left edges, dark along its right and underside, and casts a translucent shadow one texel down and
right. Cream on the menu's dark slabs, since the slab is the button; a second, lit frame in the focus text's warm white
for the focused button. Frames are named btn-<name>, frame 0 idle and 1 lit, pivot in the middle (the transparent
texel around each keeps the shadow in). src/ui/shared.ts createButton draws them.
"""
import numpy as np
from PIL import Image, ImageDraw

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


def _badge() -> tuple[dict, dict]:
    ys, xs = np.mgrid[0:7, 0:7] + .5
    return {"B": np.hypot(xs - 3.5, ys - 3.5) <= 3.4}, {"B": GOLD}


ICONS = {"roach": _roach_icon, "roaches": _roaches_icon, "calendar": _calendar, "trophy": _trophy, "podium": _podium,
         "hanger": _hanger, "cog": _cog, "flag": _flag, "info": _info}


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


def frames() -> dict[str, tuple[list[Image.Image], tuple[float, float]]]:
    out = {}
    for name, make in ICONS.items():
        parts, tones = make()
        lit = {k: LIT_CREAM if v is CREAM else _dim(LIT_CREAM) if v == _dim(CREAM) else v for k, v in tones.items()}
        out[f"btn-{name}"] = ([Image.fromarray(_render(parts, tones)), Image.fromarray(_render(parts, lit))], (.5, .5))
    parts, tones = _badge()
    out["btn-badge"] = ([Image.fromarray(_render(parts, tones))], (.5, .5))
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
