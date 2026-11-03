"""Cut-out rig: slice a sprite into limbs, pose them per frame and bake pixel-art frames.

Coordinates are percent of the source image. Rotations happen at source resolution with nearest sampling and the
result is box-filtered down once, so limbs keep the sprite's palette feel and nothing is rotated at runtime.
"""
import math
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ni


def cut_white(path: str, threshold: int = 225, erode: int = 1) -> np.ndarray:
    """RGBA from a sprite rendered on white. Only white touching the border goes, so white inside the object stays."""
    rgba = np.asarray(Image.open(path).convert("RGBA")).copy()
    if rgba[..., 3].min() < 255:
        return rgba
    white = rgba[..., :3].min(2) > threshold
    labels, _ = ni.label(white)
    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    solid = ni.binary_erosion(~np.isin(labels, list(border)), iterations=erode)
    rgba[..., 3] = solid * 255
    return rgba


@dataclass
class Part:
    name: str
    polygon: list[tuple[float, float]]
    pivot: tuple[float, float]
    layer: int = 1  # below 0 draws behind the body
    parent: str | None = None
    image: np.ndarray = field(default=None, repr=False)


def _polygon_mask(size: int, polygon) -> np.ndarray:
    points = np.array([[x * size / 100, y * size / 100] for x, y in polygon], np.int32)
    mask = np.zeros((size, size), np.uint8)
    cv2.fillPoly(mask, [points], 255)
    return mask


class Rig:
    def __init__(self, rgba: np.ndarray, parts: list[Part]):
        self.size = rgba.shape[0]
        self.parts = parts
        taken = np.zeros((self.size, self.size), np.uint8)
        for part in parts:
            mask = _polygon_mask(self.size, part.polygon)
            part.image = rgba.copy()
            part.image[..., 3] = np.where(mask > 0, rgba[..., 3], 0)
            taken |= mask
        self.body = self._fill_behind(rgba, taken)

    def _fill_behind(self, rgba: np.ndarray, taken: np.ndarray) -> np.ndarray:
        """Paint body over the holes the limbs leave, but only where the hole is inside the body."""
        solid = rgba[..., 3] > 128
        body_only = solid & (taken == 0)
        reach = ni.binary_dilation(body_only, iterations=int(self.size * 0.012))
        hole = (taken > 0) & solid & reach
        bgr = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2BGR)
        filled = cv2.inpaint(bgr, ((taken > 0) | ~solid).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
        out = np.dstack([cv2.cvtColor(filled, cv2.COLOR_BGR2RGB), (body_only | hole) * 255])
        return out.astype(np.uint8)

    def pose(self, angles: dict[str, float], shifts: dict[str, tuple[float, float]] | None = None) -> np.ndarray:
        """Frame at source size. Angles are degrees; a child turns with its parent."""
        shifts = shifts or {}
        canvas = np.zeros_like(self.body)
        drawn = sorted(self.parts, key=lambda p: p.layer)
        for part in [p for p in drawn if p.layer < 0]:
            _over(canvas, self._place(part, angles, shifts))
        _over(canvas, _shift(self.body, shifts.get("body", (0, 0)), self.size))
        for part in [p for p in drawn if p.layer >= 0]:
            _over(canvas, self._place(part, angles, shifts))
        return canvas

    def _place(self, part: Part, angles, shifts) -> np.ndarray:
        image = part.image
        px, py = part.pivot[0] * self.size / 100, part.pivot[1] * self.size / 100
        image = _rotate(image, angles.get(part.name, 0), px, py)
        if part.parent:
            parent = next(p for p in self.parts if p.name == part.parent)
            image = _rotate(image, angles.get(parent.name, 0),
                            parent.pivot[0] * self.size / 100, parent.pivot[1] * self.size / 100)
        offset = shifts.get(part.name, shifts.get(part.parent, shifts.get("body", (0, 0))))
        return _shift(image, offset, self.size)


def _rotate(image: np.ndarray, degrees: float, px: float, py: float) -> np.ndarray:
    if not degrees:
        return image
    matrix = cv2.getRotationMatrix2D((px, py), -degrees, 1)
    return cv2.warpAffine(image, matrix, image.shape[1::-1], flags=cv2.INTER_NEAREST)


def _shift(image: np.ndarray, offset, size: int) -> np.ndarray:
    dx, dy = offset[0] * size / 100, offset[1] * size / 100
    if not dx and not dy:
        return image
    return cv2.warpAffine(image, np.float32([[1, 0, dx], [0, 1, dy]]), image.shape[1::-1], flags=cv2.INTER_NEAREST)


def _over(canvas: np.ndarray, layer: np.ndarray) -> None:
    solid = layer[..., 3] > 128
    canvas[solid] = layer[solid]


def wave(t: float, phase: float = 0.0) -> float:
    return math.sin((t + phase) * math.tau)
