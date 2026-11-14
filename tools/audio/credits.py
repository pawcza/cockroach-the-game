#!/usr/bin/env python3
"""Write docs/SOUND_CREDITS.md from manifest.json: the sounds shipped in public/ (install.py's list), which are
synthesised here and which are made from which CC0 pack. Sounds that were built but not picked are not credited."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from install import INSTALL  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "docs", "SOUND_CREDITS.md")


def main():
    m = json.load(open(os.path.join(HERE, "manifest.json")))
    music = json.load(open(os.path.join(HERE, "music", "manifest.json")))
    shipped = {sid for sid, _ in INSTALL.values()}
    sounds = [s for s in m["sounds"] + music["sounds"] if s["id"] in shipped]
    assert len(sounds) == len(shipped), shipped - {s["id"] for s in sounds}
    synth = [s for s in sounds if not s["packs"]]
    derived = [s for s in sounds if s["packs"]]
    packs = {}
    for s in derived:
        for p in s["packs"]:
            e = packs.setdefault(p["name"], {"page": p["page"], "author": p["author"], "files": {}})
            for f in s["pack_files"]:
                if f.startswith(p["name"] + "/"):
                    e["files"].setdefault(f[len(p["name"]) + 1:], []).append(s["id"])
    L = ["# Sound credits", "",
         "Most sound effects in the game were made for it by `tools/audio` (`python3 tools/audio/build.py`, then "
         "`install.py`): numpy/scipy synthesis, some of it layered with a sample from a CC0 pack. Each sound is rebuilt "
         "the same way every time, and loudness is set per category.", "",
         "- **Synthesised**: made entirely by `tools/audio`, no third-party samples in them.",
         "- **Made from CC0 packs**: a sample from one of the packs below, processed and layered with synthesis.",
         "  Every pack is released under CC0 1.0 (public-domain dedication): attribution is not required, and the credit lines "
         "are courtesy. Each pack's page, author, licence evidence and zip SHA-256 are in `tools/audio/licenses/`.",
         "- **Boss music**: each boss's fight track (`tools/audio/music/build_boss_music.py --mix`, music-*) and the two "
         "ambient loops under the versus screen and the ability screen (boss-prelude, boss-aftermath) are synthesised "
         "here too and listed with the rest below.",
         "- Not listed here, and unchanged: the other sound effects (the obstacles' sounds that were kept, the pause "
         "crickets and so on), the level music, and the boss growls adapted from Ogrebane's Monster Sound Pack (CC0, "
         "OpenGameArt.org); see [LICENSE](../LICENSE).", "",
         f"{len(sounds)} sounds shipped: {len(synth)} synthesised, {len(derived)} made from CC0 packs.", "",
         "## Synthesised", ""]
    for s in synth:
        L.append(f"- {s['id']} ({s['event'].split(' (new')[0]})")
    L += ["", "## Made from CC0 packs", ""]
    for name, e in sorted(packs.items()):
        L.append(f"### {name}")
        L.append(f"- Page: {e['page']}")
        L.append(f"- Author: {e['author']}")
        L.append("- Licence: CC0 1.0, http://creativecommons.org/publicdomain/zero/1.0/")
        L.append("- Files used:")
        for f, ids in sorted(e["files"].items()):
            L.append(f"  - `{f}` -> {', '.join(sorted(set(ids)))}")
        L.append("")
    open(OUT, "w").write("\n".join(L) + "\n")
    print(f"{OUT} written: {len(synth)} synthesised, {len(derived)} from {len(packs)} packs")


if __name__ == "__main__":
    main()
