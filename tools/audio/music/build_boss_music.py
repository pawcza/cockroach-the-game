#!/usr/bin/env python3
"""Boss fight soundtracks: 4 bosses x 3 candidate tracks x 3 synced stems (fg lead, bg drums/bass/harmony, amb place).

    python3 tools/audio/music/build_boss_music.py               # every candidate -> OUT/<boss>-<a..f>-<fg|bg|amb>.ogg
    python3 tools/audio/music/build_boss_music.py --only bigos-a
    python3 tools/audio/music/build_boss_music.py --out DIR     # stems default to tools/audio/out/boss-music
    python3 tools/audio/music/build_boss_music.py --mix         # the picked tracks, one file each, then install.py

--mix renders the tracks picks.json names for the fights ("<boss>-bgm": "music-<boss>-<letter>") with their three
stems summed at unity before encoding, into tools/audio/out/music-<boss>-<letter>.ogg, and writes their measurements
to tools/audio/music/manifest.json (credits.py lists them from there). install.py then copies them into public/boss/
as <boss>-bgm.ogg. One file, not three: all three layers were picked at unity, and three sounds started apart drift.

numpy/scipy synthesis on top of tools/audio/lib (dsp.py, synth.py), deterministic (every track seeds its RNG from
its id, Vorbis is encoded bit-exact). Every stem of a track has the same sample count and loops seamlessly (see
engine.py); the SUM of the three stems at unity is set to -20 LUFS integrated (what the shared boss track these
replaced measured), true peak under -1 dBFS. Output: 24 kHz stereo Vorbis like the existing music, plus
manifest.json with the measurements.
"""
import argparse, json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from engine import OUT_SR, STEMS, lufs_gated, true_peak_db, centroid_hz  # noqa: E402
from common import theory_report, lead_motif_stats  # noqa: E402
import tracks_lodzia, tracks_bigos, tracks_zlewiatan, tracks_eksterminator  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
AUDIO = os.path.dirname(HERE)
OUT = os.path.join(AUDIO, "out")
STEM_OUT = os.path.join(OUT, "boss-music")
MIX_MANIFEST = os.path.join(HERE, "manifest.json")
TARGET = -20.0                    # the shared boss-bgm.ogg these replaced measured -20.0 LUFS integrated (ffmpeg ebur128)
REL = {"fg": -23.0, "bg": -22.5, "amb": -29.0}   # stem balance before the common gain (gated LUFS)
TP_CEIL = -1.5
MAX_BYTES = 350_000
BOSS_NAMES = {"lodzia": "Pani Lodzia", "bigos": "DJ Bigos", "zlewiatan": "Zlewiatan", "eksterminator": "Eksterminator"}
BOSSES = {"lodzia": tracks_lodzia.TRACKS, "bigos": tracks_bigos.TRACKS, "zlewiatan": tracks_zlewiatan.TRACKS, "eksterminator": tracks_eksterminator.TRACKS}
# round two (d/e/f): heavier takes for the three bosses whose a/b/c were too light
import tracks_lodzia2, tracks_bigos2, tracks_eksterminator2  # noqa: E402
BOSSES["lodzia"] = {**BOSSES["lodzia"], **tracks_lodzia2.TRACKS}
BOSSES["bigos"] = {**BOSSES["bigos"], **tracks_bigos2.TRACKS}
BOSSES["eksterminator"] = {**BOSSES["eksterminator"], **tracks_eksterminator2.TRACKS}


# ---------------------------------------------------------------- io
def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail)[1])
    p = float(re.search(r"Peak:\s+(-?[\d.inf]+) dBFS", tail)[1])
    return i, p


def encode(x2, path, q):
    pcm = np.clip(x2.T, -1, 1).astype("<f4").tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(OUT_SR), "-ac", "2", "-i", "-",
                    "-c:a", "libvorbis", "-q:a", str(q), "-map_metadata", "-1", "-fflags", "+bitexact",
                    "-flags:a", "+bitexact", path], input=pcm, check=True)


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ar", str(OUT_SR), "-ac", "2", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, "<f4").reshape(-1, 2).T.astype(np.float64)


def write_wav(x2, path):
    pcm = np.clip(x2.T, -1, 1).astype("<f4").tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(OUT_SR), "-ac", "2", "-i", "-", path],
                   input=pcm, check=True)


def encode_loop(x2, path, q):
    """Encode; if the decoder comes back short, feed a little of the loop's own continuation (as build.py does)."""
    n = x2.shape[1]
    encode(x2, path, q)
    y = decode(path)
    for extra in (128, 256, 512, 1024, 2048):
        if y.shape[1] >= n:
            break
        encode(np.concatenate([x2, x2[:, :extra]], axis=1), path, q)
        y = decode(path)
    if y.shape[1] < n:
        raise RuntimeError(f"{path}: decodes to {y.shape[1]} samples, want {n}")
    return y[:, :n]


