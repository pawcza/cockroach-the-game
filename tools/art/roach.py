"""The roach: its painted body stays still while six jointed legs and two antennae are drawn per frame."""
import math

import cv2
import numpy as np
from PIL import Image

from rig import cut_white

SOURCE = "art/sprites/roach.png"
CELL = (88, 55)  # the roach is about 78 native px long
CROP = (0, 120, 768, 600)  # same box for every frame: one scale, one baseline
GROUND = 532

DARK = (44, 20, 12, 255)
MID = (120, 60, 28, 255)
LIGHT = (196, 128, 66, 255)
# hip x, knee reach, foot reach: rear to front
LEGS = [(300, -74, -136), (450, -20, -44), (570, 30, 92)]


def _body() -> np.ndarray:
    rgba = cut_white(SOURCE, erode=2)
    height, width = rgba.shape[:2]
    keep = np.zeros((height, width), bool)
    for x in range(width):
        run = np.nonzero(rgba[:, x, 3] > 128)[0]
        if len(run):
            limit = 455 if 200 < x < 640 else 440
            keep[run[run < limit], x] = True
    keep[:300, 640:] = False  # antennae are redrawn so they read at game size
    out = rgba.copy()
    out[..., 3] = keep * 255
    # the render's teal rim would tint the roach on every level
    teal = (out[..., 1].astype(int) > out[..., 0] + 12) & (out[..., 2].astype(int) > out[..., 0])
    out[teal, 3] = 0
    return out


BODY = _body()


def _limb(img, points, width, near):
    points = np.int32(points)
    cv2.polylines(img, [points], False, DARK, width + 8, cv2.LINE_8)
    colour = MID if near else DARK
    cv2.line(img, tuple(int(v) for v in points[0]), tuple(int(v) for v in points[1]), colour, width, cv2.LINE_8)
    cv2.line(img, tuple(int(v) for v in points[1]), tuple(int(v) for v in points[2]), colour, max(6, width - 6), cv2.LINE_8)
    if near:
        cv2.polylines(img, [points[:2] + (0, -4)], False, LIGHT, 4, cv2.LINE_8)


def _leg(img, hip, foot, femur, tibia, near):
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    reach = min(math.hypot(dx, dy), femur + tibia - 1)
    cosine = max(-1, min(1, (femur ** 2 + reach ** 2 - tibia ** 2) / (2 * femur * reach)))
    bend = math.atan2(dy, dx) + (-1 if dx >= 0 else 1) * math.acos(cosine)
    knee = (hip[0] + femur * math.cos(bend), hip[1] + femur * math.sin(bend))
    _limb(img, [hip, knee, foot], 15 if near else 11, near)


def _antennae(img, sway, lift, y=0):
    for spread, length in ((0, 1.0), (-.42, .8)):
        points, x, py, angle = [], 660., 300. + y, -1.0 + spread + lift
        for segment in range(5):
            points.append((x, py))
            angle += .10 + sway * .10 * segment
            x += 36 * length * math.cos(angle)
            py += 36 * length * math.sin(angle)
        cv2.polylines(img, [np.int32(points)], False, (66, 30, 16, 255), 9, cv2.LINE_8)


def _frame(feet, bob=0, sway=0.0, lift=0.0, stretch=1.0, roll=0.0, hip_y=452, drop=0):
    """feet: per leg (dx, dy) offset of the foot; three near legs then three far ones."""
    canvas = np.zeros_like(BODY)
    for far in (True, False):
        for i, (hip, _, foot_reach) in enumerate(LEGS):
            ox, oy = feet[i + (3 if far else 0)]
            shift = -26 if far else 0
            lean = -10 if far else 0
            _leg(canvas, (hip + shift, hip_y + bob + lean),
                 (hip + shift + foot_reach + ox, GROUND + lean + oy), 54, 82 + 12 * (i == 0), not far)
    body = np.roll(BODY, bob, axis=0)
    solid = body[..., 3] > 128
    canvas[solid] = body[solid]
    _antennae(canvas, sway, lift, bob)
    if stretch != 1.0:
        image = Image.fromarray(canvas)
        width = int(768 * stretch)
        stretched = image.resize((width, int(768 / stretch ** .5)), Image.NEAREST)
        out = Image.new("RGBA", (768, 768))
        out.alpha_composite(stretched.crop((width - 768, 0, width, stretched.height)), (0, 768 - stretched.height))
        canvas = np.asarray(out).copy()
    if roll:
        matrix = cv2.getRotationMatrix2D((400, 400), roll, 1)
        matrix[1, 2] += drop
        canvas = cv2.warpAffine(canvas, matrix, (768, 768), flags=cv2.INTER_NEAREST)
    return canvas


def _gait(phase, stride=70, height=44):
    swing = phase % 1
    if swing < .5:
        return (stride * (.5 - swing * 2), 0)
    t = (swing - .5) * 2
    return (stride * (t - .5), -height * math.sin(math.pi * t))


def run():
    frames = []
    for i in range(8):
        p = i / 8
        feet = []
        for side in (0, 1):
            for leg in range(3):
                # alternating tripods: front and rear of one side move with the middle of the other
                offset = .5 if (leg + side) % 2 else 0
                feet.append(_gait(p + offset + leg * .03))
        frames.append(_frame(feet, bob=round(4 * math.sin(p * 4 * math.pi)), sway=.5 * math.sin(p * math.tau)))
    return frames


def idle():
    rest = [(0, 0)] * 6
    return [_frame(rest, bob=round(2 * math.sin(i / 6 * math.tau)), sway=math.sin(i / 6 * math.tau),
                   lift=.1 * math.sin(i / 3 * math.tau)) for i in range(6)]


def hop():
    tucked = [(-30, -60)] * 6
    reach = [(20, -8)] * 6
    return [
        _frame([(0, 0)] * 6, bob=24, hip_y=476, sway=-.4),            # crouch
        _frame([(-60, 30)] * 6, bob=-10, stretch=1.04, sway=-1),      # launch
        _frame(tucked, bob=-6, sway=-.6, lift=.2),                    # apex
        _frame(reach, bob=-4, sway=.5, lift=.1),                      # reach for the floor
        _frame([(0, 0)] * 6, bob=20, hip_y=474, sway=1),              # landing squash
    ]


def dash():
    frames = []
    for i in range(4):
        trail = [(-110 - 12 * ((i + leg) % 3), -14 - 6 * (leg % 2)) for leg in range(6)]
        frames.append(_frame(trail, bob=-6, stretch=1.07 + .02 * (i % 2), sway=-1.4, lift=-.1))
    return frames


def death():
    frames = []
    for i, roll in enumerate((-45, -110, -180)):
        kick = [(30 * math.sin(i + leg), -30) for leg in range(6)]
        frames.append(_frame(kick, bob=-16 * (i + 1), sway=1.4, roll=roll, drop=14 * i))
    for i in range(5):
        kick = [(46 * math.sin(i * 2.2 + leg * 1.7), 40 * math.cos(i * 2.2 + leg)) for leg in range(6)]
        frames.append(_frame(kick, bob=-40, sway=math.sin(i), roll=-180, drop=36))
    return frames


ANIMATIONS = {"run": run, "idle": idle, "hop": hop, "dash": dash, "death": death}


def baked(frame) -> Image.Image:
    return Image.fromarray(frame).crop(CROP).resize(CELL, Image.BOX)
