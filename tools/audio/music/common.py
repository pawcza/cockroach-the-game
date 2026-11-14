"""Composition helpers shared by the three bosses: progressions, bass and chord parts from a progression,
drum grids, and the theory checks build_boss_music.py prints."""
import numpy as np
from engine import chord, root, voicing, SCALES, d


def prog(song, *bar_names):
    """One string per bar, 'Am' or 'Am G' (chords split the bar evenly). Records the harmony on the song."""
    out = []
    for i, s in enumerate(bar_names):
        names = s.split()
        du = song.meter / len(names)
        for k, nm in enumerate(names):
            out.append((i * song.meter + k * du, du, nm))
    song.harmony += out
    return out


def chord_at(pr, beat):
    for b, du, nm in pr:
        if b - 1e-6 <= beat < b + du - 1e-6:
            return nm
    return pr[-1][2]


def bass_part(song, pr, pattern, octave=2, approach=None):
    """pattern: [(beat_in_bar, dur, interval)] per bar; the chord sounding at each step gives the root.
    approach: {beat_in_bar: semitones} -> that step plays the NEXT chord's root offset (walk/chromatic lead-in)."""
    ev = []
    for bar in range(song.bars):
        for off, du, iv in pattern:
            b = bar * song.meter + off
            nm = chord_at(pr, b)
            r = root(nm, octave)
            if approach and off in approach:
                nxt = chord_at(pr, (bar + 1) * song.meter % song.beats)
                m = root(nxt, octave) + approach[off]
            else:
                fifth = [i for i in chord(nm)[1] if i in (6, 7, 8)]
                m = r + (fifth[0] if iv == 7 and fifth else iv)   # a dim chord's "fifth" is its own b5
            ev.append((b, du, m))
    return ev


def stab_part(song, pr, offsets, dur, center=64, n=3, vel=1.0, bars_on=None):
    ev = []
    for bar in range(song.bars):
        if bars_on is not None and bar not in bars_on:
            continue
        for off in offsets:
            b = bar * song.meter + off
            for m in voicing(chord_at(pr, b), center, n):
                ev.append((b, dur, m, vel))
    return ev


def held_chords(pr, center=60, n=3, vel=1.0, bars_on=None, meter=4):
    ev = []
    for b, du, nm in pr:
        if bars_on is not None and int(b // meter) not in bars_on:
            continue
        for m in voicing(nm, center, n):
            ev.append((b, du, m, vel))
    return ev


def arp_part(song, pr, step=0.25, center=72, order=(0, 1, 2, 1), vel=1.0, bars_on=None):
    ev = []
    k = 0
    t = 0.0
    while t < song.beats - 1e-9:
        bar = int(t // song.meter)
        if bars_on is None or bar in bars_on:
            v = voicing(chord_at(pr, t), center, 3)
            ev.append((t, step, v[order[k % len(order)]], vel))
        k += 1
        t += step
    return ev


def diatonic(m, steps, tonic_pc, scale="major"):
    """Move a note `steps` scale degrees (negative = down) inside the scale."""
    sc = SCALES[scale]
    pcs = sorted((tonic_pc + s) % 12 for s in sc)
    cands = [o * 12 + p for o in range(0, 10) for p in pcs]
    cands.sort()
    i = min(range(len(cands)), key=lambda j: abs(cands[j] - m))
    return cands[i + steps]


def every(song, offsets, gain=1.0, bars_on=None, var=0):
    """Hits at the given in-bar offsets in every bar (or bars_on)."""
    out = []
    for bar in range(song.bars):
        if bars_on is not None and bar not in bars_on:
            continue
        for o in offsets:
            out.append((bar * song.meter + o, gain, var))
    return out


def circ_lp(song, x, fc, order=2):
    return song.circ(lambda v: d.lp(v, fc, order), x)


def circ_hp(song, x, fc, order=2):
    return song.circ(lambda v: d.hp(v, fc, order), x)


def circ_bp(song, x, lo, hi, order=2):
    return song.circ(lambda v: d.bp(v, lo, hi, order), x)


# ---------------------------------------------------------------- checks
def theory_report(song):
    """Numbers that stand in for a music theory read: notes in key, bass on roots, lead on chord tones."""
    secs = sorted(song.sections)

    def scale_at(b):
        cur = secs[0]
        for s in secs:
            if s[0] <= b + 1e-6:
                cur = s
        return {(cur[1] + i) % 12 for i in SCALES[cur[2]]}

    # chord changes only (a repeated chord's bar may start on its fifth: oom-pah alternation)
    starts = {round(b, 4): nm for i, (b, du, nm) in enumerate(song.harmony) if i == 0 or song.harmony[i - 1][2] != nm}
    out = {"notes": 0, "out_of_key": 0, "chromatic_passing": 0, "bass_changes": 0, "bass_on_root": 0, "lead_strong": 0, "lead_strong_ct": 0,
           "chord_notes": 0, "chord_tones": 0}
    bad = []
    for part, role, b, du, m in song.notes:
        out["notes"] += 1
        if role == "passing":   # deliberate chromatic approach notes, counted apart
            out["chromatic_passing"] += 1
            continue
        if m % 12 not in scale_at(b):
            out["out_of_key"] += 1
            bad.append((part, round(b, 2), m))
        nm = chord_at(song.harmony, b)
        pc, iv = chord(nm)
        tones = {(pc + i) % 12 for i in iv}
        if role == "bass" and round(b, 4) in starts:
            out["bass_changes"] += 1
            out["bass_on_root"] += int(m % 12 == pc)
        if role == "lead" and abs(b - round(b)) < 1e-6:
            out["lead_strong"] += 1
            out["lead_strong_ct"] += int(m % 12 in tones)
        if role == "chord":
            out["chord_notes"] += 1
            out["chord_tones"] += int(m % 12 in tones)
    out["bad"] = bad[:8]
    return out


def lead_motif_stats(song):
    """Distinct notes and range of the lead (a degenerate lead is 1-2 pitches)."""
    ms = [m for part, role, b, du, m in song.notes if role == "lead"]
    if not ms:
        return {}
    return {"lead_notes": len(ms), "lead_pitches": len(set(ms)), "lead_range": max(ms) - min(ms)}


__all__ = ["prog", "chord_at", "bass_part", "stab_part", "held_chords", "arp_part", "diatonic", "every",
           "circ_lp", "circ_hp", "circ_bp", "theory_report", "lead_motif_stats", "np"]
