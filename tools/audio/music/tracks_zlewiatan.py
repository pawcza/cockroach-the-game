"""Zlewiatan: three takes on the three-headed thing out of the kitchen-sink drain. Slow, lurching, low, wet,
slightly comic. The ambient layer is the plumbing: drips, drain gurgle, pipe resonance tuned to the key."""
from engine import Song, bars, midi, hz, d, root
import instruments as I
from common import prog, bass_part, held_chords, stab_part, every, diatonic, circ_lp, circ_hp, np


def lurch(ev, amount=0.06):
    """Push every off-beat eighth late: the gait of something too heavy for its legs."""
    out = []
    for e in ev:
        b = e[0]
        out.append((b + amount if abs(b % 1 - 0.5) < 1e-6 else b,) + tuple(e[1:]))
    return out


def drips(s, rate, lo, hi, gain, pan=0.0):
    r = s.rng
    hits, t = [], float(r.uniform(0, 1))
    while t < s.beats - 0.1:
        hits.append((t, r.uniform(0.4, 1.0), int(r.integers(6))))
        t += r.exponential(s.bpm / 60 / rate)
    sigs = [I.drip(f) for f in np.geomspace(lo, hi, 6)]
    s.send("amb", s.hits_line(hits, lambda v: sigs[v]), gain, pan=pan, rev=0.7, dly=0.2, name="drips")


def pipe(s, freqs, gain, cycles=2):
    """Air in a long pipe: noise through narrow resonances on the key's root and fifth, swelling slowly."""
    z = s.noise(30, 2500)
    x = s.circ(lambda v: d.formant(v, list(freqs), [28] * len(freqs), [1, 0.7, 0.5, 0.3][:len(freqs)]), z)
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * 0.25
    s.send("amb", x * (0.55 + 0.45 * s.lfo(cycles)), gain, rev=0.3, name="pipe resonance")


def gurgles(s, beats, gain, dur=1.5, lo=140, hi=650):
    sigs = [I.gurgle(s.rng, dur, lo, hi) for _ in beats]
    s.send("amb", s.hits_line([(b, 1.0, i) for i, b in enumerate(beats)], lambda v: sigs[v]), gain, pan=-0.2,
           rev=0.5, name="gurgles")


