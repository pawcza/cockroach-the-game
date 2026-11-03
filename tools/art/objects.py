"""Loops for everything without limbs: warped wobbles, plus a glint or sparkle baked into the pixels."""
import math

import numpy as np
from PIL import Image

from rig import cut_white, wave

ART = "art/sprites"
SIZE = 400


def _load(name: str) -> np.ndarray:
    rgba = Image.fromarray(cut_white(f"{ART}/{name}.png"))
    rgba = rgba.crop(rgba.getchannel("A").getbbox())
    side = int(max(rgba.size) * 1.24)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(rgba, ((side - rgba.width) // 2, side - rgba.height - int(side * .05)))
    return np.asarray(canvas.resize((SIZE, SIZE), Image.NEAREST))


def _warp(source: np.ndarray, field) -> np.ndarray:
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(float)
    u, v = xs / SIZE, ys / SIZE
    du, dv = field(u, v)
    sx, sy = (u + du) * SIZE, (v + dv) * SIZE
    inside = (sx >= 0) & (sx < SIZE) & (sy >= 0) & (sy < SIZE)
    out = np.zeros_like(source)
    out[inside] = source[sy[inside].astype(int), sx[inside].astype(int)]
    return out


def _smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _rock(angle: float, pivot=(.5, .95), bob: float = 0.0):
    def field(u, v):
        x, y = u - pivot[0], v - pivot[1]
        c, s = math.cos(angle), math.sin(angle)
        return x * c - y * s - x, x * s + y * c - y + bob
    return field


def _squash(amount: float):
    def field(u, v):
        return (u - .5) * amount, (v - .95) * -amount
    return field


def _glint(frame: np.ndarray, position: float, width: float = .08, strength: float = .55) -> np.ndarray:
    """A diagonal band of light crossing the object."""
    out = frame.copy().astype(float)
    ys, xs = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    band = np.exp(-(((xs + ys * .5) - position) / width) ** 2) * strength
    out[..., :3] += (255 - out[..., :3]) * band[..., None]
    return out.astype(np.uint8)


def pickup(name: str, rock: float = .07) -> list[np.ndarray]:
    source, frames = _load(name), []
    for i in range(6):
        t = i / 6
        frame = _warp(source, _rock(rock * wave(t), bob=.012 * wave(t, .25)))
        frames.append(_glint(frame, -.3 + i * .5) if i < 4 else frame)
    return frames


def pill() -> list[np.ndarray]:
    source = _load("pill")
    return [_warp(source, _squash(.08 * wave(i / 6))) for i in range(6)]


def jellyfish() -> list[np.ndarray]:
    source, frames = _load("jellyfish"), []
    for i in range(8):
        t = i / 8

        def field(u, v, t=t):
            pulse = .09 * wave(t)
            bell = 1 - _smooth(v, .1, .55)
            return ((u - .5) * pulse * bell * 1.5 + .035 * np.sin((t + v * 1.4) * math.tau) * _smooth(v, .45, .95),
                    -(v - .2) * pulse * .6 - .02 * wave(t))
        frames.append(_warp(source, field))
    return frames


def wobble(name: str, angle: float, frames: int = 6, pivot=(.5, .95)) -> list[np.ndarray]:
    source = _load(name)
    return [_warp(source, _rock(angle * wave(i / frames), pivot)) for i in range(frames)]


def shake(name: str) -> list[np.ndarray]:
    source = _load(name)
    jolts = [0, .05, -.05, .03, -.03, 0]
    return [_warp(source, _rock(a)) for a in jolts]


def disco() -> list[np.ndarray]:
    """The ball keeps its shape; light travels across the facets as a band and a few of them flash."""
    source, frames = _load("disco"), []
    rng = np.random.default_rng(2137)
    cell = SIZE // 28
    grid = rng.random((SIZE // cell + 1, SIZE // cell + 1))
    ys, xs = np.mgrid[0:SIZE, 0:SIZE]
    facets = grid[ys // cell, xs // cell]
    for i in range(8):
        t = i / 8
        frame = source.astype(float)
        band = np.exp(-(((xs / SIZE - t * 1.4 + .2)) / .13) ** 2)
        flash = (np.abs((facets * 8 + i) % 8 - 4) < .35) * (facets > .55)
        light = np.clip(band * .45 + flash * .85, 0, 1)
        frame[..., :3] += (255 - frame[..., :3]) * light[..., None]
        frames.append(frame.astype(np.uint8))
    return frames


def blackhole() -> list[np.ndarray]:
    """The disc shimmers around the hole; its outline never moves, so the hitbox stays honest."""
    source, frames = _load("blackhole"), []
    ys, xs = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    box = np.argwhere(source[..., 3] > 128)
    cy, cx = box.mean(0) / SIZE
    angle = np.arctan2((ys - cy) * 2.2, xs - cx)
    bright = source[..., :3].sum(2) > 90
    for i in range(8):
        wave_light = (np.sin(angle * 3 - i / 8 * math.tau) + 1) / 2
        frame = source.astype(float)
        gain = np.where(bright, .55 + wave_light * .75, 1)
        frame[..., :3] = np.clip(frame[..., :3] * gain[..., None], 0, 255)
        frames.append(frame.astype(np.uint8))
    return frames


OBJECTS = {
    "apple": lambda: pickup("apple"),
    **{f"beer-{n}": (lambda n=n: pickup(f"beer-{n}")) for n in range(1, 7)},
    "pill": pill,
    "jellyfish": jellyfish,
    "disco": disco,
    "blackhole": blackhole,
    "onion": lambda: wobble("onion", .09),
    "spray": lambda: shake("spray"),
    "flipper": lambda: wobble("flipper", .14),
    "newspaper": lambda: wobble("newspaper", .12),
    "pope": lambda: wobble("pope", .11, 8, (.5, .9)),
}
