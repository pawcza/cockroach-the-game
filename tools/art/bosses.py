"""Candidate boss art with the local ComfyUI (see comfy.py): `python3 tools/art/bosses.py [name-kind ...]`.

Renders 4 seeds of each subject at 1024x1024 into art/renders/bosses/<name>-<kind>-<seed>.png. Run from the repo root,
with ComfyUI up on :8189 (comfy.py's COMFY_URL).
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy

comfy.OUT = Path("art/renders/bosses")
SEEDS = tuple(int(s) for s in os.environ.get("SEEDS", "101,202,303,404").split(","))

_graph = comfy.graph


def graph_1024(prompt, seed, prefix, init=None):
    wf = _graph(prompt, seed, prefix, init)
    wf["lat"]["inputs"]["width"] = 1024
    wf["lat"]["inputs"]["height"] = 1024
    return wf


comfy.graph = graph_1024

STYLE = ("painterly pixel art, chunky visible square pixels, limited colour palette, dark moody game art, "
         "clear warm rim light from one side, deep dark undersides, soft pixel shading, absurd grotesque cartoon humour, "
         "no thick outline, no black sticker outline around the subject, "
         "isolated on a plain pure white background, no shadow, no text, no letters, no logo, no brand")
FIGURE = "full figure from head to toe, side view facing left, a video game boss sprite, "
PORTRAIT = "boss portrait bust, dramatic low angle, strong expression, facing left, head and shoulders, "

JOBS = {
    "lodzia-figure": FIGURE + "Pani Lodzia, a terrifying Polish block-of-flats grandma, stout and scowling, floral housecoat, "
        "headscarf over pink hair curlers, thick stockings, raising one enormous worn brown house slipper high above her head "
        "as a weapon, fictional old woman",
    "bigos-figure": "full figure from head to toe, strict side profile view facing left, a video game boss sprite, DJ Bigos, a cartoon "
        "disco character whose head is a big round mirror disco ball made of square mirror tiles, the body entirely covered by a "
        "tight silver sequin jumpsuit, white gloves, chunky silver platform boots, no neck, no skin visible anywhere, no jewellery, "
        "standing sideways on the right, facing left towards a small DJ deck with two big speakers placed in front of him on the "
        "left, both arms stretched towards the deck, the ball head turned to the left",
    "bigos-figure-suit": FIGURE + "DJ Bigos, a cartoon disco character whose head is a big round mirror disco ball made of square mirror "
        "tiles, the body entirely covered by a tight silver sequin jumpsuit, white gloves, chunky silver platform boots, no neck, "
        "no skin visible anywhere, no jewellery, standing next to a small DJ deck with two big speakers, arms raised",
    "bigos-figure-amp": FIGURE + "DJ Bigos, a cartoon disco character whose head is a big round mirror disco ball made of square mirror "
        "tiles, the body built from stacked black loudspeakers and amplifier boxes with knobs and dials, arms made of thick cables "
        "with plug hands, no human body, no skin, no jewellery, standing behind a small DJ deck with two big speakers",
    "eksterminator-figure": FIGURE + "a pest exterminator in a gas mask with round goggles and hazmat-style yellow overalls, "
        "rubber boots and gloves, a big pump sprayer tank on his back, holding a long spray wand forward, menacing",
    "lodzia-portrait": "cartoon monster-like boss portrait, dramatic low angle, facing left, low-resolution pixel art with big chunky "
        "pixels, limited palette, a furious Polish block-of-flats grandma with a huge head, screaming with a huge wide open mouth "
        "showing a few crooked teeth and a tongue, bulging round angry eyes, thick bushy eyebrows, big bulbous nose, double chin, "
        "pink hair curlers, floral headscarf, floral housecoat collar, fictional old woman, grotesque and funny",
    "eksterminator-portrait": PORTRAIT + "a pest exterminator in a gas mask with round goggles and big filter canister, "
        "yellow hazmat hood, glowing eyes behind the lenses, spray nozzle at the chin",
    "zlewiatan-portrait": "cartoon monster boss portrait, dramatic low angle, facing left, low-resolution pixel art with big chunky "
        "pixels, a three-headed hydra monster, no human, three separate heads side by side on three long thick slimy green "
        "drain-pipe necks rising from a dark sink drain hole: the left head is a grey concrete Soviet tower block with an angry "
        "face made of windows and balconies and a gaping mouth, the middle head is a snarling steaming pierog dumpling with "
        "fangs and angry eyes, the right head is a bulging-eyed grey carp fish with big rubbery lips, green slime dripping "
        "everywhere, grotesque and funny",
    "karaluch-portrait": "cartoon insect hero portrait, dramatic low angle, facing right, low-resolution pixel art with big chunky "
        "pixels, a real brown cockroach seen in profile, an insect head with big glossy black compound eyes, small mandibles, "
        "long thin antennae swept back, glossy brown shell and pronotum, no human face, no human features, no clothes, "
        "heroic determined chin-up look, close-up of the insect head and front body",
}

# Image-to-image jobs: name -> (procedural base, denoise, prompt)
INIT = {
    "bigos-portrait": ("ball", 0.46,
        "cartoon boss portrait, dramatic low angle, three-quarter view facing left, low-resolution pixel art with big chunky "
        "pixels, DJ Bigos, a character whose whole head is a round mirror disco ball sphere of small square mirror tiles, the "
        "face is formed by the tiles themselves: two angry slit eyes and a wide toothy grin made of dark missing tiles, coloured "
        "disco light reflections of pink cyan and orange, big headphones over the ball, body is a silver sequin jumpsuit collar, "
        "no human skin anywhere, no neck, no jewellery"),
}

def ball_base(path, yaw=-0.3, n=160):
    """A tiled mirror ball turned towards the viewer's left, with the face as dark missing tiles, upscaled to 1024."""
    import math
    import random
    import numpy as np
    from PIL import Image
    rnd = random.Random(7)
    img = np.full((n, n, 3), 255, np.uint8)
    cx, cy, r = n * 0.5, n * 0.44, n * 0.38
    step = math.pi / 32
    cols = [(255, 120, 190), (90, 220, 240), (255, 170, 70), (170, 130, 255)]
    tiles = {}
    for py in range(n):
        for px in range(n):
            x, y = (px + 0.5 - cx) / r, -(py + 0.5 - cy) / r
            if x * x + y * y > 1:
                continue
            z = math.sqrt(1 - x * x - y * y)
            lat = math.asin(y)
            lon = math.atan2(x, z) - yaw
            ti, tj = int(math.floor(lon / step)), int(math.floor(lat / step))
            fl = (ti + 0.5) * step  # tile centre, longitude relative to the face
            fa = (tj + 0.5) * step
            if (ti, tj) not in tiles:
                eye = False
                for sgn in (-1, 1):
                    u, v = fl - sgn * 0.4, fa - 0.29
                    v += sgn * u * 0.55  # angry slant: inner ends low
                    eye = eye or (abs(u) < 0.2 and abs(v) < 0.085)
                g = fa - (-0.38 + 0.6 * fl * fl)
                grin = abs(fl) < 0.7 and abs(g) < 0.13
                tooth = grin and g > -0.01 and (ti % 2 == 0)
                if tooth:
                    c = (245, 245, 250)
                elif eye or grin:
                    c = (22, 20, 34)
                else:
                    t = rnd.random()
                    base = rnd.randint(150, 215)
                    c = (base, base, min(255, base + 14))
                    if t < 0.12 and not (abs(fl) < 0.85 and abs(fa - 0.0) < 0.6):
                        c = rnd.choice(cols)
                tiles[(ti, tj)] = c
            c = np.array(tiles[(ti, tj)], float)
            light = 0.35 + 0.75 * max(0.0, (-0.5 * x + 0.5 * y + 0.7 * z))
            edge = abs(lon / step - round(lon / step)) < 0.08 or abs(lat / step - round(lat / step)) < 0.08
            if edge:
                c = c * 0.45
            c = c * min(1.2, light)
            if x > 0.8:
                c = c + np.array([60, 25, 0]) * (x - 0.8) * 4
            img[py, px] = np.clip(c, 0, 255)
    # silver sequin collar and shoulders, plus a headphone band and cup
    for py in range(int(cy + r * 0.75), n):
        for px in range(n):
            k = (py - (cy + r * 0.75)) / (n - cy - r * 0.75)
            if abs(px - cx - 8) < 22 + k * 62:
                base = 90 + ((px // 3 + py // 3) % 3) * 22
                img[py, px] = (base, base, base + 22)
    for a in np.linspace(math.pi * 0.08, math.pi * 0.92, 60):
        px, py = int(cx + (r + 3) * math.cos(a)), int(cy - (r + 3) * math.sin(a))
        img[max(0, py - 2):py + 2, max(0, px - 2):px + 2] = (30, 30, 40)
    img[int(cy) - 9:int(cy) + 9, int(cx + r) - 5:int(cx + r) + 4] = (40, 40, 52)
    Image.fromarray(img).resize((1024, 1024), Image.NEAREST).save(path)


def pixelate(path, out, size=144, colours=32):
    from PIL import Image
    im = Image.open(path).convert("RGB").resize((size, size), Image.BOX)
    im = im.quantize(colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    im.resize((1024, 1024), Image.NEAREST).save(out)


# ---------------------------------------------------------------------------------------------------------------------
# Extra poses and props for the rigs: `python3 tools/art/bosses.py extra [boss/name ...]` (all when none given).
# Output: art/renders/bosses/extra/<boss>/<name>-<seed>.png (+ raw/ for head-composited ones). Seeds 101,202,303, each
# with its own denoise (EXTRA entry "denoise" is a list of three, one per seed): img2img from the chosen still holds the
# design, the higher the denoise the more the pose can change. "head" = box (x0, y0, x1, y1) of the 1024 canvas: the
# result is feathered onto the base only inside that box, so the body stays the chosen still's.
# ---------------------------------------------------------------------------------------------------------------------
EXTRA_SEEDS = (101, 202, 303)
CHOSEN = Path("art/sprites/bosses")  # the chosen stills (tracked); candidates stay in art/renders/bosses
OBJ = "single prop object, side view, game item sprite, "
SIDE = "full figure from head to toe, side view facing left, a video game boss sprite, "
LODZIA_D = ("Pani Lodzia, a terrifying Polish block-of-flats grandma, stout, floral housecoat, headscarf over pink hair curlers, "
            "thick stockings, enormous worn brown house slipper, fictional old woman")
EKS_D = ("a pest exterminator in a gas mask with round goggles and hazmat-style yellow overalls, rubber boots and gloves, "
         "a big pump sprayer tank on his back")
BIGOS_D = ("DJ Bigos, a cartoon disco character whose head is a big round mirror disco ball made of square mirror tiles, the body "
           "entirely covered by a tight silver sequin jumpsuit, white gloves, chunky silver platform boots, no neck, no skin visible "
           "anywhere, no jewellery")
PLAIN = ("chunky visible square pixels, limited colour palette, painterly pixel art, plain pure white background, no shadow, "
         "no text, no letters, no logo")
LODZIA_HEAD = (225, 185, 520, 520)
LODZIA_H = ("close-up of the head of Pani Lodzia, a stout Polish block-of-flats grandma in profile facing left, floral headscarf over "
            "pink hair curlers, chunky pixel art, low-resolution, " + STYLE.split(", no thick")[0])

EXTRA = {
    # 1. Lodzia
    "lodzia/face-panting": dict(base="lodzia-figure.png", paint="panting", denoise=[0.5, 0.6, 0.7], head=LODZIA_HEAD, prompt=LODZIA_H +
        ", her mouth gaping wide open panting with a long tongue hanging out and teeth showing, exhausted droopy half-closed eyes, "
        "big sweat drops flying off her face"),
    "lodzia/face-dazed": dict(base="lodzia-figure.png", paint="dazed2", denoise=[0.4, 0.5, 0.58], head=LODZIA_HEAD, prompt=LODZIA_H +
        ", big dizzy spiral eyes, mouth hanging wide open agape, stunned"),
    "lodzia/face-screaming": dict(base="lodzia-figure.png", paint="screaming2", denoise=[0.4, 0.5, 0.58], head=LODZIA_HEAD, prompt=LODZIA_H +
        ", furious screaming with a huge wide open mouth full of crooked teeth, bulging angry eyes, deep frown"),
    "lodzia/arm-lowered": dict(base="lodzia-figure.png", denoise=[0.7, 0.78, 0.85], prompt=SIDE + LODZIA_D +
        ", the slipper arm hanging down at her side holding the brown slipper low by her leg, the other arm visible too, slipper "
        "not raised"),
    "lodzia/sitting": dict(base="lodzia-figure.png", denoise=[0.78, 0.86, 0.92], prompt=SIDE + LODZIA_D +
        ", sitting on the floor after falling over, legs straight out in front of her with the toes pointing up, dazed expression, "
        "slipper dropped beside her"),
    "lodzia/throwing": dict(base="lodzia-figure.png", denoise=[0.7, 0.78, 0.85], prompt=SIDE + LODZIA_D +
        ", mid overarm throw leaning forward, throwing arm swung forward over her head, the slipper just leaving her open hand "
        "flying away to the left"),
    # 2. Eksterminator
    "eksterminator/crouch-spray": dict(base="eksterminator-figure.png", denoise=[0.7, 0.78, 0.85], prompt=SIDE + EKS_D +
        ", crouched low on bent knees, the long spray wand pointed straight forward along the floor"),
    "eksterminator/stride": dict(base="eksterminator-figure.png", denoise=[0.62, 0.7, 0.78], prompt=SIDE + EKS_D +
        ", mid-stride walking pose with the front knee bent and raised, side view, holding the long spray wand forward"),
    "eksterminator/throw": dict(base="eksterminator-figure.png", denoise=[0.7, 0.78, 0.85], prompt=SIDE + EKS_D +
        ", overarm throwing pose, the far arm visible swung back holding a small red gas canister, no spray wand"),
    "eksterminator/rear": dict(base=None, denoise=[0, 0, 0], prompt="full figure from head to toe, seen from behind, rear three-quarter "
        "back view, a video game boss sprite, " + EKS_D + ", the pump sprayer tank in the middle of his back with straps and a hose, "
        "the back of the gas mask hood, holding a long spray wand"),
    "eksterminator/tank-burst": dict(base="eksterminator-figure.png", denoise=[0.72, 0.8, 0.88], prompt=SIDE + EKS_D +
        ", the pump tank on his back burst open with a huge jagged crack and torn peeled-back metal, a big billowing bright green "
        "gas cloud erupting out of it behind his shoulder, he looks startled"),
    "eksterminator/prop-canister": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a small red metal gas canister with a brass valve "
        "and a hazard stripe, alone, " + PLAIN),
    "eksterminator/prop-tank": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a backpack pump sprayer tank, grey metal tank with a "
        "red cap, straps, a pump handle and a hose, intact, alone, " + PLAIN),
    "eksterminator/prop-tank-ruptured": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a backpack pump sprayer tank blown apart, a "
        "big jagged gaping rip down the middle of the grey metal tank with torn peeled-back metal flaps, bright green gas "
        "clouds pouring out of the hole, straps dangling, alone, " + PLAIN),
    # 3. Bigos
    "bigos/glove-point": dict(base=None, denoise=[0, 0, 0], prompt="a single white cartoon glove with the index finger pointing, "
        "only the glove, no arm, no skin, floating alone, game sprite, " + PLAIN),
    "bigos/glove-fist": dict(base=None, denoise=[0, 0, 0], prompt="a single white cartoon glove clenched in a fist, only the glove, "
        "no arm, no skin, floating alone, game sprite, " + PLAIN),
    "bigos/glove-palm": dict(base=None, denoise=[0, 0, 0], prompt="a single white cartoon glove with a flat open hand palm down, only "
        "the glove, no arm, no skin, floating alone, game sprite, " + PLAIN),
    "bigos/arms-out": dict(base="bigos-figure.png", denoise=[0.62, 0.72, 0.8], prompt=SIDE + BIGOS_D +
        ", standing in front of a small DJ deck with two big speakers, both arms extended away from the body so the far arm and "
        "its white glove are fully visible"),
    "bigos/prop-speaker": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a big black loudspeaker cabinet seen front-on with a "
        "large woofer cone and a small tweeter, alone, " + PLAIN),
    "bigos/prop-speaker-blown": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a big black loudspeaker cabinet seen front-on, "
        "the big woofer cone ripped out leaving a large jagged black hole with shredded torn paper cone hanging from the rim "
        "and the bare magnet showing, alone, " + PLAIN),
    "bigos/prop-speaker-wrecked": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a wrecked black loudspeaker cabinet, cracked, "
        "dented and smoking, scorched, tilted, thin grey smoke rising, alone, " + PLAIN),
    "bigos/prop-deck": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a DJ deck with a spinning platter and knobs seen front-on, "
        "standing on a black flight-case stand, alone, " + PLAIN),
    "bigos/prop-ball-cracked": dict(base=None, denoise=[0, 0, 0], prompt=OBJ + "a broken mirror disco ball alone, half of the "
        "square mirror tiles missing in large patches showing the bare dark grey metal core, deep cracks, a few loose tiles, " + PLAIN),
    # 4. Zlewiatan heads (public/boss/face1-3.webp, 512 px, upscaled x2 for the base)
    "zlewiatan/face1-closed": dict(base="public/boss/face1.webp", denoise=[0.5, 0.58, 0.66], prompt="pixel art video game boss head, a "
        "grey concrete Soviet tower block with an angry face made of windows and balconies, the mouth closed shut in a grim "
        "frown, same angle, " + PLAIN),
    "zlewiatan/face2-closed": dict(base="public/boss/face2.webp", denoise=[0.5, 0.58, 0.66], prompt="pixel art video game boss head, a "
        "snarling steaming pierog dumpling with angry eyes, the mouth closed in a scowl, no teeth, same angle, " + PLAIN),
    "zlewiatan/face3-closed": dict(base="public/boss/face3.webp", denoise=[0.5, 0.58, 0.66], prompt="pixel art video game boss head, a "
        "grey carp fish with a bulging eye and big rubbery lips, the mouth closed, same angle, " + PLAIN),
    "zlewiatan/carp-body": dict(base="carp-body", denoise=[0.7, 0.78, 0.85], prompt="pixel art video game boss head, a grey carp fish "
        "with a bulging eye and big rubbery lips, the head with a long thick body and neck of scales behind the gills, facing "
        "left, " + PLAIN),
    # 5. Lodzia VS portrait with the slipper in frame
    "lodzia/portrait-slipper": dict(base="lodzia-portrait.png", denoise=[0.7, 0.8, 0.9], prompt=JOBS["lodzia-portrait"] +
        ", an enormous worn brown house slipper raised in her fist next to her head in frame, " + STYLE),
}


