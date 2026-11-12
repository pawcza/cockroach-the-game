"""Shared by the bosses rigged from one pixel-art still (lodzia.py, eksterminator.py).

The stills are pixel art on an exact 8 px grid, read at that grid: one painted pixel per texel. Parts are cut from the
native image, posed at 8x after a Scale2x upscale and every canvas pixel is sampled at its centre from that (RotSprite),
so turned parts stay crisp pixel art. What a cut part hid is filled from the paint round it, snapped to the painting's
palette. The painted rim light is taken off a part and put back per frame on whichever edge then faces the light.
"""
import math
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

K = 8                    # the paintings' pixel grid
BG = (52, 56, 66, 255)   # the previews' mid-dark ground


# ---------------------------------------------------------------- cutting

def poly(points, size=128) -> np.ndarray:
    """A polygon in painting px, rasterised at 8x and read at pixel centres."""
    mask = np.zeros((size * K, size * K), np.uint8)
    cv2.fillPoly(mask, [np.int32(np.array(points) * K)], 1)
    return mask[K // 2::K, K // 2::K] > 0


def scale2x(a: np.ndarray) -> np.ndarray:
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    b, d, f, h = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 2:], p[2:, 1:-1]
    eq = lambda x, y: (x == y).all(-1)  # noqa: E731
    bd, bf, dh, hf = eq(b, d), eq(b, f), eq(d, h), eq(h, f)
    bh, df = eq(b, h), eq(d, f)
    live = ~bh & ~df
    e0 = np.where((live & bd)[..., None], d, a)
    e1 = np.where((live & bf)[..., None], f, a)
    e2 = np.where((live & dh)[..., None], d, a)
    e3 = np.where((live & hf)[..., None], f, a)
    out = np.zeros((a.shape[0] * 2, a.shape[1] * 2, a.shape[2]), a.dtype)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e0, e1, e2, e3
    return out


def big(rgba: np.ndarray) -> np.ndarray:
    """8x for posing: Scale2x three times keeps diagonals clean when a part turns."""
    a = rgba.copy()
    a[a[..., 3] < 128] = 0
    for _ in range(3):
        a = scale2x(a)
    return a


def is_rim(rgb: np.ndarray) -> np.ndarray:
    """The paintings' warm rim light."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (r > 165) & (r - b > 60) & (r - g > 35)


def fill(rgba: np.ndarray, known: np.ndarray, want: np.ndarray, pal: np.ndarray) -> np.ndarray:
    """Colours for the want pixels from the known ones round them, snapped to the painting's palette."""
    rgb = np.ascontiguousarray(rgba[..., :3])
    holes = (~known).astype(np.uint8) * 255
    painted = cv2.inpaint(rgb, holes, 4, cv2.INPAINT_TELEA)
    out = rgba.copy()
    out[want, :3] = snap(painted[want], pal)
    out[want, 3] = 255
    return out


def snap(pixels: np.ndarray, pal: np.ndarray) -> np.ndarray:
    d = ((pixels[:, None, :].astype(int) - pal[None, :, :].astype(int)) ** 2).sum(2)
    return pal[d.argmin(1)]


def palette(pixels: np.ndarray, n: int = 40) -> np.ndarray:
    data = pixels.astype(np.float32)
    _, labels, centres = cv2.kmeans(data, n, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 1,
                                    cv2.KMEANS_PP_CENTERS)
    return np.clip(centres, 0, 255).astype(np.uint8)


@dataclass
class Part:
    name: str
    image: np.ndarray            # painting-sized RGBA, native
    big: np.ndarray = None       # the same at 8x
    rim: tuple = None            # its own rim colour, when it is relit per frame


def strip(native: np.ndarray, rgba: np.ndarray, mask: np.ndarray, pal: np.ndarray):
    """The painted rim light along a part's edge, taken off: it is put back per frame on whichever edge then faces
    the light, so a part that turns doesn't carry a lit edge round to its dark side. Returns the part, its rim colour
    and the pixels taken."""
    outside = native[..., 3] < 128
    out1 = np.pad(outside, ((0, 0), (1, 0)), constant_values=True)[:, :-1]
    out2 = np.pad(outside, ((0, 0), (2, 0)), constant_values=True)[:, :-2]
    rim_px = mask & (out1 | out2) & is_rim(rgba[..., :3])  # the lit silhouette only; rims inside stay painted
    if not rim_px.any():
        return rgba, (236, 120, 80, 255), rim_px
    rim = tuple(int(v) for v in np.median(rgba[rim_px][:, :3], 0)) + (255,)
    out = fill(rgba, mask & ~rim_px, rim_px, pal)
    out[~mask, 3] = 0
    return out, rim, rim_px


# ---------------------------------------------------------------- geometry

def rot(deg: float) -> np.ndarray:
    """Clockwise on screen (y down) for positive degrees."""
    a = math.radians(deg)
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def unwarp(warp, qx, qy, steps=14):
    """The inverse of a body warp by fixed-point iteration: painting px for each warped point."""
    x, y = qx.copy(), qy.copy()
    for _ in range(steps):
        fx, fy = warp(x, y)
        x, y = x + (qx - fx), y + (qy - fy)
    return x, y


