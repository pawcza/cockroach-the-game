#!/usr/bin/env python3
"""Rebuild every replacement sound from sources (CC0 packs in _packs/ + numpy synthesis).

    python3 tools/audio/fetch_packs.py        # once: download the CC0 packs
    python3 tools/audio/build.py              # all sounds -> tools/audio/out/*.ogg + manifest.json
    python3 tools/audio/build.py --only jump  # ids starting with "jump"
    python3 tools/audio/build.py --audition DIR   # also assemble the audition page (see audition.py)

Deterministic: every sound has its own RNG seeded from its id. Output is mono, 44.1 kHz, Vorbis q5,
peaks <= -1 dBFS after encoding, loudness per category (see lib/registry.py CATS).
"""
import argparse, json, os, re, sys, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from lib import dsp as d
from lib.registry import SOUNDS, GROUPS, CATS
import sounds_core, sounds_milestones, sounds_boss  # noqa: F401  (registering sounds)

OUT = os.path.join(HERE, "out")
PACK_PAGES = {}


def pack_info():
    """pack folder name -> (page url, licence line) from licenses/*.txt."""
    info = {}
    ld = os.path.join(HERE, "licenses")
    for fn in sorted(os.listdir(ld)):
        txt = open(os.path.join(ld, fn), errors="ignore").read()
        page = re.search(r"^Page: (.*)$", txt, re.M)
        author = re.search(r"^Author: (.*)$", txt, re.M)
        info[fn[:-4]] = {"page": page.group(1) if page else "", "author": author.group(1) if author else "",
                         "licence": "CC0 1.0 (public-domain dedication)"}
    return info


def finish(x, loop):
    x = np.nan_to_num(x)
    x = x - np.mean(x)
    if not loop:
        x = d.trim(x, -48, keep_ms=2)
        x = np.concatenate([x, np.zeros(d.n_(0.012))])
        x = d.fade(x, 0.4, 8)
    return x


def build(only=None, outdir=OUT):
    os.makedirs(outdir, exist_ok=True)
    pinfo = pack_info()
    manifest = []
    failures = []
    for sd in SOUNDS:
        if only and not any(sd["id"].startswith(o) for o in only):
            continue
        d.REC.reset(sd["id"])
        t0 = time.time()
        try:
            x = sd["fn"]()
            x = finish(x, sd["loop"])
            target = sd["lufs"] if sd["lufs"] is not None else CATS[sd["cat"]]
            x = d.normalize(x, target, -1.5)
            path = os.path.join(outdir, sd["id"] + ".ogg")
            d.encode_ogg(x, path)
            y = d.decode_ogg(path)
            if sd["loop"]:
                # The encoder can drop up to a block off the end, which would put a step in every loop: encode a
                # little of the loop's own continuation until the file decodes to exactly the loop's length
                for extra in (128, 256, 512, 1024):
                    if len(y) >= len(x):
                        break
                    d.encode_ogg(np.concatenate([x, np.resize(x, extra)]), path)
                    y = d.decode_ogg(path)
                y = y[:len(x)]
            a = d.analyse(y)
            if a["peak_dbfs"] > -1.0:   # encoder overshoot: pull down and re-encode
                x = x * 10 ** ((-1.3 - a["peak_dbfs"]) / 20)
                d.encode_ogg(x, path)
                y = d.decode_ogg(path)
                a = d.analyse(y)
        except Exception:
            failures.append(sd["id"])
            traceback.print_exc()
            continue
        if sd["loop"]:
            a["loop_seam_ratio"] = round(float(abs(y[0] - y[-1]) / (np.mean(np.abs(np.diff(y))) + 1e-9)), 2)
        packs = sorted({s_.split("/")[0] for s_ in d.REC.sources})
        kind = "synth" if not d.REC.sources else ("pack+synth" if d.REC.synth else "pack")
        g = GROUPS[sd["group"]]
        entry = {
            "id": sd["id"], "group": sd["group"], "variant": sd["variant"], "section": g["section"], "event": g["event"],
            "source": kind,
            "pack_files": list(d.REC.sources),
            "packs": [{"name": p, **pinfo[p]} for p in packs],
            "licence": "CC0 1.0" if packs else "original synthesis (no third-party material)",
            "chain": " > ".join(d.REC.chain),
            "note": sd["note"], "category": sd["cat"], "target_lufs": sd["lufs"] if sd["lufs"] is not None else CATS[sd["cat"]], "loop": sd["loop"],
            **a,
        }
        manifest.append(entry)
        flag = ""
        if not sd["loop"] and a["duration_s"] > 2.0: flag += " LONG"
        if a["attack_ms"] > 60 and sd["cat"] in ("gameplay", "ui", "pickup"): flag += " SLOW-ATTACK"
        print(f"{sd['id']:26s} {kind:10s} {a['duration_s']:5.2f}s pk{a['peak_dbfs']:6.1f} lufs{a['lufs']:6.1f} cen{a['centroid_hz']:5d} att{a['attack_ms']:6.1f}{flag}  ({time.time()-t0:.1f}s)")
    return manifest, failures


def write_manifest(manifest):
    path = os.path.join(HERE, "manifest.json")
    old = {}
    if os.path.exists(path):
        try:
            old = {e["id"]: e for e in json.load(open(path))["sounds"]}
        except Exception:
            pass
    old.update({e["id"]: e for e in manifest})  # partial rebuilds keep the rest
    order = [s_["id"] for s_ in SOUNDS]
    sounds = [old[i] for i in order if i in old]
    doc = {
        "about": "Sound set for the game (install.py puts the picks from picks.json into public/). Loudness = K-weighted, ungated, whole clip (lib/dsp.py lufs).",
        "groups": GROUPS_JSON(),
        "sounds": sounds,
    }
    json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)


def GROUPS_JSON():
    return {k: {"section": v["section"], "event": v["event"], "current": [{"file": f, "note": n} for f, n in v["cur"]]}
            for k, v in sorted(GROUPS.items(), key=lambda kv: kv[1]["order"])}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--audition")
    a = ap.parse_args()
    m, fails = build(a.only, a.out)
    write_manifest(m)
    if a.audition:
        import audition
        audition.assemble(a.audition)
    print(f"\n{len(m)} built, {len(fails)} failed {fails}")
    sys.exit(1 if fails else 0)
