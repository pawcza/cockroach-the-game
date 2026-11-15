"""Source stills for the run's enemies with the local ComfyUI (comfy.py's own style block, 768 px like art/sprites/*.png).

`python3 tools/art/enemies_render.py base [name ...]`   text-to-image, 3 seeds each -> art/renders/enemies/<name>-<seed>.png
`python3 tools/art/enemies_render.py skin [name ...]`   the level skins (SKIN), text-to-image like base -> art/renders/enemies/lv<level>-<thing>-<seed>.png
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
SEEDS = comfy.SEEDS  # 11, 23, 37 unless SEEDS=... says otherwise
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
    # Mid-swing, held by the heel (3 seeds each; picked: 105 -> seed 37, 145 -> seed 23). The rig reads them as the toe's heading
    # about the heel, about 100 and 150 degrees
    "slipper-swing-105": "side view, a blue rubber flip-flop sandal held upright in mid-air by its heel end at the bottom, swinging, the long "
                         "toe end pointing up and tilted slightly to the left, seen a little from below so the thick rubber sole faces left, "
                         "the Y-shaped strap on the right side, no hand, nothing else in the picture",
    "slipper-swing-145": "side view, a blue rubber flip-flop sandal in mid-air swinging down, tilted about 35 degrees above horizontal, the "
                         "heel end low on the right and the long toe end up on the left, seen a little from below so the thick rubber sole "
                         "faces down and left, the Y-shaped strap arching over the top, no hand, nothing else in the picture",
    "newspaper-swat-far-nohand": "side view, a tightly rolled-up grey newspaper club raised high and tilted back, newsprint shown only as "
                                 "abstract grey lines, no hand, a thin grey shelf edge line at the bottom",
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

# Second states of the level skins (img2img from the picked seed of the skin, picks.json key = the skin id, e.g. "lv5-carp"),
# named <skin>-<pose> after the base enemy's own second state: -open (frog), -on (lamp), -sweep (mop), -dive (gull, wasp),
# -zap (zapper), -broken (robot vacuum), -explosion (aerosol). Same denoise as the base's state of that kind.
SKIN_STATE = {
    # lamp -> lit (the whole thing glowing, rays round it)
    "lv4-flashlight-on": ("lv4-flashlight", "the same old camping storm lantern hanging from its wire handle, lit, the glass chimney glowing warm yellow and white "
                          "with a bright flame inside, warm yellow light rays shining out all round it, downwards too", 0.74),
    "lv5-treelight-on": ("lv5-treelight", "the same old-fashioned Christmas tree light bulb on its green cord with the sprig of fir, switched on, "
                         "the whole bulb glowing blazing bright warm yellow and white, big yellow glow rays around it", 0.74),
    "lv6-spotlight-on": ("lv6-spotlight", "the same black stage spotlight can hanging from its clamp, switched on, a blazing bright white-yellow "
                         "lens, big bright light rays shining out around it", 0.74),
    # mop -> pressed flat on the floor, sweeping
    "lv4-rake-sweep": ("lv4-rake", "the same wooden garden rake head pressed flat on the ground raking along it, the teeth splayed out sideways "
                       "over the ground with dead leaves and a little dust swept up behind it, the handle going up out of the top, side view", 0.68),
    "lv7-seaweed-sweep": ("lv7-seaweed", "the same wet clump of seaweed pressed flat on the sand sweeping along it, the ribbons splayed out "
                          "sideways over the ground, a trail of white sea foam and bubbles behind it, the driftwood stick going up out of the top, "
                          "side view", 0.68),
    # frog -> mouth wide open
    "lv5-carp-open": ("lv5-carp", "the same fat grey-gold carp fish in its white enamel basin with its mouth gaping wide open, a huge open "
                      "round mouth with a bright pink inside, " + LEFT, 0.74),
    "lv6-blower-open": ("lv6-blower", "the same striped pink and yellow party blower noisemaker on its paper party hat, its paper tube blown "
                        "out and unrolled long to the left, mouthpiece to the right", 0.74),
    "lv7-octopus-open": ("lv7-octopus", "the same fat purple octopus sitting on the sand with one long tentacle shot straight out to the left "
                         "and its beak mouth wide open, big round eyes, " + LEFT, 0.74),
    "lv8-blob-open": ("lv8-blob", "the same fat pink alien blob creature with its wide mouth gaping open and a long pink tongue stuck out "
                      "to the left, three big round eyes on stalks, " + LEFT, 0.74),
    # gull / wasp -> diving
    "lv8-meteor-dive": ("lv8-meteor", "a dark jagged meteor rock plunging steeply down to the lower left, glowing orange underside, "
                        "a long fiery trail of sparks behind it", 0.82),
    "lv9-eagle-dive": ("lv9-eagle", "a white eagle with a golden beak and golden claws plunging steeply down to the lower left, body pointing "
                       "downward, wings tucked back along the body, golden beak wide open, angry eye, " + LEFT, 0.82),
    "lv8-ufo-dive": ("lv8-ufo", "the same tiny silver flying saucer with a glowing green dome tipped steeply and diving down to the lower left, "
                     "a bright green beam shooting down from underneath, " + LEFT, 0.8),
    "lv9-mosquito-dive": ("lv9-mosquito", "the same huge mosquito diving steeply down to the lower left, body pointing downward, the long "
                          "needle nose pointing forward and down, wings swept back, " + LEFT, 0.8),
    # zapper -> discharging
    "lv8-antenna-zap": ("lv8-antenna", "the same tesla coil antenna mast discharging, a huge jagged bright white-yellow lightning bolt "
                        "shooting out of the metal ball sideways, violet sparks, blazing glow", 0.74),
    "lv9-tree-zap": ("lv9-tree", "the same pale bone-white birch tree with white bark, discharging, a huge jagged bright white-yellow lightning "
                     "bolt shooting out of the split in the trunk, violet sparks, blazing glow", 0.52),
    # robot vacuum -> broken down
    "lv8-rover-broken": ("lv8-rover", "the same old Soviet lunar rover tilted over on one side, broken, one wheel off, grey smoke rising, the red "
                         "camera eye dark, side three-quarter view facing left", 0.42),
    "lv9-boar-broken": ("lv9-boar", "the same warm brown boar with two big bright white tusks collapsed on the ground, legs splayed out sideways, tongue hanging out of its mouth, "
                        "dizzy stars and a little grey smoke over its head, the red eye dim, side three-quarter view facing left", 0.7),
    # aerosol -> bursting
    "lv8-moonrock-explosion": ("lv8-moonrock", "the same tall grey lunar standing stone cracked apart in a big explosion, split in two lengthwise, a big fireball of "
                               "orange and yellow flames bursting out, flying rock shards", 0.8),
    "lv9-vodka-explosion": ("lv9-vodka", "a glass vodka bottle shattering into many pieces mid-burst, big glass shards flying outward in all directions, "
                            "a big splash of pale green liquid, the cap flying off, a bright orange flash of fire in the middle", 0.9),
    "lv10-mutant-crouch": ("lv10-mutant", "the same pale green three-eyed mutant cat pressed very low to the ground in a crouch, chest down and rear up, "
                           "glowing yellow eyes, ready to spring, " + LEFT, 0.72),
    "lv10-mutant-pounce": ("lv10-mutant", "the same pale green three-eyed mutant cat leaping through the air in a pounce, body stretched out long, front "
                           "legs reaching far forward with claws out and rear legs stretched back, mouth open, " + LEFT, 0.82),
    "lv10-vulture-dive": ("lv10-vulture", "the same pale bone-grey wasteland vulture plunging steeply down to the lower left, wings swept back along the "
                          "body, talons stretched forward, bald pink head stretched out, " + LEFT, 0.82),
    "lv10-drone-dive": ("lv10-drone", "the same chunky pale off-white and light grey quadcopter drone with four round rotor discs, teal lights and a big "
                        "red camera eye, tilted steeply nose-down diving to the lower left, " + LEFT, 0.66),
    "lv10-wire-charge": ("lv10-wire", "the same tumbleweed ball of pale steel barbed wire spinning fast, a shower of bright sparks where it scrapes "
                         "the ground behind it, motion lines", 0.7),
    # cat skins -> a low wind-up crouch and an airborne pounce (frames 8/10 and 9/11 of the cat strip)
    "lv6-dog-crouch": ("lv6-dog", "the same dalmatian fire station dog wearing the red fireman's helmet, pressed very low to the ground in a crouch, "
                       "chest down and rear up, ready to spring, " + LEFT, 0.72),
    "lv6-dog-pounce": ("lv6-dog", "the same dalmatian fire station dog wearing the red fireman's helmet, leaping through the air in a pounce, body "
                       "stretched out long, front legs reaching far forward and rear legs stretched back, mouth open, " + LEFT, 0.82),
    "lv7-crab-crouch": ("lv7-crab", "the same olive-green and sandy brown Baltic shore crab pressed very low to the ground, legs folded under it, both "
                        "big claws drawn back, " + LEFT, 0.72),
    "lv7-crab-pounce": ("lv7-crab", "the same olive-green and sandy brown Baltic shore crab leaping through the air, both big claws snapped wide "
                        "open and raised high ahead of it, legs stretched out, " + LEFT, 0.82),
    "lv8-alien-crouch": ("lv8-alien", "the same small green alien creature with big black eyes pressed very low to the ground in a crouch, knees "
                         "bent, arms drawn back, ready to spring, " + LEFT, 0.72),
    "lv8-alien-pounce": ("lv8-alien", "the same small green alien creature with big black eyes leaping through the air, both long arms thrown far "
                         "forward with the fingers spread, legs stretched back, " + LEFT, 0.82),
    "lv9-lynx-crouch": ("lv9-lynx", "the same sandy-gold spotted lynx pressed very low to the ground in a crouch, belly almost on the ground, "
                        "haunches up, ears flat, ready to spring, " + LEFT, 0.72),
    "lv9-lynx-pounce": ("lv9-lynx", "the same sandy-gold spotted lynx leaping through the air in a pounce, body stretched out long, front paws "
                        "reaching far forward with claws out and rear legs stretched back, mouth open, " + LEFT, 0.82),
}
STATE.update(SKIN_STATE)


# Level skins (mode `skin`): the same enemy drawn as something that belongs to the level, lv<level>-<thing>. Text to image like
# BASE; the comment on each line names the enemy whose behaviour, hitbox and rig it takes, so its outline should stay close to it
RAISED = "raised high and tilted back in mid-air, no hand, nothing else in the picture, side view"
FLAT = "lying flat along the ground, a very low wide horizontal shape, no hand, nothing else in the picture, side view at ground level"
SWAT_SKINS = {
    "lv3-flyswatter": "a plastic fly swatter with a solid bright lime-green square head with a simple coarse grid of square holes on a long thin red handle",                    # flipper
    "lv4-branch": "a short bushy pine branch with dense dark green needles and a thick brown broken end",                  # flipper
    "lv4-frond": "a big green fern frond with many small leaflets on a stiff stem",                                        # newspaper
    "lv6-mug": "a heavy glass beer mug with a thick handle, full of golden beer with white foam spilling over the rim",    # flipper
    "lv6-vinyl": "a black vinyl record half out of its square cardboard sleeve, the sleeve bright pink and yellow",         # newspaper
    "lv7-slide": "a navy blue rubber pool slide sandal with two white stripes across its wide strap, thick sole",          # flipper
    "lv7-windbreak": "a rolled-up striped beach windbreak, red white and blue fabric wound round wooden poles, like a club",  # newspaper
    "lv8-slipper": "an ornate red velvet slipper with gold embroidery and a small gold cross on the toe, thin leather sole",  # flipper
    "lv8-scroll": "a rolled-up parchment scroll with a red wax seal and a gold ribbon, held like a club",                  # newspaper
    "lv9-bottle": "a tall clear glass vodka bottle held by its neck, pale green liquid, one long blade of grass inside it, blank green label",  # flipper
    "lv9-label": "a huge curling paper bottle label, pale green with a brown bison silhouette, rolled into a loose tube",   # newspaper
    "lv10-sign": "a bent street sign on a short broken pole, a blank pale blue enamel plate with chipped edges and a few rust spots, no text, no symbols",  # flipper
    "lv10-pipe": "a length of pale grey-green corroded metal pipe with a flange and a bolt at one end, held like a club",     # newspaper
}
SKIN = {
    **{f"{name}-raised": f"{prompt}, {RAISED}" for name, prompt in SWAT_SKINS.items()},
    **{f"{name}-flat": f"{prompt}, {FLAT}" for name, prompt in SWAT_SKINS.items()},
    # 2 Klatka Schodowa
    "lv2-fern": "a potted fern houseplant in a brown clay pot on a small crocheted doily, droopy green fronds",              # onion
    "lv2-pipe": "a short rusty old water pipe elbow joint with a red valve wheel, a drop of water hanging from the joint",  # bleach
    # 3 Hala Targowa
    "lv3-tomato": "a squashed ripe red tomato splattered flat on the ground, juicy pulp and seeds, seen from slightly above",  # glue
    "lv3-barrel": "a small wooden pickle barrel with metal hoops, tipped so pale green brine with a pickle and dill drips over its rim, " + LEFT,  # bleach
    # 4 Las Grochodrzew
    "lv4-toadstool": "a fat red fly agaric toadstool with white spots and a thick white stem, a little moss at its foot",   # onion
    "lv4-resin": "a flat puddle of glossy sticky amber tree resin on the ground, a few pine needles stuck in it, seen from slightly above",  # glue
    "lv4-resin-stub": "a thick broken pine branch stub with rough bark, a big bead of glossy amber resin oozing from the broken end, " + LEFT,  # bleach
    "lv4-puffball": "a round pale brown puffball mushroom with a hole on top puffing out a small cloud of olive-brown spores",  # spray
    "lv4-flashlight": "an old camping storm lantern hanging from its wire handle, metal frame, glass chimney, small flame chamber, switched off with dark glass, centred",  # lamp
    "lv4-rake": "the head of a wooden garden rake lifted off the ground, wide row of wooden teeth with dead leaves caught in them, "
                "a wooden handle going straight up out of the top, side view",                                              # mop
    "lv4-molehole": "a fresh molehill of dark crumbly earth with a wide gaping black hole in its side like a mouth, loose soil and "
                    "leaves streaming into the hole, seen from the side with the hole facing right, bold simple shapes",       # vacuum
    # 5 Wigilia u Babci
    "lv5-bauble": "a big shiny red glass Christmas bauble with a gold cap and a painted white snowflake, standing on the ground",  # onion
    "lv5-candle": "a thick red Christmas candle in a brass holder, tilted, lit, a big drop of melted red wax dripping from its rim, " + LEFT,  # bleach
    "lv5-snowcan": "a spray can of artificial Christmas snow, white and blue with a red cap and a plain snowflake icon, blank label",  # spray
    "lv5-angel": "a small flying Christmas nativity angel figurine with gold wings spread wide, white robe, blowing a tiny gold trumpet, " + LEFT,  # bird
    "lv5-goose": "a fat white farm goose with an orange beak, standing with its neck stretched up, angry, " + LEFT,         # hen
    "lv5-treelight": "one big old-fashioned Christmas tree light bulb hanging on a green cord with a sprig of fir, the bulb is off with dark glass, centred",  # lamp
    "lv5-carp": "a fat grey-gold carp fish sitting upright in a low white enamel basin of water, big round eyes, mouth closed, " + LEFT,  # frog
    # 6 Dyskoteka w Remizie
    "lv6-extinguisher": "a red fire extinguisher standing upright, black hose and nozzle pointing left, a small plain gauge, blank label",  # spray
    "lv6-coaster": "a round cardboard beer coaster spinning through the air like a thrown disc, red rim, motion tilted, " + LEFT,  # bird
    "lv6-dog": "a dalmatian fire station dog wearing a small red fireman's helmet, crouched ready to pounce, " + LEFT,       # cat
    "lv6-blower": "a party blower noisemaker lying on a paper party hat, striped pink and yellow, its paper tube rolled up tight, mouthpiece to the right",  # frog
    "lv6-spotlight": "a black stage spotlight can hanging from a clamp, pointing down, switched off, dark lens",             # lamp
    "lv6-speaker": "a low wide light silver-grey disco bass bin loudspeaker cabinet, much wider than it is tall, seen from the side facing right, one "
                   "huge bass cone in front like a gaping mouth ringed by a thick bright teal ring, confetti and dust streaming into the cone, "
                   "bold simple shapes",   # vacuum
    # 7 Morze Bałtyckie
    "lv7-sunscreen": "a spray bottle of sunscreen, orange and white with a blue cap and a plain yellow sun icon, blank label",  # spray
    "lv7-cormorant": "a black cormorant sea bird with a hooked yellow beak, standing with its head up, " + LEFT,              # hen
    "lv7-crab": "a Baltic shore crab with an olive-green and sandy brown shell, a pale cream underside and pale cream claw tips, sitting low with both big claws held half open in front, " + LEFT,                         # cat
    "lv7-octopus": "a fat purple octopus sitting on the sand, big round eyes, tentacles curled in tight, " + LEFT,            # frog
    "lv7-shrimp": "a long pink Baltic shrimp seen strictly from the side, its segmented body running horizontally low above the ground, "
                  "many thin legs hanging down and long antennae at the right end, faces right",                              # centipede
    "lv7-sandals": "a pair of brown leather sandals worn over white socks, one foot lifted mid-step above the other, legs cut off above "
                   "the white socks, " + LEFT,                                                                                # boots
    "lv7-seaweed": "a wet clump of dark green and brown seaweed lifted off the ground, long ribbons hanging down dripping sea foam, "
                   "a driftwood stick going straight up out of the top, side view",                                           # mop
    # 8 Papież na Księżycu
    "lv8-moonrock": "a tall upright lunar boulder, a standing stone clearly taller than it is wide, grey with small craters and a little grey dust at its foot",           # aerosol
    "lv8-thurible": "an ornate golden church incense burner hanging on three chains, a small puff of white smoke coming from its holes",  # spray
    "lv8-spacehen": "a farmyard hen wearing a round glass space helmet and a tiny white backpack, standing with its head up, " + LEFT,  # hen
    "lv8-alien": "a small green alien creature with big black eyes and long arms, crouched ready to pounce, " + LEFT,         # cat
    "lv8-blob": "a fat pink alien blob creature sitting, three big round eyes on stalks, wide mouth closed, " + LEFT,         # frog
    "lv8-satellite": "a small boxy gold-foil satellite with two blue solar panel wings and a dish antenna, floating",          # jellyfish
    "lv8-meteor": "a dark jagged meteor rock flying to the left, glowing orange underside, short trail of sparks behind it",   # gull
    "lv8-ufo": "a tiny silver flying saucer with a glowing green dome and three small lights underneath, hovering, " + LEFT,   # wasp
    "lv8-antenna": "a tesla coil antenna mast, a copper coil tower topped with a metal ball with a soft violet glow, idle",   # zapper
    "lv8-rover": "an old Soviet lunar rover, a round silver tub body on eight small wire wheels with an open lid and antennas, one glowing "
                 "red camera eye on the front, side three-quarter view facing left",                                          # robot vacuum
    # 9 Wymiar Żubrówki
    "lv9-vodka": "a tall clear glass vodka bottle standing upright, pale green liquid, one long blade of grass inside it, plain blank green label",  # aerosol
    "lv9-lynx": "a lynx wild cat with light sandy-gold fur, clear dark brown spots, a white chin and white chest, black ear tufts and a short black-tipped tail, standing on all four legs in a side profile, walking, " + LEFT,           # cat
    "lv9-shotglass": "a small shot glass floating in the air, full of pale green glowing liquid, a few drops spilling over the rim",  # jellyfish
    "lv9-eagle": "a white eagle with a golden beak and golden claws gliding with the wings stretched out wide, angry eye, " + LEFT,  # gull
    "lv9-mosquito": "a huge mosquito, long thin legs, striped abdomen, long needle nose, translucent wings, hovering, " + LEFT,  # wasp
    "lv9-tree": "a tall pale bone-white dead birch tree with white bark and dark knots, bare forked top, a soft violet electric glow in the "
                "split of the trunk, idle",  # zapper
    "lv9-boar": "a stocky wild boar with a warm mid-brown bristly coat, a lighter tan snout and belly, bright white tusks and one glowing red "
                "eye, low to the ground, side three-quarter view facing left",                                                                             # robot vacuum
    "lv9-mushrooms": "a small tight ring of glowing pale green mushrooms on a mossy mound, faint rings of light pulsing around it",  # repeller
    # 10 Karaluch Widzi Wszystko (orange and dark brown, red glow: cool and pale subjects)
    "lv10-mutant": "a mangy three-eyed mutant cat, pale sickly-green fur with bald patches, glowing yellow eyes, one ragged ear, standing on all four legs in a side profile, walking, " + LEFT,  # cat
    "lv10-fridge": "a small old white enamel fridge floating upright in the air, the door slightly ajar with a cold teal glow leaking out, a trailing "
                   "electric cable dangling beneath it like tentacles",                                                              # jellyfish
    "lv10-vulture": "a scrawny wasteland vulture with pale bone-grey feathers and a bald pink head, wings stretched wide gliding, " + LEFT,  # gull
    "lv10-drone": "a chunky quadcopter surveillance drone with a thick pale off-white and light grey shell, four big clear round rotor discs, "
                  "bright teal status lights and one big red camera eye underneath, bold simple shapes, hovering, " + LEFT,  # wasp
    "lv10-trolley": "a bold simple chunky shopping trolley, thick pale steel bars forming a basket of only a few big square gaps, a red handle, "
                    "four big wheels, one tilted wonky wheel, three tin cans in the basket, big flat colours, very simple shapes, " + LEFT,  # bison
    "lv10-wire": "a tumbleweed ball of barbed wire, pale steel with a few rust flecks, round, resting on the ground",               # hedgehog
}

# Re-rolled prompts (the first text-to-image pass came out wrong for these)
SKIN["lv10-sign-flat"] = ("a big round pale blue enamel street sign plate with a white border and chipped rust spots, no symbols, lying flat on the ground "
                          "seen from slightly above in three-quarter top view so the round face shows, a short thick grey pole stuck out to the "
                          "right along the ground, a low wide shape, no hand, nothing else in the picture")
SKIN["lv10-sign-raised"] = ("a round pale blue enamel street sign plate with a white border and chipped rust spots, no symbols, seen nearly face-on, "
                            "on a very long straight thick grey pole twice as long as the plate is wide, the pole running diagonally from the "
                            "bottom left up to the plate at the top right, raised high in mid-air, no hand, nothing else in the picture")
SKIN["lv3-flyswatter-flat"] = ("a plastic fly swatter with a solid bright lime-green square head with a simple coarse grid of square holes and a short thick red "
                               "handle lying flat on the ground, seen from slightly above in three-quarter top view so the whole green head "
                               "shows its face, head at the left and handle to the right, no hand, nothing else in the picture")
SKIN["lv7-windbreak-flat"] = ("a rolled-up striped beach windbreak, red white and blue fabric wound round wooden poles, lying on the ground seen "
                              "from slightly above in three-quarter top view so the striped roll shows its face, a long horizontal shape, no hand, "
                              "nothing else in the picture")
SKIN["lv9-bottle-flat"] = ("one single clear glass vodka bottle lying on its side on the ground, neck pointing left, pale green liquid, one blade "
                           "of grass inside it, plain blank green label, a low wide horizontal shape, only one bottle, no hand, nothing else in the "
                           "picture, side view at ground level")


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
    elif mode in ("base", "skin"):
        for name, prompt in (BASE if mode == "base" else SKIN).items():
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
