"""Rigs for the animals that need real limbs: bison gallop, cat pounce, pigeon flap."""
from rig import Part, Rig, cut_white, wave

ART = "art/sprites"


def bison() -> list:
    rig = Rig(cut_white(f"{ART}/bison.png"), [
        Part("hind_far", [(58, 60), (80, 60), (76, 90), (58, 90)], (68, 62), layer=-1),
        Part("front_far", [(26, 62), (42, 62), (42, 86), (22, 86)], (33, 62), layer=-1),
        Part("hind", [(76, 56), (92, 54), (92, 88), (76, 88)], (84, 58)),
        Part("front", [(40, 64), (54, 64), (54, 88), (40, 88)], (46, 64)),
        Part("head", [(2, 28), (30, 24), (32, 74), (2, 74)], (28, 50)),
        Part("tail", [(88, 44), (98, 44), (98, 66), (88, 66)], (88, 45)),
    ])
    frames = []
    for i in range(8):
        t = i / 8
        hop = abs(wave(t)) * 1.6
        frames.append(rig.pose({
            "front": 34 * wave(t), "front_far": 30 * wave(t, .12),
            "hind": 34 * wave(t, .5), "hind_far": 30 * wave(t, .62),
            "head": 5 * wave(t, .25), "tail": 16 * wave(t, .2),
        }, {"body": (0, -hop), "head": (0, -hop), "tail": (0, -hop), "front": (0, -hop * .4),
            "hind": (0, -hop * .4), "front_far": (0, -hop * .4), "hind_far": (0, -hop * .4)}))
    return frames


def cat() -> list:
    rig = Rig(cut_white(f"{ART}/cat.png"), [
        Part("tail", [(76, 0), (100, 0), (100, 54), (82, 54)], (86, 50), layer=-1),
        Part("rear", [(70, 76), (96, 72), (96, 96), (70, 96)], (82, 74)),
        Part("front", [(26, 78), (50, 78), (50, 96), (26, 96)], (38, 76)),
        Part("swipe", [(4, 60), (31, 60), (31, 82), (4, 82)], (30, 66)),
        Part("head", [(5, 12), (46, 12), (46, 58), (5, 58)], (40, 52)),
    ])
    frames = []
    swipe = [0, -18, -34, -30, 36, 48, 24, 8]  # wind up, hold, strike, settle
    for i in range(8):
        t = i / 8
        frames.append(rig.pose({
            "tail": 14 * wave(t), "swipe": swipe[i], "head": 4 * wave(t, .15),
            "rear": 4 * wave(t), "front": -3 * wave(t),
        }, {"body": (0, .8 * wave(t, .25))}))
    return frames


def bird() -> list:
    rig = Rig(cut_white(f"{ART}/bird.png"), [
        Part("far_wing", [(25, 58), (22, 40), (44, 2), (60, 4), (43, 40), (41, 63), (29, 63)], (36, 62), layer=-1),
        Part("wing", [(39, 64), (42, 34), (60, 2), (84, 4), (84, 40), (72, 64)], (47, 63)),
    ])
    downstroke = [0, 20, 54, 84, 98, 86, 52, 16]  # snaps down, recovers slower
    frames = []
    for angle in downstroke:
        rise = (angle - 56) / 56
        frames.append(rig.pose({"wing": angle, "far_wing": angle * .86}, {"body": (0, rise * 2.2)}))
    return frames


CREATURES = {"bison": bison, "cat": cat, "bird": bird}
