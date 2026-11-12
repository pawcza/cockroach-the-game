"""The gun act's enemies (levels 7-10: the gull, the jewel wasp, the bug zapper, the robot vacuum, the ultrasonic
repeller, the aerosol can, the poison bait) and the ammo box the course lays for the run's pistol.

The enemies come from their picked stills in art/sprites/enemies, each read at its own pixel grid (pixels.at_size) and
posed on the native image blown up 8x and read back (hopact._pose), so they stay on the texel grid. Two renders of one
enemy that sit on different grids are scaled to match. The ammo box is drawn here, texel by texel, like the buttons.
"""
import numpy as np
from PIL import Image

from hopact import _canvas, _pose, _still


def _shifted(a: np.ndarray, dy: int) -> np.ndarray:
    """The same frame a texel or two lower in a canvas that tall again: a shudder, a bob."""
    out = np.zeros((a.shape[0] + abs(dy), a.shape[1], 4), np.uint8)
    out[max(0, dy):max(0, dy) + a.shape[0]] = a
    return out


def _brighter(a: np.ndarray, amount: float) -> np.ndarray:
    out = a.astype(float)
    out[..., :3] += (255 - out[..., :3]) * amount
    return out.astype(np.uint8)


def gull() -> list[Image.Image]:
    """Gliding, wings up, and diving, beak open: it faces left, at the runner."""
    return _canvas([_still("gull", 1), _still("gull-dive", 1)])


def wasp() -> list[Image.Image]:
    """Hovering (twice, a texel apart: it buzzes in place), then diving sting first. Smaller than its render's grid."""
    hover = _pose(_still("wasp", 1), .7)
    dive = _pose(_still("wasp-dive", 1), .7)
    return _canvas([hover, _shifted(hover, 1)[1:], dive])


def bug_zapper() -> list[Image.Image]:
    """The zapper's tube, dim; and lit with a bolt inside it (that render is on a finer grid: scaled to match). Both up
    a little from the grid: it hangs over a lane at speed."""
    off = _pose(_still("bug-zapper", 1), 1.4)
    on = _still("bug-zapper-zap", 1)
    on = _pose(on, off.shape[0] / on.shape[0])
    return _canvas([off, on], anchor="top")


def repeller() -> list[Image.Image]:
    """The plug-in repeller, and the same lit up as it lets a ring go."""
    r = _pose(_still("repeller", 1), 1.25)
    return _canvas([r, _brighter(r, .35)])


def robot_vacuum() -> list[Image.Image]:
    """Driving (a texel's shudder), then cracked and smoking after the first shot, also shuddering."""
    whole = _still("robot-vacuum", 1)
    broken = _still("robot-vacuum-broken", 1)
    broken = _pose(broken, whole.shape[1] / broken.shape[1] * 1.05)
    return _canvas([_shifted(whole, 1), _shifted(whole, -1), _shifted(broken, 1), _shifted(broken, -1)])


def aerosol() -> list[Image.Image]:
    """The can standing, the can rattling (the fuse after a shot), and bursting."""
    can = _pose(_still("aerosol", 1), 1.25)
    burst = _pose(_still("aerosol-explosion", 1), 1.25)
    return _canvas([can, _pose(can, tilt=6), burst])


def bait() -> list[Image.Image]:
    """The bowl of poison gel, and a frame with the gel catching the light: it glints, tempting."""
    b = _pose(_still("bait", 1), .5)
    glint = b.copy()
    h, w = glint.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    band = (abs(xs - ys * 1.5 - w * .45) < 2) & (ys < h * .45) & (glint[..., 3] > 0)
    glint[band, :3] = np.minimum(255, glint[band, :3].astype(int) + 110)
    return _canvas([b, glint])


# The ammo box's colours: outline, olive (lit, mid, shade), brass (lit, mid, dark), the stencilled band
INK = (28, 28, 20, 255)
OLIVE = [(132, 142, 72, 255), (100, 110, 54, 255), (70, 78, 38, 255)]
BRASS = [(255, 236, 160, 255), (214, 160, 62, 255), (140, 96, 34, 255)]
BAND = (226, 214, 164, 255)


def _box(lit: bool) -> np.ndarray:
    """An olive crate 20 texels wide with three brass rounds standing in it, lit from the top left."""
    w, h = 20, 19
    a = np.zeros((h, w, 4), np.uint8)
    # Three rounds: a pointed tip, a brass case with a lit left edge and a dark right one
    for x0 in (4, 8, 12):
        a[0, x0 + 1] = INK
        a[1, x0:x0 + 3] = INK
        a[1, x0 + 1] = BRASS[0]
        for y in range(2, 8):
            a[y, x0] = BRASS[0] if lit else BRASS[1]
            a[y, x0 + 1] = BRASS[1]
            a[y, x0 + 2] = BRASS[2]
        a[2:8, x0 - 1] = INK
        a[2:8, x0 + 3] = INK
    # The crate: its lid's lip, the body, a band across it, a darker foot, the outline round it all
    top = 7
    a[top:h, 0:w] = INK
    a[top + 1, 1:w - 1] = OLIVE[0]
    a[top + 2:h - 2, 1:w - 1] = OLIVE[1]
    a[top + 2:h - 2, 1] = OLIVE[0]
    a[top + 2:h - 2, w - 2] = OLIVE[2]
    a[h - 2, 1:w - 1] = OLIVE[2]
    a[top + 4:top + 7, 3:w - 3] = BAND
    for x in (6, 9, 12):
        a[top + 5, x:x + 2] = INK
    a[h - 1, 0] = a[h - 1, w - 1] = (0, 0, 0, 0)
    return a


def ammo() -> list[Image.Image]:
    """The ammo box, and the same with its rounds catching the light."""
    return [Image.fromarray(_box(False)), Image.fromarray(_box(True))]


GUNACT = {
    "gull": gull,
    "wasp": wasp,
    "bug-zapper": bug_zapper,
    "repeller": repeller,
    "robot-vacuum": robot_vacuum,
    "aerosol": aerosol,
    "bait": bait,
}

# Pickups: the green glow, not the enemies' red
GUNACT_PICKUPS = {"ammo": ammo}
