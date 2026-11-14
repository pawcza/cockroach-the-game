#!/usr/bin/env python3
"""Copy the picked sounds from tools/audio/out into public/, under the keys the game loads.

    python3 tools/audio/build.py        # if out/ is missing anything
    python3 tools/audio/install.py      # out/<sound id>.ogg -> public/<path>

picks.json says which variant of each event the owner chose ("current" = the sound already in the game, left alone).
INSTALL below says where each picked sound goes: game key -> (sound id, file under public/). The lists in
src/scenes/BootScene.ts (core) and DeferredLoadScene.ts (boss) load the same files; tools/audio/check.py keeps the
three in step.
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "..", "..", "public")

# key: (sound id in out/, path under public/)
CORE = {
    "jump": ("jump-b", "audio/jump.ogg"),
    "hop-land": ("hop-land", "audio/hop-land.ogg"),
    "floor-switch": ("floor-switch", "audio/floor-switch.ogg"),
    "dash-ready": ("dash-ready", "audio/dash-ready.ogg"),
    "death": ("death-b", "audio/death.ogg"),
    "heartbeat": ("heartbeat", "audio/heartbeat.ogg"),
    "cockroach-noise": ("roach-noise", "audio/cockroach-noise.ogg"),
    "onion-sfx": ("onion", "audio/onion.ogg"),
    "spray-sfx": ("spray", "audio/spray.ogg"),
    "apple": ("apple-a", "audio/apple.ogg"),
    "beer-sfx": ("beer-3", "audio/beer.ogg"),
    "burp": ("burp-a", "audio/burp.ogg"),
    "pill-sfx": ("pill", "audio/pill.ogg"),
    "pill-end": ("pill-end", "audio/pill-end.ogg"),
    **{f"combo-tick-{i}": (f"combo-tick-{i}", f"audio/combo-tick-{i}.ogg") for i in range(1, 9)},
    "mult-up": ("mult-up", "audio/mult-up.ogg"),
    "combo-lost": ("combo-lost", "audio/combo-lost.ogg"),
    "combo-break": ("combo-break", "audio/combo-break.ogg"),
    "na-styk": ("na-styk", "audio/na-styk.ogg"),
    "przebicie": ("przebicie", "audio/przebicie.ogg"),
    "moult-pop": ("moult-pop", "audio/moult-pop.ogg"),
    "ability-reward": ("ability-reward", "audio/ability-reward.ogg"),
    "ui-press": ("ui-press-a", "audio/ui/press.ogg"),
    "ui-hover": ("ui-hover", "audio/ui/hover.ogg"),
    "ui-back": ("ui-back", "audio/ui/back.ogg"),
    "ui-slider": ("ui-slider", "audio/ui/slider.ogg"),
    "ui-purchase": ("ui-purchase", "audio/ui/purchase.ogg"),
    "ui-error": ("ui-error", "audio/ui/error.ogg"),
    # Enemy sounds that used to borrow another key (BootScene loads them)
    **{k: (k, f"audio/{k}.ogg") for k in (
        "hedgehog", "centipede-rear", "zapper-charge", "zapper-bolt", "aerosol-rattle", "aerosol-blast", "bait-ooze",
        "glue-squelch", "bleach-drip", "frog-croak", "frog-tongue", "repeller-hum", "repeller-ring", "spraywall-puff",
        "gull-screech", "hen-cluck", "hen-peck", "robovac-whir", "robovac-crack", "boots-stomp", "mop-slap",
        "lamp-flicker", "lamp-snap", "wasp-buzz", "wasp-dive", "vacuum-roar")},
    # The milestone ladder by tier (GameOverHandler.SCORE_MILESTONES maps scores to tiers); 2137 stays the clip it was
    **{f"milestone-{k:02d}": (f"stinger-{k:02d}", f"audio/milestones/{k:02d}.ogg") for k in range(1, 15)},
}

# Loaded after boot, with the boss assets (DeferredLoadScene)
BOSS = {
    "boss-pistol": ("boss-gun-a", "boss/sfx/gun.ogg"),
    "shell-casing": ("shell-casing", "boss/sfx/shell-casing.ogg"),
    "bullet-hit": ("bullet-hit", "boss/sfx/bullet-hit.ogg"),
    "bullet-ricochet": ("bullet-ricochet", "boss/sfx/bullet-ricochet.ogg"),
    "shot-down": ("shot-down-b", "boss/sfx/shot-down.ogg"),
    "vs-whoosh": ("vs-whoosh", "boss/sfx/vs-whoosh.ogg"),
    "vs-slam-1": ("vs-slam-1", "boss/sfx/vs-slam-1.ogg"),
    "vs-slam-2": ("vs-slam-2", "boss/sfx/vs-slam-2.ogg"),
    "vs-burst": ("vs-burst", "boss/sfx/vs-burst.ogg"),
    "vs-name": ("vs-name", "boss/sfx/vs-name.ogg"),
    "boss-defeat": ("boss-defeat", "boss/sfx/boss-defeat.ogg"),
    "boss-victory": ("victory", "boss/sfx/victory.ogg"),
    **{k: (k, f"boss/sfx/{k}.ogg") for k in (
        "lodzia-whoosh", "lodzia-slap", "lodzia-shockwave", "lodzia-pocket", "lodzia-spin", "lodzia-boomerang",
        "lodzia-smack", "lodzia-stomp", "lodzia-curler",
        "bigos-thump", "bigos-charge", "bigos-beam", "bigos-wreck",
        "zl-gurgle", "zl-creak", "zl-slab-launch", "zl-slab-impact", "zl-radiator", "zl-spit", "zl-splat", "zl-fishbone",
        "zl-bubble-blow", "zl-bubble-pop", "zl-roar", "zl-drain-away",
        "ex-pump", "ex-pressure", "ex-stream", "ex-lob", "ex-canister-pop", "ex-gas", "ex-tank-ping", "ex-tank-vent",
        "ex-tank-burst", "ex-mask",
        # own sounds for what used to borrow another key
        "boss-parry", "ex-knock", "ex-shove", "ex-struck", "ex-mine-arm", "ex-leak", "ex-charge", "ex-rush", "ex-grenade-bounce",
        "ex-whiff", "bigos-bonk", "bigos-overload", "bigos-shriek", "bigos-defeat", "zl-head-fall", "zl-head-bounce", "zl-head-smash")},
    # The two ambient loops around the fights (not in boss/sfx: DeferredLoadScene BOSS_AUDIO)
    "boss-prelude": ("boss-prelude", "boss/boss-prelude.ogg"),
    "boss-aftermath": ("boss-aftermath", "boss/boss-aftermath.ogg"),
    # Each boss's fight music, one mixed loop each (music/build_boss_music.py --mix)
    **{f"{boss}-bgm": (f"music-{tid}", f"boss/{boss}-bgm.ogg") for boss, tid in (
        ("lodzia", "lodzia-d"), ("bigos", "bigos-f"), ("zlewiatan", "zlewiatan-c"), ("eksterminator", "eksterminator-d"))},
    "bigos-blast": ("bigos-blast-b", "boss/sfx/bigos-blast.ogg"),
    "bigos-scratch": ("bigos-scratch-a", "boss/sfx/bigos-scratch.ogg"),
}

INSTALL = {**CORE, **BOSS}


def picked_ids():
    picks = json.load(open(os.path.join(HERE, "picks.json")))
    ids = set()
    for event, pick in picks.items():
        if pick == "current":
            continue
        ids.update(f"combo-tick-{i}" for i in range(1, 9)) if pick == "new-set" else ids.add(pick)
    return ids


def main():
    missing = [sid for sid, _ in INSTALL.values() if not os.path.exists(os.path.join(HERE, "out", sid + ".ogg"))]
    if missing:
        sys.exit(f"not built yet (python3 tools/audio/build.py): {missing}")
    unplaced = picked_ids() - {sid for sid, _ in INSTALL.values()}
    if unplaced:
        sys.exit(f"picked but not installed anywhere: {sorted(unplaced)}")
    for key, (sid, path) in INSTALL.items():
        dest = os.path.join(PUBLIC, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(os.path.join(HERE, "out", sid + ".ogg"), dest)
    print(f"{len(INSTALL)} sounds installed into public/")


if __name__ == "__main__":
    main()
