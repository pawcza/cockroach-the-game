"""Source stills for the run's enemies with the local ComfyUI (comfy.py's own style block, 768 px like art/sprites/*.png).

`python3 tools/art/enemies_render.py base [name ...]`   text-to-image, 3 seeds each -> art/renders/enemies/<name>-<seed>.png
`python3 tools/art/enemies_render.py state [name ...]`  second states, img2img from the picked seed of their base state
Picks live in art/renders/enemies/picks.json ({"boots-lifted": 23, ...}); the picked stills are copied by hand to art/sprites/enemies/ (tracked; the bakes read them from there).
Needs ComfyUI on :8189 (comfy.py's COMFY_URL). Run from the repo root.
"""
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy

OUT = Path("art/renders/enemies")
comfy.OUT = OUT
SEEDS = (11, 23, 37)
STYLE = comfy.STYLE
NOTEXT = "no text, no letters, no logo, no brand"
LEFT = "side view facing left"

# Phase 1: text to image
BASE = {
    "glue-trap": "a flat yellow cockroach glue trap board lying on the ground, rectangular cardboard tray with glossy sticky yellow glue, "
                 "seen from slightly above, slight perspective, a few tiny stuck specks",
    "bleach-bottle": "a chunky white plastic cleaning jug with a handle and a bright yellow screw cap, a big red warning diamond "
                     "pictogram with an abstract exclamation shape on the blank label, thick yellow-green liquid dripping from the cap, "
                     "no text, " + LEFT,
    "bleach-drop": "one single big falling drop of yellow-green bleach liquid, teardrop shape with a white highlight, centred",
    "bleach-splash": "a splash of yellow-green bleach liquid hitting the ground, a crown of droplets flying outward, with a white highlight",
    "boots-lifted": "a pair of heavy polished oxblood-brown leather wedding-party boots with bright white highlights and light tan soles, "
                    "white socks showing above the ankles, one boot lifted mid-step above the other, legs cut off above the white socks, " + LEFT,
    "gull": "a white seagull with grey wings gliding with the wings stretched out wide, yellow beak with a red dot, angry eye, " + LEFT,
    "robot-vacuum": "a round robot vacuum cleaner, low flat black and grey disc, menacing, one glowing red sensor eye on the front, "
                    "side three-quarter view facing left",
    "bug-zapper": "an electric insect zapper lamp, a metal cage with a glowing violet tube inside on a short hanging hook, idle soft glow",
    "mop-raised": "a wet string mop head lifted off the floor, thick grey-white cotton strings hanging down dripping soapy water, white "
                  "soap suds and bubbles clinging to the strings, a wooden handle going straight up out of the top, side view",
    "hedgehog": "a hedgehog with brown spines, a pointed snout sniffing, walking, small feet, " + LEFT,
    "bait": "a round poison bait station seen from the front at a low angle, a dark green plastic dish with a raised rim, a big bright glowing "
            "sickly yellow-green gel blob in the middle, a large bold white skull and crossbones pictogram on the front of the rim, a few dead "
            "bug crumbs around it",
    "lamp": "a bare hanging light bulb on a cord with a pull chain, the bulb is off with dark grey glass, centred",
    "vacuum": "a cream and teal canister vacuum cleaner seen from the side facing right, a huge exaggerated wide flat floor nozzle in front "
              "like a gaping mouth with a dark wide opening, dust clouds and debris streaming into the nozzle, menacing, bold simple shapes",
    "aerosol": "a bug-spray aerosol can standing upright, white and green with a black cap, a small red hazard flame icon without text, "
               "plain blank label",
    "repeller": "a plug-in ultrasonic pest repeller, a small white plastic box with a speaker grille, one small green LED and a plug, "
                "faint sound rings next to it",
    "wasp": "an emerald jewel wasp, slender metallic green and blue body, thin waist, long orange legs, translucent wings, hovering, " + LEFT,
    "hen": "a farmyard hen, red and brown feathers, red comb, standing with its head up, " + LEFT,
    "frog": "a fat green frog sitting, big round eyes, mouth closed, " + LEFT,
    "centipede": "a house centipede seen strictly from the side, its long segmented pale body running horizontally low above the ground, "
                 "dark brown bands on every segment, many long bold thin legs hanging down on one side and long antennae at the right end, "
                 "faces right",
    "slipper-swat-far": "side view, a human hand and bare forearm coming in from the right gripping a blue rubber flip-flop sandal by its "
                        "toe end, raised high and drawn back, the sole facing down, a thin grey shelf edge line at the bottom",
    "newspaper-swat-far": "side view, a human hand and bare forearm coming in from the right gripping a tightly rolled-up grey newspaper "
                          "like a club by one end, raised high and drawn back, newsprint shown only as abstract grey lines, a thin grey "
                          "shelf edge line at the bottom",
    "slipper-swat-far-nohand": "side view, a blue rubber flip-flop sandal raised high and tilted back, the sole facing down, no hand, "
                               "a thin grey shelf edge line at the bottom",
    "slipper-swat-mid-nohand": "side view, a blue rubber flip-flop sandal swinging down hard, tilted steeply, the sole about to hit "
                               "the ground, motion streaks, no hand, a thin grey shelf edge line at the bottom",
    "newspaper-swat-far-nohand": "side view, a tightly rolled-up grey newspaper club raised high and tilted back, newsprint shown only as "
                                 "abstract grey lines, no hand, a thin grey shelf edge line at the bottom",
    "newspaper-swat-mid-nohand": "side view, a tightly rolled-up grey newspaper club swinging down hard, tilted steeply, about to hit the "
                                 "ground, motion streaks, newsprint shown only as abstract grey lines, no hand, a thin grey shelf edge "
                                 "line at the bottom",
    "slipper-swat-flat-t2i": "side view at ground level, a human hand and bare forearm coming in from the right pressing a blue rubber flip-flop "
                             "sandal flat against the ground, the sandal is a very low wide horizontal shape lying on the ground with the "
                             "hand on top of it, impact pose, a thin grey shelf edge line at the bottom",
    "newspaper-swat-flat-t2i": "side view at ground level, a human hand and bare forearm coming in from the right pressing a rolled-up grey "
                               "newspaper flat, the roll lying horizontally along the ground under the hand, a low wide shape, impact pose, "
                               "newsprint shown only as abstract grey lines, a thin grey shelf edge line at the bottom",
    "slipper-flat": "a blue rubber flip-flop sandal lying flat on the ground seen from the side at ground level, a very low thin wide "
                    "horizontal profile, the thin sole on the ground and the Y-shaped strap arching slightly over it, side view, a thin grey "
                    "shelf edge line at the bottom",
    "newspaper-flat": "a tightly rolled-up grey newspaper lying on its side on the ground, a wide horizontal cylinder seen from the side at "
                      "ground level, lying flat along the ground, newsprint shown only as abstract grey lines, a thin grey shelf edge line at "
                      "the bottom",
}

