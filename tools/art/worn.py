"""Things a roach wears, from the shop's renders (art/sprites/shop/<part>.png, chosen from tools/art/comfy.py output):
each becomes its own small looping animation, built at render size and box-filtered down once.

An item's frames all share one canvas, with its attach point (where it meets the roach's head, back or tail) at the
same place in every frame; the bake writes that point as the frame's pivot, and the game pins it to the anchor.
Ids match src/config/skins.ts and server/economy.ts.
"""
import math
from dataclasses import dataclass
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from rig import cut_white

SHOP = "art/sprites/shop"


def _box(image: Image.Image) -> tuple[int, int, int, int] | None:
    """What's drawn: by alpha alone. A cut-out keeps its white under transparent pixels, which getbbox() would count."""
    return image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()


def part(name: str) -> Image.Image:
    """A render cut from its white background and trimmed to what's left."""
    image = Image.fromarray(cut_white(f"{SHOP}/{name}.png", erode=1))
    image = image.crop(image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox())
    # Clear what the cut made transparent, so nothing downstream sees its leftover white
    clean = Image.new("RGBA", image.size)
    clean.paste(image, (0, 0), image.getchannel("A"))
    return clean


@dataclass
class Frames:
    """Frames at render size, and the attach point in them (render px)."""
    images: list[Image.Image]
    attach: tuple[float, float]


def _canvas(layers: list[tuple[Image.Image, tuple[int, int]]], attach: tuple[float, float], size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size)
    for image, at in layers:
        canvas.alpha_composite(image, (int(at[0]), int(at[1])))
    return canvas


def _rotated(image: Image.Image, degrees: float, pivot: tuple[float, float]) -> tuple[Image.Image, tuple[int, int]]:
    """Turned about a point of itself, nearest sampling; returns the image and where its corner goes."""
    pad = int(math.hypot(*image.size)) + 2
    big = Image.new("RGBA", (pad * 2, pad * 2))
    big.alpha_composite(image, (int(pad - pivot[0]), int(pad - pivot[1])))
    return big.rotate(degrees, resample=Image.NEAREST, center=(pad, pad)), (-pad, -pad)


def static(name: str, attach: tuple[float, float]) -> Frames:
    """attach: as a fraction of the image (may be outside it)."""
    image = part(name)
    return _framed([[(image, (0, 0))]], (attach[0] * image.width, attach[1] * image.height))


def _framed(frames: list[list[tuple[Image.Image, tuple[int, int]]]], attach: tuple[float, float]) -> Frames:
    """Lays every frame's layers on one canvas that holds them all and the attach point, at the same offset."""
    xs = [attach[0]] + [at[0] for layers in frames for _, at in layers] + [at[0] + i.width for layers in frames for i, at in layers]
    ys = [attach[1]] + [at[1] for layers in frames for _, at in layers] + [at[1] + i.height for layers in frames for i, at in layers]
    left, top = math.floor(min(xs)), math.floor(min(ys))
    size = (math.ceil(max(xs)) - left + 1, math.ceil(max(ys)) - top + 1)
    images = [_canvas([(i, (at[0] - left, at[1] - top)) for i, at in layers], attach, size) for layers in frames]
    return Frames(images, (attach[0] - left, attach[1] - top))


def wobble(name: str, attach: tuple[float, float], degrees: float, count: int) -> Frames:
    """Rocks about its attach point: a party hat's tip, a balloon on its string."""
    image = part(name)
    pivot = (attach[0] * image.width, attach[1] * image.height)
    frames = []
    for i in range(count):
        turned, corner = _rotated(image, degrees * math.sin(i / count * math.tau), pivot)
        frames.append([(turned, (corner[0] + pivot[0], corner[1] + pivot[1]))])
    return _framed(frames, pivot)