# ---------------------------------------------------------------- A: march out of the drain (E phrygian)
def zlewiatan_a():
    s = Song("zlewiatan-a", 72, 8)
    s.section(0, "E", "phryg")
    pr = prog(s, "Em", "F", "Em", "G F", "Am", "F", "Dm G", "F")
    s.fx["fg"].update(rt60=1.6, rev=0.8, dly_beats=0.75, fb=0.3, dly_lp=2500)
    s.fx["bg"].update(rt60=1.4, rev=0.7)
    s.fx["amb"].update(rt60=2.4, rev=1.0, damp=3000)
    tuba = bars(s,
                "E3/1.5 F3/.5 G3/1 E3/1",
                "A3/1.5 G3/.5 F3/1 C3/1",
                "E3/.5 E3/.5 B3/1 A3/.5 G3/.5 F3/1",
                "G3/1.5 B3/.5 A3/1 F3/1",
                "A3/2 E3/2", "F3/2 C3/2", "D3/2 G3/2", "F3/4")
    tuba = lurch(tuba)
    x = s.notes_line(tuba, I.fmv, "tuba", "lead", legato=0.92, rise=0.06, idx=2.4, idx_end=0.9, a=0.03, dec=0.2,
                     sus=0.8, rel=0.1, slide=-1.0, stau=0.05, vib=0.004)
    s.send("fg", d.sat(circ_lp(s, x, 1800), 1.6), 0.6, rev=0.25, name="tuba")
    sq = bars(s, "r/4", "r/4", "r/4", "r/4",
              "E5/1.5 D5/.5 C5/1 A4/1",
              "F5/1.5 E5/.5 C5/1 A4/1",
              "D5/1 F5/1 G5/1.5 F5/.5",
              "A5/1 G5/.5 F5/.5 E5/2")
    q = s.notes_line(lurch(sq), I.pulse, "pierog", "lead", legato=0.9, duty=0.5, slide=-2.0, stau=0.06, wob=0.008,
                     dec=0.2, sus=0.6, rel=0.1)
    s.send("fg", circ_lp(s, q, 4000), 0.4, pan=0.2, rev=0.35, dly=0.25, name="pierog square")

    pat = [(0, 1.25, 0), (1.5, 0.5, 0), (2, 1.25, 0), (3.5, 0.45, 0)]
    bass = lurch(bass_part(s, pr, pat))
    main = [e for e in bass if abs(e[0] % 4 - 3.56) > 0.1]
    blop = [e for e in bass if abs(e[0] % 4 - 3.56) <= 0.1]
    b = s.notes_line(main, I.sawbass, "bass", "bass", legato=0.95, sus=0.8)
    b += s.notes_line(blop, I.sawbass, "bass", "bass", legato=1.0, drop=4.0)
    s.send("bg", d.sat(circ_lp(s, b, 700), 1.8), 0.55, name="lurch bass")
    pd = held_chords(pr, 52, 3)
    s.notes += [("pad", "chord", e[0], e[1], e[2]) for e in pd]
    p = s.notes_line(pd, I.pad, a=0.4, rel=0.5)
    s.send("bg", circ_lp(s, p, 1100), 0.2, pan=-0.15, rev=0.4, name="dark pad")
    kk = I.kick("deep")
    kicks = lurch(every(s, [0, 1.5]) + every(s, [2.75], bars_on=[1, 3, 5]))
    s.send("bg", s.hits_line(kicks, lambda v: kk), 0.9, name="kick")
    sn = I.snare(150, 0.35, 0.9, 1.8)
    s.send("bg", s.hits_line(every(s, [2]), lambda v: sn), 0.5, rev=0.5, name="snare")
    lt = I.tom(75, 0.5)
    s.send("bg", s.hits_line(lurch(every(s, [3.5], 0.8, bars_on=range(7))), lambda v: lt), 0.45, rev=0.3, name="plop tom")
    toms = [I.tom(f, 0.45) for f in (130, 105, 85, 70)]
    fill = [(28 + 2 + k * 0.5, 0.8 + 0.05 * k, k) for k in range(4)]
    s.send("bg", s.hits_line(fill, lambda v: toms[v]), 0.5, rev=0.3, name="tom fill")
    tp = I.timpani(hz(midi("E2")), 1.8)
    s.send("bg", s.hits_line([(0, 1.0), (16, 1.0)], lambda v: tp), 0.5, rev=0.4, name="timpani")
    hh = I.hat(False, 0.04)
    s.send("bg", s.hits_line(lurch(every(s, [0.5, 1, 2.5, 3], 1.0)), lambda v: hh), 0.4, pan=0.3, name="hat")

    pipe(s, [hz(midi("E2")), hz(midi("E3")), hz(midi("B3"))], 0.5)
    drips(s, 1.3, 700, 1500, 0.35, pan=0.25)
    gurgles(s, [6, 14.5, 22, 29], 0.45)
    cr = [I.creak(f, 1.4, 18, 32) for f in (80, 105)]
    s.send("amb", s.hits_line([(9, 1.0, 0), (25, 1.0, 1)], lambda v: cr[v]), 0.2, pan=-0.3, rev=0.5, name="pipe creaks")
    return s, dict(name="Marsz z odpływu", key="E Phrygian", meter="4/4",
                   desc="E Phrygian, 72 BPM lurching half-time: bloated FM tuba lead, sliding 'pierog' square answer, sagging saw bass, drain + drips")


