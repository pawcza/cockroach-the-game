"""Score milestone stingers (no voices): a family that climbs from a tiny blip to a huge fanfare."""
import numpy as np
from lib import dsp as d
from lib import synth as s
from lib.dsp import SR, n_, expdec, noise
from lib.registry import group, snd

M = "Score milestones"
# The ladder is by tier, not by score: GameOverHandler.SCORE_MILESTONES says which tier plays at which threshold.
TIERS = 14
for k in range(1, TIERS + 1):
    group(f"stinger-{k:02d}", M, f"Score milestone sound, tier {k} of {TIERS}")
group("stinger-2137", M, "Score passes 2137 (joke)", [("audio/2137.ogg", "current clip")])


def V(m, dur, duty=0.25, **kw):
    kw.setdefault("sub", 0.45)
    return s.pulse_voice(float(s.mtof(m)), dur, duty, 0.002, 0.06, kw.pop("sus", 0.55), kw.pop("rel", 0.08), **kw)


def fanfare(total, run, run_step, chord, chord_t=None, hold=0.3, bass=None, kick=False, roll=0, crash=None,
            sparkle=0, shimmer=0.0, saw=False, verb=0.25, key_up=None, double=False):
    """run: midi notes played as fast arpeggio; then a held chord; optional bass, kick, snare roll, crash, bell sparkle."""
    n = n_(total)
    t_chord = chord_t if chord_t is not None else len(run) * run_step
    layers = []
    for i, m in enumerate(run):
        layers.append((V(m, run_step * 1.6, 0.25, sus=0.5), i * run_step, 0.8))
        if double:
            layers.append((V(m + 12, run_step * 1.2, 0.5, sub=0.1), i * run_step, 0.3))
    if kick:
        layers.append((s.kick(0.22, 160, 50), 0.0, 0.9))
    if roll:
        for i in range(roll):
            t = t_chord - (roll - i) * 0.045
            layers.append((s.snare(0.1) * (0.5 + 0.5 * i / roll), max(0, t), 0.7))
    for m in chord:
        layers.append((V(m, hold, 0.5, sus=0.6, rel=0.12), t_chord, 0.55))
        layers.append((s.pulse_voice(float(s.mtof(m + 12)), hold, 0.25, 0.002, 0.1, 0.45, 0.12, sub=0.1), t_chord, 0.3))
        if saw:
            layers.append((d.saw(float(s.mtof(m)) * 1.003, n_(hold)) * d.adsr(n_(hold), 0.004, 0.1, 0.5, 0.15) * 0.18, t_chord, 1.0))
    if bass is not None:
        layers.append((s.pulse_voice(float(s.mtof(bass)), hold + 0.1, 0.5, 0.002, 0.08, 0.7, 0.15, sub=0.8), t_chord, 0.7))
        layers.append((s.kick(0.25, 130, 45), t_chord, 0.9))
    if crash:
        layers.append((s.crash(crash), t_chord, 0.5))
    for i in range(sparkle):
        m = chord[-1] + 12 + [0, 4, 7, 12, 7, 4, 12, 16, 19][i % 9]
        layers.append((s.bell(float(s.mtof(m)), 0.35, tau=0.12), t_chord + 0.05 + 0.06 * i, 0.22 + shimmer))
    x = d.mix(*layers, length=n)
    x = d.sat(x, 1.5)
    x = d.crush(x, 2)
    x = d.lp(x, 8500, 1)
    return d.reverb(x, verb, 0.14, tail=0.1)[:n]


@snd("stinger-01", "", "stinger", lufs=-19, note="tier 1: 3-note chip arpeggio, no drums")
def _():
    return fanfare(0.55, [72, 76, 79], 0.075, [79], hold=0.25, verb=0.15)


@snd("stinger-02", "", "stinger", lufs=-18.5, note="tier 2: 4-note arpeggio + held fifth + bell")
def _():
    return fanfare(0.7, [72, 76, 79, 84], 0.07, [79, 84], hold=0.3, sparkle=1, verb=0.18)


@snd("stinger-03", "", "stinger", lufs=-18, note="tier 3: 5-note run + major chord + bass")
def _():
    return fanfare(0.95, [72, 76, 79, 84, 88], 0.065, [76, 79, 84], hold=0.45, bass=48, sparkle=2, verb=0.2)