@dataclass(frozen=True)
class Canvas:
    """A frame's canvas: the painting's (0, 0) sits at (ox, oy), native px."""
    ox: int
    oy: int
    w: int
    h: int

    def affine(self, m: np.ndarray) -> np.ndarray:
        """cv2 matrix from a part's 8x image to the canvas, from a 3x3 painting px -> canvas painting px affine."""
        lin, t = m[:2, :2], m[:2, 2]
        out = np.zeros((2, 3))
        out[:, :2] = lin / K
        out[:, 2] = lin @ np.array([.5 / K, .5 / K]) + t + np.array([self.ox, self.oy]) - .5
        return out

    def warp(self, big_rgba: np.ndarray, m: np.ndarray) -> np.ndarray:
        """A part drawn straight at native size, each canvas pixel sampled at its centre from the 8x image."""
        return cv2.warpAffine(big_rgba, self.affine(m), (self.w, self.h), flags=cv2.INTER_NEAREST)

    def centres(self, g: np.ndarray):
        """Every canvas pixel centre in painting px, before G."""
        ginv = np.linalg.inv(g)
        ys, xs = np.mgrid[0:self.h, 0:self.w].astype(np.float64)
        qx, qy = xs + .5 - self.ox, ys + .5 - self.oy
        return (ginv[0, 0] * qx + ginv[0, 1] * qy + ginv[0, 2], ginv[1, 0] * qx + ginv[1, 1] * qy + ginv[1, 2])

    def body(self, g: np.ndarray, unwarp_fn, big_rgba: np.ndarray) -> np.ndarray:
        """A part bent by a smooth warp (unwarp_fn: canvas painting px -> the part's own px)."""
        px, py = self.centres(g)
        sx, sy = unwarp_fn(px, py)
        mx, my = (sx * K - .5).astype(np.float32), (sy * K - .5).astype(np.float32)
        return cv2.remap(big_rgba, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT,
                         borderValue=(0, 0, 0, 0))

    def point(self, g: np.ndarray, pt) -> np.ndarray:
        """A point before G, in canvas px."""
        return g[:2, :2] @ np.array(pt) + g[:2, 2] + [self.ox, self.oy]


def put(canvas: np.ndarray, owner: np.ndarray, x: int, y: int, colour, name: str = "fx") -> None:
    if 0 <= x < canvas.shape[1] and 0 <= y < canvas.shape[0]:
        canvas[y, x] = colour
        owner[y, x] = name


# ---------------------------------------------------------------- compositing and checks

def composite(layers, shape):
    """Layers (name, rgba), back to front: the canvas, who owns each pixel, and each layer's own solid mask."""
    masks = {}
    canvas = np.zeros(shape + (4,), np.uint8)
    owner = np.full(shape, "", object)
    for name, small in layers:
        solid = small[..., 3] > 128
        masks[name] = masks.get(name, np.zeros_like(solid)) | solid
        canvas[solid] = small[solid]
        owner[solid] = name
    return canvas, owner, masks


def relight(canvas: np.ndarray, owner: np.ndarray, order: list[str], colour_of, unlit=()) -> None:
    """The rim light, from ahead as in the paintings: on every part's edge that faces ahead with nothing in front.
    colour_of(layer) gives a layer's rim colour."""
    rank = {name: i for i, name in enumerate(order)}
    ranks = np.vectorize(lambda n: rank.get(n, -1), otypes=[int])(owner)
    lit_layers = {n for n in order if n not in unlit}
    left_rank = np.pad(ranks, ((0, 0), (1, 0)), constant_values=-1)[:, :-1]
    for name in lit_layers:
        mine = owner == name
        if not mine.any():
            continue
        colour = np.array(colour_of(name)[:3], float)
        lit = mine & (left_rank < 0)
        canvas[lit, :3] = (canvas[lit, :3] * .2 + colour * .8).astype(np.uint8)


