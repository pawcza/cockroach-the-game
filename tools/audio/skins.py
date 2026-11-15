"""Which sounds each level skin gets of its own, and which it keeps from its base enemy.

A skin is the same enemy behaviour drawn as something that fits the level (an onion in the kitchen is a toadstool in the
forest). Its sounds are the base enemy's sound keys: a key listed under `made` has a sound built here
(sounds_skins.py, id and file `<skin>-<key>`, installed by install.py to public/audio/skins/); a key under `reuse`
keeps the base sound and says why. Every key of the base enemy is in exactly one of the two, and build.py asserts that
sounds_skins.py registers exactly the `made` ones. install.py writes public/audio/skins/manifest.json from `made`.

A base key is the name of the base sound's file in public/audio (the game's own key differs for the older ones: the
game loads onion.ogg as 'onion-sfx', spray.ogg as 'spray-sfx', flipper.ogg as 'flipper-sfx', newspaper.ogg as
'newspaper-sfx', bird.ogg as 'bird-sfx', cat.ogg as 'cat-sfx' and jellyfish.ogg as 'jellyfish-sfx').
"""

# base enemy -> the sound keys it plays (checked against src/objects/obstacles/*.ts)
BASE_KEYS = {
    "onion": ["onion"], "glue": ["glue-squelch"], "flipper": ["flipper"], "newspaper": ["newspaper"], "spray": ["spray"],
    "bleach": ["bleach-drip"], "lamp": ["lamp-flicker", "lamp-snap"], "mop": ["mop-slap"], "vacuum": ["vacuum-roar"],
    "bird": ["bird"], "hen": ["hen-cluck", "hen-peck"], "cat": ["cat"], "frog": ["frog-croak", "frog-tongue"],
    "centipede": ["centipede-rear"], "boots": ["boots-stomp"], "jellyfish": ["jellyfish"], "gull": ["gull-screech"],
    "wasp": ["wasp-buzz", "wasp-dive"], "zapper": ["zapper-charge", "zapper-bolt"],
    "robotVacuum": ["robovac-whir", "robovac-crack"], "aerosol": ["aerosol-rattle", "aerosol-blast"],
    "repeller": ["repeller-hum", "repeller-ring"],
    "bison": ["bison"], "hedgehog": ["hedgehog"],
}


def _s(level, base, what, made=(), reuse=None):
    return {"level": level, "base": base, "what": what, "made": list(made), "reuse": reuse or {}}