@snd("stinger-04", "", "stinger", lufs=-17.5, note="tier 4: kick + 6-note run + chord with bass kick + sparkle")
def _():
    return fanfare(1.15, [67, 72, 76, 79, 84, 88], 0.06, [72, 76, 79, 84], hold=0.55, bass=48, kick=True, sparkle=3, verb=0.22)


@snd("stinger-05", "", "stinger", lufs=-17, note="tier 5: run, snare fill, IV-V-I chord hits, double-octave voices")
def _():
    n = n_(1.35)
    a = fanfare(0.6, [65, 69, 72, 77, 81], 0.06, [77, 81, 84], chord_t=0.32, hold=0.2, bass=41, kick=True, roll=0, verb=0.1, double=True)
    b = fanfare(0.75, [], 0.06, [79, 83, 86, 91], chord_t=0.0, hold=0.55, bass=43, crash=0.5, sparkle=3, verb=0.22)
    return d.mix(a, (b, 0.45, 1.0), length=n)


@snd("stinger-06", "", "stinger", lufs=-16.5, note="tier 6: key lift to D, snare roll, crash, saw layer")
def _():
    n = n_(1.45)
    a = fanfare(0.7, [62, 66, 69, 74, 78, 81], 0.055, [74, 78, 81], chord_t=0.33, hold=0.2, kick=True, roll=3, verb=0.1, double=True)
    b = fanfare(0.85, [], 0.06, [74, 78, 81, 86], chord_t=0.0, hold=0.7, bass=38, crash=0.7, sparkle=4, saw=True, verb=0.24)
    return d.mix(a, (b, 0.52, 1.0), length=n)


@snd("stinger-07", "", "stinger", lufs=-16, note="tier 7: two-octave run, triple chord stabs, crash")
def _():
    n = n_(1.55)
    run = [60, 64, 67, 72, 76, 79, 84, 88, 91]
    a = fanfare(0.65, run, 0.05, [91], chord_t=0.45, hold=0.1, kick=True, roll=2, verb=0.1, double=True)
    stab1 = fanfare(0.3, [], 0.05, [72, 76, 79, 84], chord_t=0.0, hold=0.12, bass=36, verb=0.05)
    stab2 = fanfare(0.3, [], 0.05, [74, 77, 81, 86], chord_t=0.0, hold=0.12, bass=38, verb=0.05)
    fin = fanfare(0.95, [], 0.05, [76, 79, 84, 88], chord_t=0.0, hold=0.75, bass=40, crash=0.8, sparkle=5, saw=True, verb=0.25)
    return d.mix(a, (stab1, 0.5, 0.9), (stab2, 0.64, 0.9), (fin, 0.78 - 0.1, 1.0), length=n)


@snd("stinger-08", "", "stinger", lufs=-15.5, note="tier 8: snare roll build, rising run, huge saw chord, shimmer")
def _():
    n = n_(1.7)
    a = fanfare(0.9, [60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 0.05, [96], chord_t=0.55, hold=0.1, kick=True, roll=6, verb=0.1, double=True)
    fin = fanfare(1.1, [], 0.05, [79, 83, 86, 91], chord_t=0.0, hold=0.9, bass=43, crash=1.0, sparkle=7, shimmer=0.05, saw=True, verb=0.3)
    return d.mix(a, (fin, 0.6, 1.0), length=n)


@snd("stinger-09", "", "stinger", lufs=-15, note="tier 9: long build, two chord blows, crash, bell cascade")
def _():
    n = n_(1.9)
    a = fanfare(1.0, [60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 0.045, [96], chord_t=0.5, hold=0.1, kick=True, roll=8, verb=0.1, double=True)
    b1 = fanfare(0.4, [], 0.05, [72, 76, 79, 84, 88], chord_t=0.0, hold=0.2, bass=36, crash=0.4, verb=0.08, saw=True)
    fin = fanfare(1.2, [], 0.05, [79, 84, 88, 91, 96], chord_t=0.0, hold=1.0, bass=43, crash=1.1, sparkle=9, shimmer=0.08, saw=True, verb=0.35)
    return d.mix(a, (b1, 0.55, 1.0), (fin, 0.7, 1.0), length=n)


@snd("stinger-10", "", "stinger", lufs=-14, note="tier 10: 16th-note scale run, triple chord blows, crashes, bell cascade")
def _():
    n = n_(1.93)
    run = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96]
    a = fanfare(1.0, run, 0.032, [96], chord_t=0.72, hold=0.1, kick=True, roll=10, verb=0.1, double=True)
    b1 = fanfare(0.35, [], 0.05, [72, 76, 79, 84, 88], chord_t=0.0, hold=0.18, bass=36, crash=0.35, verb=0.05, saw=True)
    b2 = fanfare(0.35, [], 0.05, [74, 78, 81, 86, 90], chord_t=0.0, hold=0.18, bass=38, crash=0.35, verb=0.05, saw=True)
    fin = fanfare(1.35, [], 0.05, [79, 84, 88, 91, 96, 100], chord_t=0.0, hold=1.15, bass=43, crash=1.2, sparkle=9, shimmer=0.1, saw=True, verb=0.4)
    return d.mix(a, (b1, 0.66, 1.0), (b2, 0.8, 1.0), (fin, 0.65 + 0.3, 1.0), length=n)[:n]


SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96, 98, 100]


