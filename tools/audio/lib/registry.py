"""Sound registry: groups (one audition row per game event) and variants (the actual sounds)."""
GROUPS = {}   # group id -> {section, event, cur: [(file, note)], order}
SOUNDS = []   # {id, group, variant, cat, loop, note, fn}

# Loudness targets (K-weighted, whole clip, ungated; see dsp.lufs). UI quietest, big impacts loudest.
CATS = {
    "ui": -22.0,        # buttons, sliders
    "pickup": -19.0,    # apple, beer, pill, combo ticks (heard many times a minute)
    "obstacle": -19.0,  # obstacles scrolling in (frequent, background-ish)
    "gameplay": -17.0,  # jump, dash, death, floor switch, boss gun
    "stinger": -16.0,   # score milestones, na-styk, przebicie
    "boss": -15.5,      # boss attacks, hits
    "big": -14.0,       # explosions, slams, victory, defeat
    "ambient": -27.0,   # cricket, roach noise loops
    "loop": -20.0,      # looping boss attack beds
}


def group(gid, section, event, cur=None):
    GROUPS[gid] = {"section": section, "event": event, "cur": cur or [], "order": len(GROUPS)}


def snd(gid, variant="", cat="gameplay", loop=False, note="", lufs=None):
    def deco(fn):
        sid = gid + ("-" + variant if variant else "")
        assert gid in GROUPS, gid
        SOUNDS.append({"id": sid, "group": gid, "variant": variant, "cat": cat, "loop": loop, "note": note, "fn": fn, "lufs": lufs})
        return fn
    return deco