# (slipper-flat / newspaper-flat first went through img2img from the existing flipper.png / newspaper.png at 0.78: the model kept the
# top-down / upright view, so the final ones are text to image, see BASE)
EXT = {}

# Phase 2: second state, same design: name -> (base state it comes from, prompt, denoise)
STATE = {
    "boots-stomped": ("boots-lifted", "the same pair of heavy polished oxblood-brown leather wedding-party boots with white socks above the "
                      "ankles, both stomped flat on the ground with a puff of grey dust, legs cut off above the white socks, " + LEFT, 0.62),
    "mop-sweep": ("mop-raised", "the same wet string mop head pressed flat on the floor sweeping along it, the strings splayed out sideways "
                  "over the ground, a trail of white soap suds and bubbles behind it, the handle going up out of the top, side view", 0.68),
    "gull-dive": ("gull", "a white seagull with grey wings plunging steeply down to the lower left, body pointing downward, wings tucked "
                  "back along the body, yellow beak wide open, angry eye, " + LEFT, 0.82),
    "robot-vacuum-broken": ("robot-vacuum", "the same round robot vacuum cleaner, broken, cracked shell, grey smoke rising, the red sensor eye "
                            "dead and dark, side three-quarter view facing left", 0.55),
    "bug-zapper-zap": ("bug-zapper", "the same electric insect zapper lamp discharging, a huge jagged bright white-yellow lightning bolt "
                       "shooting out of the cage sideways, violet sparks, blazing glow", 0.74),
    "slipper-swat-mid": ("slipper-swat-far", "the same human hand and forearm swinging the same blue rubber flip-flop sandal down hard "
                         "mid-swing, tilted steeply downward, the sole about to hit the ground, side view, thin grey shelf edge line", 0.66),
    "slipper-swat-flat": ("slipper-swat-far", "the same human hand pressing the same blue rubber flip-flop sandal flat against the ground, "
                          "sole down, a low wide shape seen from the side, impact pose, thin grey shelf edge line", 0.7),
    "newspaper-swat-mid": ("newspaper-swat-far", "the same human hand and forearm swinging the same rolled-up grey newspaper club down hard "
                           "mid-swing, tilted steeply downward, about to hit the ground, side view, thin grey shelf edge line", 0.66),
    "newspaper-swat-flat": ("newspaper-swat-far", "the same human hand pressing the same rolled-up grey newspaper flat, the roll lying "
                            "horizontally along the ground under the hand, a low wide shape seen from the side, impact pose, thin grey "
                            "shelf edge line", 0.7),
    "hedgehog-charge": ("hedgehog", "the same hedgehog charging forward fast with its head lowered right down and the snout pointing at the "
                        "ground, all spines bristling straight up, body leaning forward, " + LEFT, 0.78),
    "lamp-on": ("lamp", "the same hanging light bulb on a cord with a pull chain, switched on, the whole bulb glowing blazing bright "
                "yellow and white, big yellow glow rays around it", 0.74),
    "aerosol-explosion": ("aerosol", "the same bug-spray aerosol can bursting apart in a big explosion, the can split open, a big fireball "
                          "of orange and yellow flames engulfing it, flying metal shards", 0.8),
    "wasp-dive": ("wasp", "the same emerald jewel wasp diving steeply down to the lower left, body pointing downward, the curved stinger "
                  "at the tail end pointing forward and down, wings swept back, " + LEFT, 0.8),
    "hen-peck": ("hen", "the same farmyard hen bent far forward pecking down hard, the head and open beak low at the ground in front of "
                 "its feet, tail raised, " + LEFT, 0.8),
    "frog-open": ("frog", "the same fat green frog sitting with its mouth gaping wide open, a huge open mouth with a bright pink inside "
                  "and no tongue, " + LEFT, 0.74),
}