# ---------------------------------------------------------------- checks
def seam(y, song, x=None):
    """Step across the loop point vs the steps inside the file, and the same at the internal downbeats.
    With x (the circular render before encoding): coding error at the two ends vs inside the file, which shows
    whether encoding put anything at the seam that the seamless render did not have."""
    n = y.shape[1]
    steps = np.abs(np.diff(y, axis=1)).max(axis=0)
    s_seam = float(np.abs(y[:, 0] - y[:, -1]).max())
    beats_per_bar = song.meter
    db_idx = [int(round(b * n / song.beats)) for b in range(beats_per_bar, song.beats, beats_per_bar)]
    db_steps = np.array([steps[i - 4:i + 4].max() for i in db_idx])
    extra = {}
    if x is not None:
        err = np.abs(y - x).max(axis=0)
        w = int(0.005 * OUT_SR)
        ends = float(max(err[:w].max(), err[-w:].max()))
        inner = err[w:-w].reshape(-1)[: (n - 2 * w) // w * w].reshape(-1, w).max(axis=1)
        extra = {"edge_err": round(ends, 5), "edge_err_pct": round(float((inner < ends).mean() * 100), 1),
                 "render_step": round(float(np.abs(x[:, 0] - x[:, -1]).max()), 5)}
    # 3 ms high-band burst energy at the seam vs at every other 3 ms window (click detector)
    yy = np.concatenate([y, y], axis=1).mean(0)
    hf = signal.sosfilt(signal.butter(2, 5000 / (OUT_SR / 2), "highpass", output="sos"), yy)[n:]
    w = int(0.003 * OUT_SR)
    e = np.convolve(np.concatenate([hf[-w:], hf, hf[:w]]) ** 2, np.ones(2 * w), "same")[w:w + n]
    return {
        "step": round(s_seam, 5),
        "step_over_mean": round(s_seam / (steps.mean() + 1e-12), 2),
        "step_pct": round(float((steps < s_seam).mean() * 100), 2),
        "step_p99": round(float(np.percentile(steps, 99)), 5),
        "downbeat_step_max": round(float(db_steps.max()), 5),
        "hf_burst_pct": round(float((e < e[0]).mean() * 100), 2),
        # seamless = the seam step is no bigger than the big steps inside (99th pct, the steps at the other
        # downbeats) or than the circular render's own step there (an ordinary step of that signal: music, not
        # a cut), and encoding added no more error at the ends than at a typical transient inside
        "ok": bool(s_seam <= max(np.percentile(steps, 99), db_steps.max(), extra.get("render_step", 0)) * 1.1
                   and extra.get("edge_err_pct", 0) < 99.5),
        **extra,
    }


def measure_reference():
    out = {}
    for rel in ("public/levels/soundtracks/lv1.ogg", "public/levels/soundtracks/lv5.ogg",
                "public/levels/soundtracks/lv7.ogg", "public/levels/soundtracks/lv9.ogg"):
        p = os.path.join(REPO, rel)
        if not os.path.exists(p):
            continue
        info = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration",
                               "-of", "default=nw=1", p], capture_output=True, text=True).stdout
        kv = dict(l.split("=") for l in info.split())
        i, tp = ebur128(p)
        y = decode(p)
        corr = float(np.corrcoef(y[0], y[1])[0, 1])
        out[os.path.basename(p)] = {
            "sample_rate": int(kv["sample_rate"]), "channels": int(kv["channels"]), "seconds": round(float(kv["duration"]), 2),
            "kbps": round(os.path.getsize(p) * 8 / float(kv["duration"]) / 1000), "lufs": i, "true_peak": tp,
            "centroid_hz": centroid_hz(y), "lr_corr": round(corr, 2)}
    return out


# ---------------------------------------------------------------- build
def render(fn):
    """The song and its three stems at their balance, before the common gain."""
    s, meta = fn()
    st = {}
    for k in STEMS:
        x = s.finish_stem(k)
        x *= 10 ** ((REL[k] + meta.get("rel", {}).get(k, 0.0) - lufs_gated(x)) / 20)
        st[k] = s.to_out(x)
    return s, meta, st