def _paint_face(im, kind):
    """Draw the expression roughly on a 128 px grid (8 px blocks like the still) so img2img keeps it: open mouth, spiral eyes..."""
    import math
    from PIL import Image, ImageDraw
    ov = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    dark, red, tongue, white = (34, 10, 16, 255), (110, 24, 34, 255), (214, 92, 104, 255), (246, 240, 236, 255)
    if kind in ("panting", "dazed", "screaming"):
        big = kind == "screaming"
        d.rectangle((37, 53, 43, 57 if big else 56), fill=dark)
        d.rectangle((38, 54, 42, 56 if big else 55), fill=red)
        d.point([(38, 53), (40, 53), (42, 53)], fill=white)
        if kind != "dazed":
            d.rectangle((38, 56 if not big else 57, 41, 58 if not big else 58), fill=tongue)
        else:
            d.rectangle((39, 55, 41, 56), fill=tongue)
    if kind == "panting":
        d.rectangle((39, 55, 42, 59), fill=tongue)
        for x, y in ((33, 42), (34, 43), (34, 44), (31, 47), (32, 48), (32, 49)):
            d.point((x, y), fill=(160, 210, 255, 255))
        d.point([(33, 43), (31, 48)], fill=white)
    if kind == "dazed":
        d.ellipse((35, 41, 43, 49), fill=white)
        for t in range(0, 46):
            r, a = 0.09 * t, t * 0.55
            d.point((39 + r * math.cos(a), 45 + r * math.sin(a)), fill=dark)
    if kind == "screaming":
        d.ellipse((36, 43, 44, 48), fill=white)
        d.point((39, 46), fill=dark); d.point((40, 46), fill=dark)
        for i in range(8):
            d.point((36 + i, 42 + (7 - i) // 3 * -1 + 3 - (i // 3)), fill=dark)
    if kind == "screaming2":  # fix round: much bigger gaping mouth, bulging eye, angry brow
        d.rectangle((35, 52, 45, 61), fill=dark)
        d.rectangle((36, 53, 44, 60), fill=red)
        d.point([(36, 53), (38, 53), (40, 53), (42, 53), (44, 53), (37, 60), (39, 60), (41, 60), (43, 60)], fill=white)
        d.rectangle((38, 57, 42, 60), fill=tongue)
        d.ellipse((35, 42, 44, 49), fill=white)
        d.rectangle((38, 44, 40, 47), fill=dark)
        for i in range(10):
            d.point((34 + i, 41 + (9 - i) // 3), fill=dark)
    if kind == "dazed2":  # fix round: big white disc with a clear two-turn spiral, mouth agape
        d.rectangle((36, 53, 44, 59), fill=dark)
        d.rectangle((37, 54, 43, 58), fill=red)
        d.rectangle((38, 56, 42, 58), fill=tongue)
        d.ellipse((33, 39, 45, 51), fill=white)
        pts = [(39 + 0.075 * t * math.cos(t * 0.4), 45 + 0.075 * t * math.sin(t * 0.4)) for t in range(0, 85)]
        for a, b in zip(pts, pts[1:]):
            d.line((a, b), fill=dark)
    big_ov = ov.resize((1024, 1024), Image.NEAREST)
    im = im.convert("RGBA")
    im.alpha_composite(big_ov)
    return im.convert("RGB")


def _paint_closed(im, kind):
    """Paint a closed, grim mouth over the open one on a 512 px head (zlewiatan face1/face2) so img2img keeps it shut."""
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    if kind == "closed1":  # tower block: fill the opening with the rim colour, draw a thin grim slot
        d.rectangle((126, 298, 296, 346), fill=(150, 150, 140))
        d.rectangle((136, 322, 288, 329), fill=(20, 18, 32))
        d.rectangle((136, 329, 150, 337), fill=(20, 18, 32))
        d.rectangle((274, 329, 288, 337), fill=(20, 18, 32))
    if kind == "closed2":  # pierog: dough over the open mouth, a short scowling line
        d.rectangle((112, 296, 344, 374), fill=(243, 224, 180))
        d.rectangle((150, 338, 300, 346), fill=(30, 14, 18))
        d.rectangle((150, 346, 166, 354), fill=(30, 14, 18))
        d.rectangle((284, 346, 300, 354), fill=(30, 14, 18))
    return im


def _whiten(im):
    from PIL import ImageDraw
    w, h = im.size
    for pt in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
        if min(im.getpixel(pt)) > 225:
            ImageDraw.floodfill(im, pt, (255, 255, 255), thresh=18)
    return im


def _flat(path):
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def _base_png(name, base, paint=None):
    """Copy/convert the base into ComfyUI's input folder as a 1024 png; returns (input name, PIL image)."""
    from PIL import Image
    if base == "carp-body":
        src = _flat("public/boss/face3.webp")
        canvas = Image.new("RGB", (1024, 1024), "white")
        canvas.paste(src.resize((640, 640), Image.NEAREST), (40, 60))
        im = canvas
    else:
        im = _flat(base if base.startswith("public") else CHOSEN / base)
        if paint and paint.startswith("closed"):
            im = _paint_closed(im, paint)
        if im.size != (1024, 1024):
            im = im.resize((1024, 1024), Image.NEAREST)
    fname = f"extra-{name.replace('/', '-')}-base.png"
    im.save(comfy.COMFY_DIR / "input" / fname)
    return fname, im


def run_extra(names):
    from PIL import Image, ImageDraw, ImageFilter
    for key, spec in EXTRA.items():
        if names and key not in names:
            continue
        boss, name = key.split("/")
        out = Path("art/renders/bosses/extra") / boss
        (out / "raw").mkdir(parents=True, exist_ok=True)
        comfy.OUT = out / "raw" if spec.get("head") else out
        fname, base_im = (None, None) if spec["base"] is None else _base_png(key, spec["base"], spec.get("paint"))
        if spec.get("head"):
            # Work on an enlarged square crop around the head (a face is only ~100 px of the full still), then shrink it back
            x0, y0, x1, y1 = spec["head"]
            side = max(x1 - x0, y1 - y0)
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            crop = (max(0, cx - side // 2), max(0, cy - side // 2))
            crop = (crop[0], crop[1], crop[0] + side, crop[1] + side)
            painted = _paint_face(base_im, spec["paint"]) if spec.get("paint") else base_im
            painted.crop(crop).resize((1024, 1024), Image.NEAREST).save(comfy.COMFY_DIR / "input" / fname)
            painted.save(out / "raw" / f"{name}-painted-base.png")
        for seed, denoise in zip(EXTRA_SEEDS, spec["denoise"]):
            started = time.time()
            comfy.SKIN_DENOISE_FOR[name] = denoise
            style = "" if key == "lodzia/portrait-slipper" else f", {STYLE}"
            if spec["base"] is not None and spec["base"].startswith("public"):
                style = ""
            path = comfy.render(name, spec["prompt"] + style, seed, fname)
            im = Image.open(path).convert("RGB")
            if spec.get("head"):
                small = im.resize((side, side), Image.BOX)
                mask = Image.new("L", (side, side), 0)
                ImageDraw.Draw(mask).ellipse((side * 0.04, side * 0.04, side * 0.96, side * 0.96), fill=255)
                mask = mask.filter(ImageFilter.GaussianBlur(side * 0.025))
                im = base_im.copy()
                im.paste(small, crop[:2], mask)
            _whiten(im).save(out / f"{name}-{seed}.png")
            print(f"{key} {seed} d={denoise} {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    names = sys.argv[1:]
    if names and names[0] == "extra":
        run_extra(names[1:])
        sys.exit(0)
    comfy.OUT.mkdir(parents=True, exist_ok=True)
    for key, (base, denoise, subject) in INIT.items():
        if key not in names:
            continue
        src = comfy.COMFY_DIR / "input" / f"{key}-base.png"
        ball_base(src)
        comfy.SKIN_DENOISE_FOR[key] = float(os.environ.get("DENOISE", denoise))
        for seed in SEEDS:
            started = time.time()
            path = comfy.render(key, f"{subject}, {STYLE}", seed, f"{key}-base.png")
            print(f"{path} {time.time() - started:.0f}s", flush=True)
    for key, subject in JOBS.items():
        if names and key not in names:
            continue
        for seed in SEEDS:
            started = time.time()
            path = comfy.render(key, f"{subject}, {STYLE}", seed)
            print(f"{path} {time.time() - started:.0f}s", flush=True)