def run(name, prompt, init=None, denoise=None):
    for seed in SEEDS:
        started = time.time()
        if denoise is not None:
            comfy.SKIN_DENOISE_FOR[name] = denoise
        try:
            path = comfy.render(name, f"{prompt}, {NOTEXT}, {STYLE}", seed, init)
        except Exception as error:  # a failed render gets one retry, then it is skipped
            print(f"{name} {seed} failed once: {error}", flush=True)
            try:
                path = comfy.render(name, f"{prompt}, {NOTEXT}, {STYLE}", seed, init)
            except Exception as error2:
                print(f"{name} {seed} SKIPPED: {error2}", flush=True)
                continue
        print(f"{path} {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    mode, names = sys.argv[1], sys.argv[2:]
    if mode == "ext":
        for name, (src, prompt, denoise) in EXT.items():
            if names and name not in names:
                continue
            fname = f"enemy-{name}-source.png"
            shutil.copy(src, comfy.COMFY_DIR / "input" / fname)
            run(name, prompt, fname, denoise)
    elif mode == "base":
        for name, prompt in BASE.items():
            if not names or name in names:
                run(name, prompt)
    else:
        picks = json.loads((OUT / "picks.json").read_text())
        for name, (base, prompt, denoise) in STATE.items():
            if names and name not in names:
                continue
            seed = picks[base]
            fname = f"enemy-{base}-source.png"
            shutil.copy(OUT / f"{base}-{seed}.png", comfy.COMFY_DIR / "input" / fname)
            run(name, prompt, fname, denoise)