def grand(total, runs, step, run_end, stabs, fin, boom=False, extra_crash=None):
    """Tiers 11+: tier 10's shape (16th-note run into a snare roll, chord stabs, big final chord) made longer and denser.
    runs: list of (scale slice, offset in semitones) played in parallel; stabs: [(time, chord, bass)];
    fin: dict of fanfare() kwargs for the final chord plus 'at' (seconds); boom adds a sub drop under it."""
    n = n_(total)
    layers = []
    for sl, off in runs:
        layers.append((fanfare(run_end + 0.3, [m + off for m in sl], step, [sl[-1] + off], chord_t=run_end, hold=0.1,
                               kick=off == 0, roll=12 if off == 0 else 0, verb=0.1, double=off == 0), 0.0, 1.0 if off == 0 else 0.7))
    for t, chord, bass in stabs:
        layers.append((fanfare(0.35, [], 0.05, chord, chord_t=0.0, hold=0.18, bass=bass, crash=0.35, verb=0.05, saw=True), t, 1.0))
    at = fin.pop("at")
    layers.append((fanfare(total - at + 0.05, [], 0.05, chord_t=0.0, **fin), at, 1.0))
    if extra_crash:
        layers.append((s.crash(extra_crash[1]), extra_crash[0], 0.5))
    if boom:
        layers.append((s.kick(0.6, 90, 30), at, 1.0))
    return d.mix(*layers, length=n)[:n]


@snd("stinger-11", "", "stinger", lufs=-14, note="tier 11: tier 10 plus a parallel fifth run, four chord stabs, 7-note final chord, second crash")
def _():
    return grand(2.1, [(SCALE[:22], 0), (SCALE[:22], 7)], 0.03, 0.66,
                 [(0.62, [72, 76, 79, 84, 88], 36), (0.74, [74, 78, 81, 86, 90], 38), (0.86, [76, 79, 84, 88, 91], 40)],
                 dict(at=1.0, chord=[79, 84, 88, 91, 96, 100, 103], hold=1.05, bass=43, crash=1.2, sparkle=11, shimmer=0.1,
                      saw=True, verb=0.42), extra_crash=(0.62, 0.5))


@snd("stinger-12", "", "stinger", lufs=-14, note="tier 12: full-range run, key lift by a tone at the stabs and the final chord, bass drop, two crashes")
def _():
    return grand(2.3, [(SCALE[:24], 0), (SCALE[:24], 7)], 0.03, 0.72,
                 [(0.68, [72, 76, 79, 84, 88], 36), (0.78, [74, 78, 81, 86, 90], 38), (0.88, [76, 80, 83, 88, 92], 40),
                  (0.98, [78, 82, 85, 90, 94], 42)],
                 dict(at=1.1, chord=[81, 85, 88, 93, 97, 100, 105], hold=1.15, bass=45, crash=1.3, sparkle=12, shimmer=0.12,
                      saw=True, verb=0.46), boom=True, extra_crash=(0.68, 0.55))