# ---------------------------------------------------------------- B: waltz of three heads (G minor, 3/4)
def zlewiatan_b():
    s = Song("zlewiatan-b", 96, 16, meter=3)
    s.section(0, "G", "harm")
    names = ["Gm", "Gm", "D7", "D7", "Cm", "Gm", "D7", "Gm", "Eb", "Bb", "Cm", "Gm", "Eb", "D7", "Gm", "D7"]
    pr = prog(s, *names)
    s.fx["fg"].update(rt60=1.5, rev=0.8, dly_beats=1.0, fb=0.25, dly_lp=3000)
    s.fx["bg"].update(rt60=1.3, rev=0.6)
    s.fx["amb"].update(rt60=2.6, rev=1.0, damp=2800)
    lead = bars(s,
                "G4/1.5 A4/.5 Bb4/1", "D5/2 Bb4/1", "C5/1.5 Bb4/.5 A4/1", "F#4/2 D4/1",
                "Eb5/1.5 D5/.5 C5/1", "Bb4/1.5 A4/.5 G4/1", "A4/1 C5/1 F#4/1", "G4/2 r/1",
                "G5/1.5 F5/.5 Eb5/1", "D5/2 F5/1", "Eb5/1.5 D5/.5 C5/1", "Bb4/2 D5/1",
                "G5/1 Bb5/1 G5/1", "F#5/1.5 Eb5/.5 C5/1", "D5/1 Bb4/1 G4/1", "A4/1 C5/1 F#4/1")
    x = s.notes_line(lead, I.pulse, "lead", "lead", legato=0.95, duty=0.5, sub=0.5, dec=0.3, sus=0.7, rel=0.15,
                     vib=0.007, vrate=6.5, wob=0.012)
    s.send("fg", circ_lp(s, x, 3800), 0.5, rev=0.35, dly=0.15, name="seasick calliope")
    gl = [(b, du, m + 12, 0.7) for b, du, m, v in lead if b >= 24]
    g = s.notes_line(gl, I.bellv, "glock", "lead", tau=0.4)
    s.send("fg", g, 0.3, pan=0.3, rev=0.5, name="glockenspiel B")

    ev = []
    for i, nm in enumerate(names):
        iv = 7 if i and names[i - 1] == nm else 0
        ev.append((i * 3, 1.0, root(nm, 2) + iv))
    b = s.notes_line(ev, I.fmv, "bass", "bass", legato=0.85, rise=0.03, idx=1.8, idx_end=0.7, a=0.02, dec=0.2,
                     sus=0.6, rel=0.1, slide=-0.5, stau=0.04)
    s.send("bg", d.sat(circ_lp(s, b, 1300), 1.4), 0.55, name="tuba oom")
    st = stab_part(s, pr, [1, 2], 0.6, 60, 3)
    s.notes += [("pahpah", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.organ, drawbars=(0.5, 0.0, 1.0, 0.5, 0.2, 0.3, 0.0, 0.1))
    s.send("bg", circ_lp(s, o, 3000), 0.22, pan=-0.2, rev=0.3, name="organ pah-pah")
    kk = I.kick("deep")
    s.send("bg", s.hits_line(every(s, [0]), lambda v: kk), 0.8, name="kick")
    rm = I.rim()
    s.send("bg", s.hits_line(every(s, [1, 2], 0.8), lambda v: rm), 1.0, pan=0.2, rev=0.3, name="rim pah-pah")
    tp = I.timpani(hz(midi("D2")), 0.6)
    roll = [(7 * 3 + 1 + k * 0.25, 0.3 + 0.7 * k / 7) for k in range(8)]
    s.send("bg", s.hits_line(roll, lambda v: tp), 0.4, rev=0.4, name="timpani roll")
    cr = I.crash(2.5)
    s.send("bg", s.hits_line([(24, 1.0)], lambda v: cr), 0.2, rev=0.4, name="crash")
    toms = [I.tom(f, 0.45) for f in (140, 110, 90, 72)]
    s.send("bg", s.hits_line([(45 + 1 + k * 0.5, 0.9, k) for k in range(4)], lambda v: toms[v]), 0.45, rev=0.3,
           name="tom fill")

    pipe(s, [hz(midi("G2")), hz(midi("D3")), hz(midi("G3"))], 0.4, cycles=4)
    s.send("amb", s.noise(25, 220, -1.0) * (0.6 + 0.4 * s.lfo(4)), 0.5, name="drain suction")
    drips(s, 1.0, 600, 1300, 0.35, pan=-0.25)
    gurgles(s, [7, 19, 31, 43], 0.5, 2.2, 120, 520)
    cr2 = [I.creak(f, 2.0, 15, 30) for f in (70, 90)]
    s.send("amb", s.hits_line([(16, 1.0, 0), (40, 1.0, 1)], lambda v: cr2[v]), 0.22, pan=0.3, rev=0.5, name="pipe groans")
    return s, dict(name="Walc trzech głów", key="G minor (harmonic)", meter="3/4",
                   desc="G minor, 96 BPM 3/4 grotesque waltz: seasick wobbling calliope (+glockenspiel in B), tuba oom, organ pah-pah, suction drain")


# ---------------------------------------------------------------- C: sludge from the pipe (Bb minor, 12/8)
def zlewiatan_c():
    s = Song("zlewiatan-c", 64, 8)
    s.section(0, "Bb", "harm")
    pr = prog(s, "Bbm", "Bbm", "Gb", "F", "Gb", "Db", "Ebm", "F")
    s.fx["fg"].update(rt60=2.0, rev=0.8, dly_beats=2 / 3, fb=0.35, dly_lp=2500)
    s.fx["bg"].update(rt60=1.6, rev=0.6)
    s.fx["amb"].update(rt60=2.8, rev=1.0, damp=2600)
    lead = bars(s,
                "Bb4/4t Db5/2t F5/2",
                "Eb5/4t Db5/2t C5/1 Bb4/1",
                "Db5/4t Bb4/2t Gb4/2",
                "A4/4t C5/2t F5/4t Eb5/2t",
                "Bb5/4t Ab5/2t Gb5/1 F5/1",
                "F5/4t Ab5/2t F5/1 Db5/1",
                "Gb5/4t F5/2t Eb5/1 Bb4/1",
                "A4/4t C5/2t F5/1 r/1")
    x = s.notes_line(lead, I.pulse, "lead", "lead", legato=0.97, duty=0.4, sub=0.3, slide=-2.0, stau=0.07, vib=0.01,
                     vrate=4.8, dec=0.4, sus=0.8, rel=0.2)
    x = circ_lp(s, d.sat(circ_hp(s, x, 150) * 1.5, 3.0), 2800)
    s.send("fg", x, 0.5, rev=0.3, dly=0.2, name="fuzz square lead")
    # the second head joins in diatonic thirds below for bars 5-7
    hv = [(b, du, diatonic(m, -2, 10, "minor"), 0.8) for b, du, m, v in lead if 16 <= b < 28]
    h = s.notes_line(hv, I.pulse, "head2", "lead", legato=0.97, duty=0.25, slide=-2.0, stau=0.09, wob=0.01, sus=0.8)
    s.send("fg", circ_lp(s, d.sat(h, 2.0), 2400), 0.3, pan=-0.3, rev=0.4, name="second head")

    T = 2 / 3
    pat = []
    for k in range(4):
        pat += [(k, T, 0), (k + T, 1 / 3, 0)]
    bass = bass_part(s, pr, pat, octave=2, approach={3 + T: -1})
    appr = [e for e in bass if abs(e[0] % 4 - (3 + T)) < 1e-6]   # chromatic lead-in to the next chord's root
    bass = [e for e in bass if abs(e[0] % 4 - (3 + T)) >= 1e-6]
    b = s.notes_line(bass, I.sawbass, "bass", "bass", legato=0.9, sus=0.85)
    b += s.notes_line(appr, I.sawbass, "bass", "passing", legato=0.9, sus=0.85)
    s.send("bg", d.sat(circ_lp(s, b, 600), 2.5), 0.5, name="sludge bass")
    pw = []
    for bt, du, nm in pr:
        r_ = root(nm, 3)
        for iv in (0, 7, 12):
            pw.append((bt, 2.5, r_ + iv))
    s.notes += [("power", "chord", e[0], e[1], e[2]) for e in pw]
    g = s.notes_line(pw, I.sawbass, legato=1.0, a=0.01, dec=0.6, sus=0.5, rel=0.3)
    s.send("bg", circ_lp(s, d.sat(g * 2, 4.0), 2200), 0.12, pan=0.25, rev=0.3, name="power chords")
    kk = I.kick("deep")
    s.send("bg", s.hits_line(every(s, [0, 1 + T, 2 + 2 * T / 2]), lambda v: kk), 0.85, name="kick")
    sn = I.snare(140, 0.4, 1.0, 2.0)
    s.send("bg", s.hits_line(every(s, [2]), lambda v: sn), 0.5, rev=0.6, name="snare")
    hh = I.hat(False, 0.05)
    trip = every(s, [k / 3 for k in range(12)], 0.6, bars_on=range(7))
    trip = [(b_, 1.0 if abs(b_ % 1) < 1e-6 else 0.5) for b_, g_, v_ in trip]
    s.send("bg", s.hits_line(trip, lambda v: hh), 0.5, pan=-0.3, name="triplet hat")
    toms = [I.tom(f, 0.5) for f in (120, 95, 75, 60)]
    fill = [(28 + 1 + k / 3, 0.7 + 0.3 * k / 8, min(3, k // 3)) for k in range(9)]
    s.send("bg", s.hits_line(fill, lambda v: toms[v]), 0.45, rev=0.3, name="floor tom triplets")

    s.send("amb", s.noise(40, 900, -0.5) * (0.5 + 0.5 * s.lfo(2)) ** 2, 0.6, name="suction")
    pipe(s, [hz(midi("Bb1")), hz(midi("F2")), hz(midi("Bb2"))], 0.35, cycles=1)
    gurgles(s, [1.5, 6, 10.3, 14.7, 18, 22.4, 26, 30.6], 0.4, 1.2, 100, 450)
    hammer = I.metal(hz(midi("Bb3")), 0.9, 0.25)
    knocks = [(4 + 3 + T + k * 1 / 3, 1.0 - 0.2 * k) for k in range(3)] + [(20 + 3 + T + k * 1 / 3, 1.0 - 0.2 * k) for k in range(3)]
    s.send("amb", s.hits_line(knocks, lambda v: hammer), 0.2, pan=0.35, rev=0.6, name="water hammer")
    drips(s, 0.9, 500, 1100, 0.3, pan=0.2)
    return s, dict(name="Szlam z rury", key="B-flat minor (harmonic)", meter="12/8",
                   desc="B-flat minor, 64 BPM 12/8 sludge shuffle: fuzz square lead with bends (2nd head in thirds), distorted saw riff, suction + water hammer")


TRACKS = {"a": zlewiatan_a, "b": zlewiatan_b, "c": zlewiatan_c}