def halo(name: str, count: int = 6) -> Frames:
    """Floats just over the head, glowing: a golden shine around it swells and fades, and a glint twinkles on it."""
    image = part(name)
    pad = image.height // 2
    alpha = Image.new("L", (image.width + pad * 2, image.height + pad * 2))
    alpha.paste(image.getchannel("A"), (pad, pad))
    blur = alpha.filter(ImageFilter.GaussianBlur(pad / 2.5))
    frames = []
    for i in range(count):
        wave = math.sin(i / count * math.tau)
        shine = blur.point(lambda a, k=.55 + .35 * wave: int(min(255, a * 1.8) * k))
        glow = Image.merge("RGBA", (*Image.new("RGB", blur.size, (255, 214, 90)).split(), shine))
        lit = ImageEnhance.Brightness(image).enhance(1.1 + .2 * wave)
        layers = [(glow, (-pad, -pad)), (lit, (0, 0))]
        if i in (1, 2):
            glint = Image.new("RGBA", (image.height, image.height))
            g = ImageDraw.Draw(glint)
            c, r = image.height // 2, image.height // 2 - 1
            g.line((c - r, c, c + r, c), fill=(255, 255, 240, 255), width=max(1, image.height // 10))
            g.line((c, c - r, c, c + r), fill=(255, 255, 240, 255), width=max(1, image.height // 10))
            layers.append((glint, (image.width * .72 - c, -c * .4)))
        frames.append([(layer, (at[0], at[1] + wave * image.height * .08)) for layer, at in layers])
    return _framed(frames, (image.width / 2, image.height * 1.05))


def propeller(cap_name: str, blade_name: str, count: int = 4) -> Frames:
    """A beanie whose propeller spins: the blade squeezed side to side as it turns."""
    cap, blade = part(cap_name), part(blade_name)
    blade = blade.resize((int(cap.width * .8), int(blade.height * cap.width * .8 / blade.width)), Image.NEAREST)
    tip = (cap.width / 2, 0)
    frames = []
    for i in range(count):
        squeeze = max(.08, abs(math.cos(i / count * math.pi)))
        spun = blade.resize((max(1, int(blade.width * squeeze)), blade.height), Image.NEAREST)
        frames.append([(cap, (0, blade.height * .6)), (spun, (tip[0] - spun.width / 2, 0))])
    return _framed(frames, (cap.width / 2, blade.height * .6 + cap.height * .92))


def exhaust(body_name: str, flame_name: str, body_attach: tuple[float, float], flame_at: tuple[float, float],
            flame_angle: float, flame_length: float = 1.6, count: int = 4) -> Frames:
    """Something with a flame that flickers: the flame stretches and shrinks out of its nozzle every frame.
    flame_at: where the flame starts, as a fraction of the body; the flame points left before flame_angle turns it."""
    body, flame = part(body_name), part(flame_name)
    reach = body.height * flame_length
    flame = flame.resize((int(reach), int(flame.height * reach / flame.width)), Image.NEAREST)
    root = (flame_at[0] * body.width, flame_at[1] * body.height)
    frames = []
    for length in (1.0, .7, 1.2, .85)[:count]:
        sized = flame.resize((max(1, int(flame.width * length)), flame.height), Image.NEAREST)
        turned, corner = _rotated(sized, flame_angle, (sized.width, sized.height / 2))
        frames.append([(turned, (root[0] + corner[0], root[1] + corner[1])), (body, (0, 0))])
    return _framed(frames, (body_attach[0] * body.width, body_attach[1] * body.height))


def foam(can_name: str, foam_name: str, count: int = 4) -> Frames:
    """A can with foam welling up over the top."""
    can, head = part(can_name), part(foam_name)
    head = head.resize((int(can.width * 1.1), int(head.height * can.width * 1.1 / head.width)), Image.NEAREST)
    frames = []
    for grow in (1.0, 1.12, 1.22, 1.1)[:count]:
        sized = head.resize((int(head.width * grow), int(head.height * grow)), Image.NEAREST)
        frames.append([(can, (0, 0)), (sized, (can.width / 2 - sized.width / 2, -sized.height * .6))])
    return _framed(frames, (can.width / 2, can.height * .95))


def wings(name: str, far: bool, count: int = 6) -> Frames:
    """One of a pair of fairy wings flapping from their root: the near one bright in front of the roach, the far one
    darker, behind it and a beat later. Two items worn together, so the body sits between them."""
    wing = part(name)
    root = (wing.width * .9, wing.height * .92)
    if far:
        wing = ImageEnhance.Brightness(wing).enhance(.6)
    frames = []
    for i in range(count):
        beat = 22 * math.sin(i / count * math.tau - .8) + 10 if far else 22 * math.sin(i / count * math.tau)
        turned, corner = _rotated(wing, beat, root)
        frames.append([(turned, (corner[0] + root[0] - (wing.width * .38 if far else 0), corner[1] + root[1]))])
    return _framed(frames, root)


def cape(name: str, count: int = 6) -> Frames:
    """A cape rippling in the wind: rows shift sideways in a wave that grows towards the free end."""
    image = np.asarray(part(name))
    height, width = image.shape[:2]
    frames = []
    for i in range(count):
        out = np.zeros_like(image)
        for x in range(width):
            free = 1 - x / width  # the right edge is tied on, the left flaps
            shift = int(round(math.sin(i / count * math.tau + x / width * 6) * height * .06 * free))
            out[:, x] = np.roll(image[:, x], shift, axis=0)
        frames.append([(Image.fromarray(out), (0, 0))])
    return _framed(frames, (width * .92, height * .1))


@dataclass
class Item:
    make: Callable[[], Frames]
    height: int  # native px the item is drawn at: its height, or its length when it lies along the roach
    anchor: str  # head, back or tail
    behind: bool = False
    fps: int = 8
    # Worn lying along the roach rather than standing up from it: mirrored first if asked, then turned (degrees,
    # anticlockwise) about its attach point, and sized by its length
    flip: bool = False
    turn: float = 0
    lying: bool = False
    # Where it rests on the anchor, as a fraction of its turned shape; None keeps the attach point it was made with
    rest: tuple[float, float] | None = None
    # Other items worn with it, such as the far wing of a pair behind the body
    companions: tuple[str, ...] = ()


ITEMS: dict[str, Item] = {
    # On the head: attach at the bottom middle (or the middle, for headphones)
    "czapka": Item(lambda: static("czapka", (.45, .92)), 9, "head"),
    "kowbojski": Item(lambda: static("kowbojski", (.5, .9)), 10, "head"),
    "wiking": Item(lambda: static("wiking", (.5, .92)), 13, "head"),
    "korona": Item(lambda: static("korona", (.5, .92)), 8, "head"),
    "cylinder": Item(lambda: static("cylinder", (.5, .95)), 13, "head"),
    "sluchawki": Item(lambda: static("sluchawki", (.5, .55)), 14, "head"),
    "imprezowa": Item(lambda: wobble("imprezowa", (.5, .95), 9, 6), 13, "head", fps=8),
    "aureola": Item(lambda: halo("aureola"), 14, "head", fps=6),
    "smiglo": Item(lambda: propeller("smiglo-czapka", "smiglo"), 12, "head", fps=16),
    # On the back and the rear
    # Tucked into the rear, behind the body, so it reads as fixed on rather than floating
    "rakieta": Item(lambda: exhaust("rakieta", "plomien", (.55, .5), (.05, .5), 0), 12, "tail", behind=True, fps=14),
    # On the side, just behind the thorax: a jetpack with its flame out back, a cape streaming back, and a pair of wings
    # with the body between them
    "plecak": Item(lambda: exhaust("plecak", "plomien", (.5, .9), (.5, .98), 90, flame_length=.7), 28, "side", fps=14,
                   turn=-90, lying=True, rest=(.62, .55)),
    "peleryna": Item(lambda: cape("peleryna"), 28, "side", fps=10, turn=-30, lying=True, rest=(.92, .3)),
    "skrzydla": Item(lambda: wings("skrzydlo", far=False), 30, "side", fps=14, flip=True, turn=90, lying=True,
                     rest=(.92, .7), companions=("skrzydla-tyl",)),
    "skrzydla-tyl": Item(lambda: wings("skrzydlo", far=True), 30, "side", behind=True, fps=14, flip=True, turn=90,
                         lying=True, rest=(.92, .7)),
    # On the back, lying along it and spraying foam out behind
    "piwo": Item(lambda: foam("piwo", "piana"), 22, "back", fps=6, turn=90, lying=True, rest=(.7, .8)),
    # Tied at the shoulder, floating up and a little back
    "balonik": Item(lambda: wobble("balonik", (.5, .98), 7, 8), 30, "shoulder", behind=True, fps=6, turn=25),
}


def _worn_as(frames: Frames, item: Item) -> Frames:
    """Mirrored, turned and rested as the item is worn."""
    images, attach = frames.images, frames.attach
    if item.flip:
        images = [image.transpose(Image.FLIP_LEFT_RIGHT) for image in images]
        attach = (images[0].width - attach[0], attach[1])
    if item.turn:
        layers = []
        for image in images:
            turned, corner = _rotated(image, item.turn, attach)
            layers.append([(turned, (corner[0] + attach[0], corner[1] + attach[1]))])
        frames = _framed(layers, attach)
        images, attach = frames.images, frames.attach
    if item.rest:
        left, top, right, bottom = _box(images[0])
        attach = (left + item.rest[0] * (right - left), top + item.rest[1] * (bottom - top))
        frames = _framed([[(image, (0, 0))] for image in images], attach)
        images, attach = frames.images, frames.attach
    return Frames(images, attach)


def bake(item: Item) -> tuple[list[Image.Image], tuple[float, float]]:
    """The item's frames at game size, trimmed to what any of them draws, and its attach point as a fraction of the
    frame (the pivot)."""
    frames = _worn_as(item.make(), item)
    extent = (lambda box: box[2] - box[0]) if item.lying else (lambda box: box[3] - box[1])
    scale = item.height / max(extent(_box(f)) for f in frames.images if _box(f))
    boxes = [_box(f) for f in frames.images if _box(f)]
    left, top = min(b[0] for b in boxes), min(b[1] for b in boxes)
    right, bottom = max(b[2] for b in boxes), max(b[3] for b in boxes)
    # Keep the attach point inside the frame, so its pivot stays a plain fraction
    left, top = min(left, int(frames.attach[0])), min(top, int(frames.attach[1]))
    right, bottom = max(right, int(frames.attach[0]) + 1), max(bottom, int(frames.attach[1]) + 1)
    size = (max(1, round((right - left) * scale)), max(1, round((bottom - top) * scale)))
    small = [f.crop((left, top, right, bottom)).resize(size, Image.BOX) for f in frames.images]
    return small, ((frames.attach[0] - left) / (right - left), (frames.attach[1] - top) / (bottom - top))