SKINS = {
    # Level 2 stairwell
    "lv2-fern": _s(2, "onion", "potted fern", ["onion"]),
    "lv2-pipe": _s(2, "bleach", "leaking rusty water pipe", ["bleach-drip"]),
    # Level 3 market hall
    "lv3-tomato": _s(3, "glue", "squashed tomato", ["glue-squelch"]),
    "lv3-flyswatter": _s(3, "flipper", "plastic fly swatter", ["flipper"]),
    "lv3-barrel": _s(3, "bleach", "pickle barrel dripping brine", ["bleach-drip"]),
    # Level 4 forest
    "lv4-toadstool": _s(4, "onion", "toadstool", ["onion"]),
    "lv4-resin": _s(4, "glue", "resin puddle", reuse={"glue-squelch": "a sticky squelch is what a resin puddle does"}),
    "lv4-branch": _s(4, "flipper", "pine branch swat", ["flipper"]),
    "lv4-resin-stub": _s(4, "bleach", "branch stub dripping resin", ["bleach-drip"]),
    "lv4-puffball": _s(4, "spray", "puffball mushroom puffing spores", ["spray"]),
    "lv4-frond": _s(4, "newspaper", "fern frond swat", ["newspaper"]),
    "lv4-flashlight": _s(4, "lamp", "old hand flashlight", ["lamp-flicker", "lamp-snap"]),
    "lv4-rake": _s(4, "mop", "rake sweep", ["mop-slap"]),
    "lv4-molehole": _s(4, "vacuum", "molehill sucking things in", ["vacuum-roar"]),
    # Level 5 Christmas Eve at grandma's
    "lv5-bauble": _s(5, "onion", "glass bauble", ["onion"]),
    "lv5-candle": _s(5, "bleach", "candle dripping wax", ["bleach-drip"]),
    "lv5-snowcan": _s(5, "spray", "artificial snow spray can", reuse={"spray": "a spray can hissing is a spray can hissing"}),
    "lv5-angel": _s(5, "bird", "flying nativity angel with a tiny trumpet", ["bird"]),
    "lv5-goose": _s(5, "hen", "goose", ["hen-cluck"], {"hen-peck": "a beak pecking the floor is the same tock"}),
    "lv5-treelight": _s(5, "lamp", "Christmas tree light bulb",
                        reuse={"lamp-flicker": "a bulb flickering is electric ticks too", "lamp-snap": "a bulb snapping on: click, zap, glassy ting"}),
    "lv5-carp": _s(5, "frog", "carp in a basin", ["frog-croak", "frog-tongue"]),
    # Level 6 village fire-station disco
    "lv6-mug": _s(6, "flipper", "heavy beer mug slam", ["flipper"]),
    "lv6-extinguisher": _s(6, "spray", "fire extinguisher blast", ["spray"]),
    "lv6-vinyl": _s(6, "newspaper", "vinyl record in its sleeve swat", ["newspaper"]),
    "lv6-coaster": _s(6, "bird", "thrown beer coaster whizzing", ["bird"]),
    "lv6-dog": _s(6, "cat", "dalmatian pounce", ["cat"]),
    "lv6-blower": _s(6, "frog", "party blower", ["frog-croak", "frog-tongue"]),
    "lv6-spotlight": _s(6, "lamp", "stage spotlight",
                        reuse={"lamp-flicker": "a stage lamp flickering is electric ticks and a buzz", "lamp-snap": "a big lamp thunking on: click, zap, mains hum"}),
    "lv6-speaker": _s(6, "vacuum", "bass speaker sucking in", ["vacuum-roar"]),
    # Level 7 Baltic beach
    "lv7-slide": _s(7, "flipper", "rubber pool slide slap", reuse={"flipper": "rubber slapping on a floor: the slipper's slap"}),
    "lv7-sunscreen": _s(7, "spray", "sunscreen spray", reuse={"spray": "a spray can hissing is a spray can hissing"}),
    "lv7-windbreak": _s(7, "newspaper", "rolled windbreak (fabric and poles) swat", ["newspaper"]),
    "lv7-cormorant": _s(7, "hen", "cormorant", ["hen-cluck"], {"hen-peck": "a beak pecking the floor is the same tock"}),
    "lv7-crab": _s(7, "cat", "crab pounce (clicking claws)", ["cat"]),
    "lv7-octopus": _s(7, "frog", "octopus", ["frog-croak", "frog-tongue"]),
    "lv7-shrimp": _s(7, "centipede", "shrimp rearing", ["centipede-rear"]),
    "lv7-sandals": _s(7, "boots", "sandals with socks stomping in sand", ["boots-stomp"]),
    "lv7-seaweed": _s(7, "mop", "wet seaweed slap", reuse={"mop-slap": "a wet slap and a sweeping drag: wet seaweed does what the wet mop does"}),
    # Level 8 the Pope on the Moon
    "lv8-moonrock": _s(8, "aerosol", "moon rock (rattles, then cracks and crumbles)", ["aerosol-rattle", "aerosol-blast"]),
    "lv8-slipper": _s(8, "flipper", "velvet slipper slap", reuse={"flipper": "it is a slipper"}),
    "lv8-thurible": _s(8, "spray", "incense burner (chain clink, smoke puff)", ["spray"]),
    "lv8-scroll": _s(8, "newspaper", "parchment scroll swat", ["newspaper"]),
    "lv8-spacehen": _s(8, "hen", "hen in a space helmet", ["hen-cluck", "hen-peck"]),
    "lv8-alien": _s(8, "cat", "small alien pounce", ["cat"]),
    "lv8-blob": _s(8, "frog", "alien blob", ["frog-croak", "frog-tongue"]),
    "lv8-satellite": _s(8, "jellyfish", "satellite (beeps)", ["jellyfish"]),
    "lv8-meteor": _s(8, "gull", "meteor dive (whoosh and roar)", ["gull-screech"]),
    "lv8-ufo": _s(8, "wasp", "tiny UFO (hum, dive)", ["wasp-buzz", "wasp-dive"]),
    "lv8-antenna": _s(8, "zapper", "tesla coil",
                      reuse={"zapper-charge": "a charging coil crackles and whines like the zapper", "zapper-bolt": "a hard electric crack and zap, as the zapper's"}),
    "lv8-rover": _s(8, "robotVacuum", "old lunar rover (motor whir, breaking)", ["robovac-whir", "robovac-crack"]),
    # Level 9 the Zubrowka dimension
    "lv9-vodka": _s(9, "aerosol", "vodka bottle (glass clink, shatter)", ["aerosol-rattle", "aerosol-blast"]),
    "lv9-bottle": _s(9, "flipper", "bottle swung by the neck", ["flipper"]),
    "lv9-label": _s(9, "newspaper", "big paper label swat", reuse={"newspaper": "a paper swat is a paper swat"}),
    "lv9-lynx": _s(9, "cat", "lynx pounce (snarl)", ["cat"]),
    "lv9-shotglass": _s(9, "jellyfish", "floating shot glass (glassy shimmer)", ["jellyfish"]),
    "lv9-eagle": _s(9, "gull", "eagle dive (cry)", ["gull-screech"]),
    "lv9-mosquito": _s(9, "wasp", "huge mosquito (whine, dive)", ["wasp-buzz", "wasp-dive"]),
    "lv9-tree": _s(9, "zapper", "lightning-struck tree (crackle charge, bolt)", ["zapper-bolt"],
                   {"zapper-charge": "a rising electric crackle is what a tree charging with lightning sounds like"}),
    "lv9-boar": _s(9, "robotVacuum", "wild boar (grunting trot, squeal)", ["robovac-whir", "robovac-crack"]),
    "lv9-mushrooms": _s(9, "repeller", "glowing mushroom ring (hum, ring pulse)", ["repeller-hum", "repeller-ring"]),
    # Level 10 the wasteland
    "lv10-sign": _s(10, "flipper", "bent enamel street sign swung", ["flipper"]),
    "lv10-pipe": _s(10, "newspaper", "corroded metal pipe used as a club", ["newspaper"]),
    "lv10-mutant": _s(10, "cat", "three-eyed mutant cat pounce", ["cat"]),
    "lv10-fridge": _s(10, "jellyfish", "small floating fridge (compressor hum, buzz, cold shimmer)", ["jellyfish"]),
    "lv10-vulture": _s(10, "gull", "wasteland vulture dive (hoarse hiss-croak, wing rush)", ["gull-screech"]),
    "lv10-drone": _s(10, "wasp", "battered quadcopter drone (rotor whine, bearing rattle)", ["wasp-buzz", "wasp-dive"]),
    "lv10-trolley": _s(10, "bison", "runaway supermarket trolley charging", ["bison"]),
    "lv10-wire": _s(10, "hedgehog", "rolling ball of barbed wire winding up", ["hedgehog"]),
}


def sound_id(skin, key):
    return f"{skin}-{key}"


def made_ids():
    return [sound_id(s, k) for s, v in SKINS.items() for k in v["made"]]


def manifest():
    return {s: {k: sound_id(s, k) for k in v["made"]} for s, v in SKINS.items()}


def check():
    for s, v in SKINS.items():
        keys = BASE_KEYS[v["base"]]
        got = sorted(v["made"] + list(v["reuse"]))
        assert got == sorted(keys), f"{s}: decides {got}, base {v['base']} plays {sorted(keys)}"


check()