def check(joints: dict, joint_map: dict, masks: dict, loose_ok, shape, thin=()) -> list[str]:
    """Each joint lies on both layers it joins (5 of the 9 pixels round it; 2 for thin layers, a 2 px pole or hose),
    and the figure is one piece: only the loose_ok layers may float."""
    failures = []
    for joint, point in joints.items():
        parent, child = joint_map[joint]
        x, y = int(round(point[0] - .5)), int(round(point[1] - .5))
        for layer in (parent, child):
            win = masks.get(layer, np.zeros(shape, bool))[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
            if win.sum() < (2 if layer in thin else 5):
                failures.append(f"{joint}: {layer} doesn't cover the joint ({win.sum()}/9)")
    figure = np.zeros(shape, bool)
    for name, mask in masks.items():
        if name not in loose_ok:
            figure |= mask
    labels, count = ni.label(figure, structure=np.ones((3, 3)))
    if count > 1:
        sizes = ni.sum(figure, labels, range(1, count + 1))
        loose = sorted(int(v) for v in sizes)[:-1]
        if any(v >= 3 for v in loose):
            failures.append(f"figure in {count} pieces, loose sizes {loose}")
    return failures


# ---------------------------------------------------------------- previews

def crop_box(images, floor_row: int) -> tuple[int, int, int, int]:
    """One box for every animation, so the floor and the feet never move between them."""
    box = [images[0].width, images[0].height, 0, 0]
    for image in images:
        b = image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
        if b:
            box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    return (box[0] - 2, box[1] - 2, box[2] + 2, max(box[3], floor_row) + 2)


def staged(image: Image.Image, box, floor_row: int, top_row: int, zoom=5, lanes=True, bg=BG) -> Image.Image:
    """On the mid-dark ground, the floor and the top lane's height marked faintly."""
    w, h = box[2] - box[0], box[3] - box[1]
    out = Image.new("RGBA", (w, h), bg)
    if lanes:
        d = ImageDraw.Draw(out)
        floor = floor_row - box[1]
        top = top_row - box[1]
        d.line([(0, floor), (w, floor)], fill=(84, 92, 104, 255))
        for x in range(0, w, 4):
            d.point((x, top), fill=(84, 92, 104, 255))
            d.point((x + 1, top), fill=(84, 92, 104, 255))
    out.alpha_composite(image.crop(box))
    return out.resize((w * zoom, h * zoom), Image.NEAREST)


def gif(path, images, durations) -> None:
    images[0].save(path, save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2,
                   optimize=False)


def sheet(path, rows, cell, stage, zoom=3) -> None:
    """One row per animation: rows of (name, fps, [(image, failed)]); stage(image, zoom) puts a frame on the ground."""
    width = max(len(f) for _, _, f in rows) * (cell[0] * zoom + 4) + 90
    out = Image.new("RGBA", (width, len(rows) * (cell[1] * zoom + 14)), (30, 32, 38, 255))
    d = ImageDraw.Draw(out)
    for r, (name, fps, frames) in enumerate(rows):
        y = r * (cell[1] * zoom + 14)
        d.text((4, y + 4), f"{name}\n{fps} fps\n{len(frames)} fr", fill=(230, 230, 230, 255))
        for i, (image, failed) in enumerate(frames):
            x = 90 + i * (cell[0] * zoom + 4)
            out.alpha_composite(stage(image, zoom), (x, y))
            bad = " !" if failed else ""
            d.text((x + 2, y + cell[1] * zoom + 1), f"{i}{bad}", fill=(255, 120, 120, 255) if bad else (160, 160, 160, 255))
    out.save(path)


def tile(rgba: np.ndarray, label: str, marks=(), zoom=5, pad=6) -> Image.Image:
    """A cut piece on its own on the ground, zoomed, the joints it turns about marked."""
    ys, xs = np.nonzero(rgba[..., 3] > 128)
    box = (xs.min() - pad, ys.min() - pad, xs.max() + pad + 1, ys.max() + pad + 1)
    out = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), BG)
    out.alpha_composite(Image.fromarray(rgba).crop(box))
    out = out.resize((out.width * zoom, out.height * zoom), Image.NEAREST)
    d = ImageDraw.Draw(out)
    for jx, jy in marks:
        cx, cy = (jx - box[0]) * zoom, (jy - box[1]) * zoom
        d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), outline=(80, 255, 120, 255), width=2)
    d.text((4, 4), label, fill=(255, 255, 255, 255))
    return out


def tiles_sheet(path, tiles) -> None:
    width = sum(t.width + 8 for t in tiles)
    height = max(t.height for t in tiles)
    out = Image.new("RGBA", (width, height), (30, 32, 38, 255))
    x = 0
    for t in tiles:
        out.alpha_composite(t, (x, 0))
        x += t.width + 8
    out.save(path)


def two_bone(s, t, l1: float, l2: float, elbow: int, max_stretch: float):
    """A two-bone limb from shoulder s reaching for t: elbow and wrist, and how far the limb had to stretch (a cartoon
    arm stretches a little rather than leave the hand short). elbow picks the side the elbow goes, 1 or -1."""
    s, t = np.asarray(s, float), np.asarray(t, float)
    d = float(np.linalg.norm(t - s))
    reach = l1 + l2
    stretch = 1.0
    if d > reach * .98:
        stretch = min(d / (reach * .98), max_stretch)
    l1, l2 = l1 * stretch, l2 * stretch
    d = min(d, (l1 + l2) * .999)
    base = math.atan2(t[1] - s[1], t[0] - s[0])
    cos_a = max(-1, min(1, (l1 ** 2 + d ** 2 - l2 ** 2) / (2 * l1 * d)))
    e_ang = base + elbow * math.acos(cos_a)
    e = s + l1 * np.array([math.cos(e_ang), math.sin(e_ang)])
    w = s + d * np.array([math.cos(base), math.sin(base)])
    return e, w, stretch