def build_track(boss, letter, fn, outdir, target, tmp):
    t0 = time.time()
    s, meta, st = render(fn)
    total = sum(st.values())
    g = 10 ** ((target - lufs_gated(total, OUT_SR)) / 20)
    st = {k: v * g for k, v in st.items()}
    tp = true_peak_db(sum(st.values()))
    if tp > TP_CEIL:  # never hit in practice at -20 LUFS; keep the ceiling honest if it ever is
        st = {k: v * 10 ** ((TP_CEIL - tp) / 20) for k, v in st.items()}
    sid = f"{boss}-{letter}"
    q = 3.0
    for attempt in range(3):
        paths, dec = {}, {}
        while True:
            for k in STEMS:
                paths[k] = os.path.join(outdir, f"{sid}-{k}.ogg")
                dec[k] = encode_loop(st[k], paths[k], q)
            if max(os.path.getsize(p) for p in paths.values()) <= MAX_BYTES or q <= 0:
                break
            q -= 0.5
        summ = sum(dec.values())
        wav = os.path.join(tmp, f"{sid}-sum.wav")
        write_wav(summ, wav)
        sum_i, sum_tp = ebur128(wav)
        if abs(sum_i - target) <= 0.2 and sum_tp <= -1.0:
            break
        corr = target - sum_i if sum_tp <= -1.0 else min(target - sum_i, -1.2 - sum_tp)
        st = {k: v * 10 ** (corr / 20) for k, v in st.items()}
    os.remove(wav)
    stems = {}
    for k in STEMS:
        i, p = ebur128(paths[k])
        stems[k] = {"lufs": i, "true_peak": p, "centroid_hz": centroid_hz(dec[k]), "kb": round(os.path.getsize(paths[k]) / 1000, 1),
                    "dc": round(float(np.abs(dec[k].mean(axis=1)).max()), 6), "samples": dec[k].shape[1],
                    "seam": seam(dec[k], s, st[k])}
    th = theory_report(s)
    entry = {
        "id": sid, "boss": boss, "letter": letter, "name": meta["name"], "description": meta["desc"], "key": meta["key"],
        "bpm": round(s.bpm, 2), "meter": meta["meter"], "bars": s.bars, "seconds": round(s.N24 / OUT_SR, 4), "samples": s.N24,
        "sample_rate": OUT_SR, "channels": 2, "vorbis_q": q,
        "sum": {"lufs": sum_i, "true_peak": sum_tp, "centroid_hz": centroid_hz(summ),
                "seam": seam(summ, s, sum(st.values()))},
        "stems": stems,
        "theory": {k: v for k, v in th.items() if k != "bad"} | lead_motif_stats(s),
        "files": {k: os.path.basename(paths[k]) for k in STEMS},
    }
    if th["bad"]:
        entry["theory"]["out_of_key_examples"] = th["bad"]
    print(f"\n{sid}  {meta['name']}  [{meta['key']}, {s.bpm:.2f} BPM {meta['meter']}, {s.bars} bars, {entry['seconds']} s]"
          f"  ({time.time() - t0:.0f}s)")
    print(f"  sum  I {sum_i:6.1f}  TP {sum_tp:5.1f}  cen {entry['sum']['centroid_hz']:5d}  seam {entry['sum']['seam']}")
    for k in STEMS:
        v = stems[k]
        print(f"  {k:4s} I {v['lufs']:6.1f}  TP {v['true_peak']:5.1f}  cen {v['centroid_hz']:5d}  {v['kb']:6.1f} kB  "
              f"dc {v['dc']:.5f}  seam step {v['seam']['step']:.4f} pct {v['seam']['step_pct']:5.1f} "
              f"db {v['seam']['downbeat_step_max']:.4f} edge {v['seam'].get('edge_err_pct')} ok {v['seam']['ok']}")
    print("  parts", "; ".join(f"{st_}:{nm} {l}" for st_, nm, l in s.parts))
    print("  theory", entry["theory"])
    return entry


def picks():
    """picks.json's fight tracks: game event ("<boss>-bgm") -> candidate id ("<boss>-<letter>")."""
    doc = json.load(open(os.path.join(AUDIO, "picks.json")))
    return {event: pick[len("music-"):] for event, pick in doc.items() if pick.startswith("music-")}