@snd("stinger-13", "", "stinger", lufs=-14, note="tier 13: run in thirds and fifths, five rising stabs, double final blow with a bell shower and sub boom")
def _():
    n = n_(2.45)
    a = grand(2.45, [(SCALE[:24], 0), (SCALE[:24], 7), (SCALE[:24], 12)], 0.03, 0.72,
              [(0.68, [72, 76, 79, 84, 88], 36), (0.78, [74, 78, 81, 86, 90], 38), (0.88, [76, 80, 83, 88, 92], 40),
               (0.98, [78, 82, 85, 90, 94], 42), (1.08, [80, 84, 87, 92, 96], 44)],
              dict(at=1.2, chord=[81, 85, 88, 93, 97, 100, 105], hold=1.15, bass=45, crash=1.3, sparkle=13, shimmer=0.13,
                   saw=True, verb=0.48), boom=True, extra_crash=(0.68, 0.55))
    hit = fanfare(1.0, [], 0.05, [84, 88, 91, 96, 100, 105, 108], chord_t=0.0, hold=0.85, bass=48, crash=1.0, sparkle=10,
                  shimmer=0.12, saw=True, verb=0.45)
    return d.mix(a, (hit, 1.44, 0.9), length=n)[:n]


@snd("stinger-14", "", "stinger", lufs=-14, note="tier 14: the finale - two runs, long roll, six stabs, triple final blow (key lift each time), sub boom, long bell shower")
def _():
    n = n_(2.6)
    a = grand(2.6, [(SCALE[:24], 0), (SCALE[:24], 7), (SCALE[:24], 12)], 0.028, 0.67,
              [(0.62, [72, 76, 79, 84, 88], 36), (0.71, [74, 78, 81, 86, 90], 38), (0.80, [76, 80, 83, 88, 92], 40),
               (0.89, [78, 82, 85, 90, 94], 42), (0.98, [80, 84, 87, 92, 96], 44), (1.07, [82, 86, 89, 94, 98], 46)],
              dict(at=1.16, chord=[81, 85, 88, 93, 97, 100, 105], hold=1.1, bass=45, crash=1.3, sparkle=13, shimmer=0.13,
                   saw=True, verb=0.5), boom=True, extra_crash=(0.62, 0.6))
    hit2 = fanfare(1.1, [], 0.05, [84, 88, 91, 96, 100, 105, 108], chord_t=0.0, hold=0.95, bass=48, crash=1.1, sparkle=12,
                   shimmer=0.13, saw=True, verb=0.48)
    hit3 = fanfare(1.0, [], 0.05, [86, 90, 93, 98, 102, 107, 110], chord_t=0.0, hold=0.85, bass=50, crash=1.2, sparkle=14,
                   shimmer=0.15, saw=True, verb=0.5)
    return d.mix(a, (hit2, 1.46, 0.95), (hit3, 1.62, 1.0), (s.kick(0.7, 80, 28), 1.62, 0.9), length=n)[:n]


@snd("stinger-2137", "", "stinger", lufs=-16, note="JOKE: two low bell tolls, solemn organ chord swell, one tiny cheerful 'pip' at the end")
def _():
    n = n_(1.93)
    bl = np.zeros(n)
    for t, g in [(0.0, 1.0), (0.62, 0.9)]:
        b = s.bell(110.0, 1.4, bright=0.8, tau=1.0)
        b += s.bell(220.0, 1.4, bright=0.6, tau=0.7) * 0.5
        bl = d.mix(bl, (b, t, g), length=n)
    org = np.zeros(n)
    for m in [45, 57, 60, 64, 69]:
        org = d.mix(org, (s.organ(float(s.mtof(m)), 1.05, a=0.28, r=0.25), 1.0 - 0.28 + 0.3, 0.55 if m > 45 else 0.8), length=n)
    org = d.tremolo(org, 5.5, 0.18)
    pip = s.bell(float(s.mtof(108)), 0.3, bright=1.2, tau=0.1) * 0.5
    x = d.mix((bl, 0, 1.0), (org, 0, 1.0), (pip, 1.62, 1.0), length=n)
    return d.reverb(x, 0.8, 0.3, tail=0.1)[:n]