def build_mix(event, boss, letter, fn, outdir, target):
    """One picked track: its three stems summed at unity before encoding, at the target loudness, as one loop."""
    t0 = time.time()
    s, meta, st = render(fn)
    x = sum(st.values())
    x = x * 10 ** ((target - lufs_gated(x, OUT_SR)) / 20)
    tp = true_peak_db(x)
    if tp > TP_CEIL:
        x = x * 10 ** ((TP_CEIL - tp) / 20)
    sid = f"music-{boss}-{letter}"
    path = os.path.join(outdir, sid + ".ogg")
    q = 3.0
    for attempt in range(3):
        while True:
            y = encode_loop(x, path, q)
            if os.path.getsize(path) <= MAX_BYTES or q <= 0:
                break
            q -= 0.5
        i, p = ebur128(path)
        if abs(i - target) <= 0.2 and p <= -1.0:
            break
        corr = target - i if p <= -1.0 else min(target - i, -1.2 - p)
        x = x * 10 ** (corr / 20)
    whole = decode(path).shape[1]
    if whole != s.N24:
        raise RuntimeError(f"{path}: decodes to {whole} samples, the loop is {s.N24}: it would not loop on its beat")
    entry = {
        "id": sid, "group": event, "variant": letter, "section": "Boss music",
        "event": f"{BOSS_NAMES[boss]}'s fight music: {meta['name']}", "source": "synth", "pack_files": [], "packs": [],
        "licence": "original synthesis (no third-party material)", "note": meta["desc"], "key": meta["key"],
        "bpm": round(s.bpm, 2), "meter": meta["meter"], "bars": s.bars, "seconds": round(s.N24 / OUT_SR, 4),
        "samples": s.N24, "sample_rate": OUT_SR, "channels": 2, "vorbis_q": q, "loop": True,
        "lufs": i, "true_peak": p, "centroid_hz": centroid_hz(y), "kb": round(os.path.getsize(path) / 1000, 1),
        "seam": seam(y, s, x),
    }
    print(f"{sid:26s} {meta['name']}  [{s.bpm:.2f} BPM, {entry['seconds']} s, {whole} samples]  I {i:5.1f}  TP {p:5.1f}  "
          f"{entry['kb']:6.1f} kB q{q}  seam ok {entry['seam']['ok']}  ({time.time() - t0:.0f}s)")
    return entry


def main_mix(outdir, only):
    os.makedirs(outdir, exist_ok=True)
    chosen = picks()
    entries = []
    for event, tid in chosen.items():
        if only and tid not in only:
            continue
        boss, letter = tid.rsplit("-", 1)
        entries.append(build_mix(event, boss, letter, BOSSES[boss][letter], outdir, TARGET))
    old = {}
    if os.path.exists(MIX_MANIFEST):
        old = {e["id"]: e for e in json.load(open(MIX_MANIFEST))["sounds"]}
    old.update({e["id"]: e for e in entries})
    order = [f"music-{tid}" for tid in chosen.values()]
    doc = {
        "about": "The boss fight tracks the game plays (picks.json \"<boss>-bgm\"): each candidate's three stems summed at "
                 "unity into one seamless loop, encoded once. install.py puts them in public/boss as <boss>-bgm.ogg; "
                 "credits.py reads this file. LUFS/true peak by ffmpeg ebur128 on the encoded file.",
        "target_lufs": TARGET,
        "sounds": [old[i] for i in order if i in old],
    }
    json.dump(doc, open(MIX_MANIFEST, "w"), indent=1, ensure_ascii=False)
    print(f"\n{len(entries)} tracks mixed into {outdir}; next: python3 tools/audio/install.py")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--mix", action="store_true", help="the picked tracks, one mixed file each (see the top)")
    a = ap.parse_args()
    if a.mix:
        main_mix(a.out or OUT, a.only)
        return
    a.out = a.out or STEM_OUT
    os.makedirs(a.out, exist_ok=True)
    tmp = os.path.join(a.out, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    ref = measure_reference()
    target = TARGET
    print("reference:", json.dumps(ref, indent=1))
    mpath = os.path.join(a.out, "manifest.json")
    old = {}
    if a.only and os.path.exists(mpath):
        old = {t["id"]: t for t in json.load(open(mpath))["tracks"]}
    for boss, tracks in BOSSES.items():
        for letter, fn in tracks.items():
            sid = f"{boss}-{letter}"
            if a.only and sid not in a.only:
                continue
            old[sid] = build_track(boss, letter, fn, a.out, target, tmp)
    os.rmdir(tmp)
    order = [f"{b}-{l}" for b, t in BOSSES.items() for l in t]
    doc = {
        "about": "Boss fight loops: per track three stems of identical length (fg = lead/hook, bg = drums/bass/harmony, "
                 "amb = the place). Play all three from sample 0 together and loop; unity gain on all three = target "
                 "loudness. LUFS/true peak by ffmpeg ebur128 on the encoded files (sum = the three decoded stems added).",
        "target_lufs": target, "reference": ref,
        "tracks": [old[i] for i in order if i in old],
    }
    json.dump(doc, open(mpath, "w"), indent=1, ensure_ascii=False)
    sizes = sum(os.path.getsize(os.path.join(a.out, f)) for f in os.listdir(a.out) if f.endswith(".ogg"))
    print(f"\n{len(doc['tracks'])} tracks, {sizes / 1e6:.2f} MB of ogg in {a.out}")


if __name__ == "__main__":
    main()
