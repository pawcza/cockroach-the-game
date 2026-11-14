"""Eksterminator: three takes on the pest-control man in the hazmat suit. Cold, industrial, relentless, driving;
each has a B section that pushes harder (he gets angrier). The ambient layer is his gear: tank hiss, spray,
breathing through the gas mask, valves, metal."""
from engine import Song, bars, midi, hz, d
import instruments as I
from common import prog, bass_part, held_chords, stab_part, arp_part, every, circ_lp, circ_hp, np


def mask_breaths(s, cycle_beats, bars_on=None, gain=0.5, pan=0.0):
    """Inhale for half the cycle, exhale for the other half, on the grid."""
    half = cycle_beats / 2
    ins = [I.breath(s.sec(half) * 0.92, True) for _ in range(2)]
    outs = [I.breath(s.sec(half) * 0.97, False) for _ in range(2)]
    hits, t, k = [], 0.0, 0
    while t < s.beats - 1e-9:
        if bars_on is None or int(t // s.meter) in bars_on:
            hits.append((t, 1.0, k % 2))
            hits.append((t + half, 1.0, 2 + k % 2))
        k += 1
        t += cycle_beats
    sig = lambda v: ins[v] if v < 2 else outs[v - 2]
    return s.hits_line(hits, sig)


# ---------------------------------------------------------------- A: motorik extermination (F# minor)
def eksterminator_a():
    s = Song("eksterminator-a", 128, 16)
    s.section(0, "F#", "harm")
    pr = prog(s, "F#m", "F#m", "D", "E", "F#m", "F#m", "Bm", "C#", "D", "E", "F#m", "F#m", "D", "E", "Bm", "C#")
    s.fx["fg"].update(rt60=1.0, rev=0.6, dly_beats=0.75, fb=0.4, dly_lp=4000)
    s.fx["bg"].update(rt60=0.7, rev=0.4, dly_beats=0.75, fb=0.3)
    s.fx["amb"].update(rt60=1.2, rev=0.7, damp=5000)
    lead = bars(s,
                "F#5/.5 C#5/.5 F#5/.5 A5/.5 G#5/1 E5/1",
                "F#5/.5 C#5/.5 F#5/.5 A5/.5 C#6/2",
                "B5/.5 A5/.5 F#5/.5 D5/.5 A5/1 F#5/1",
                "G#5/.5 E5/.5 B4/.5 E5/.5 G#5/1 B5/1",
                "F#5/.5 C#5/.5 F#5/.5 A5/.5 G#5/1 E5/1",
                "F#5/.5 C#5/.5 F#5/.5 A5/.5 B5/1 C#6/1",
                "D6/.5 C#6/.5 B5/.5 F#5/.5 D5/1 B4/1",
                "C#5/.5 F5/.5 G#5/.5 C#6/.5 G#5/2",
                "A5/.25 A5/.25 A5/.5 F#5/.5 A5/.5 D6/1 C#6/1",
                "B5/.25 B5/.25 B5/.5 G#5/.5 B5/.5 E6/1 D6/1",
                "C#6/1.5 A5/.5 F#5/1 C#5/1",
                "F#5/.5 G#5/.5 A5/.5 B5/.5 C#6/2",
                "A5/.25 A5/.25 A5/.5 F#5/.5 A5/.5 D6/1 C#6/1",
                "B5/.25 B5/.25 B5/.5 G#5/.5 B5/.5 E6/1 D6/1",
                "D6/.5 C#6/.5 B5/.5 A5/.5 F#5/1 D5/1",
                "F5/1 G#5/1 C#6/2")
    x = s.notes_line(lead, I.pulse, "lead", "lead", legato=0.8, duty=0.5, dec=0.1, sus=0.6, rel=0.05)
    s.send("fg", circ_lp(s, x, 5000), 0.45, pan=0.05, rev=0.2, dly=0.35, name="cold square lead")
    lo = [(b, du, m - 12, 0.8) for b, du, m, v in lead if b >= 32]
    l2 = s.notes_line(lo, I.pulse, "lead-8vb", "lead", legato=0.8, duty=0.25, dec=0.1, sus=0.6, rel=0.05)
    s.send("fg", circ_lp(s, l2, 3500), 0.3, pan=-0.2, rev=0.2, name="B octave below")

    pat = [(k * 0.5, 0.5, 0) for k in range(7)] + [(3.5, 0.5, 12)]
    b = s.notes_line(bass_part(s, pr, pat), I.fmv, "bass", "bass", legato=0.85, idx=2.6, idx_end=1.0, itau=0.04,
                     dec=0.08, sus=0.6, rel=0.03)
    s.send("bg", circ_lp(s, b, 2200), 0.5, name="8th fm bass")
    ar = arp_part(s, pr, 0.25, 66, (0, 1, 2, 1, 2, 0, 1, 2))
    s.notes += [("arp", "chord", e[0], e[1], e[2]) for e in ar]
    a = s.notes_line(ar, I.pluck, duty=0.25, tau=0.05)
    s.send("bg", circ_lp(s, a, 3500), 0.12, pan=0.35, dly=0.2, name="sequencer arp")
    kk = I.kick("hard")
    s.send("bg", s.hits_line(every(s, [0, 1.5, 2]) + every(s, [3.5], bars_on=range(8, 16)), lambda v: kk), 0.85, name="motorik kick")
    sn = I.snare(185, 0.2, 0.9, 1.8)
    s.send("bg", s.hits_line(every(s, [1, 3]), lambda v: sn), 0.5, rev=0.2, name="snare")
    ch = I.hat(False, 0.035)
    hats = every(s, [k * 0.5 for k in range(8)], 1.0, bars_on=range(8)) + every(s, [k * 0.25 for k in range(16)], 0.8, bars_on=range(8, 16))
    s.send("bg", s.hits_line(hats, lambda v: ch), 0.2, pan=-0.25, name="hats (16ths in B)")
    cl = I.metal(520, 0.4, 0.08)
    s.send("bg", s.hits_line(every(s, [3.75], bars_on=range(1, 16, 2)), lambda v: cl), 0.25, pan=0.3, rev=0.3, name="clank")
    cr = I.crash(1.6)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.2, rev=0.2, name="crash")

    s.send("amb", mask_breaths(s, 8.0), 2.2, name="mask breathing")
    s.send("amb", s.noise(3000, 11000) * s.pump(0.7, 0.35, every=4.0), 0.12, pan=0.3, name="tank hiss pulse")
    s.send("amb", I.hum(s, hz(midi("F#1"))) * 0.6, 0.12, name="pump hum")
    vc = I.metal(1800, 0.15, 0.02)
    s.send("amb", s.hits_line([(b_ + 4, 1.0) for b_ in range(0, 64, 8)], lambda v: vc), 0.15, pan=-0.3, name="valve clicks")
    return s, dict(name="Dezynsekcja motorik", key="F-sharp minor (harmonic)", meter="4/4",
                   desc="F-sharp minor, 128 BPM motorik: cold 50% square lead with dotted delay, 8th FM bass, sequencer arp, mask breathing + tank hiss")


# ---------------------------------------------------------------- B: gas-mask march (C minor)
def eksterminator_b():
    s = Song("eksterminator-b", 100, 16)
    s.section(0, "C", "harm")
    pr = prog(s, "Cm", "G", "Cm", "Ab G", "Cm", "Fm", "Ab", "G", "Fm", "Cm", "Ab", "Eb", "Fm", "Cm", "Ddim", "G")
    s.fx["fg"].update(rt60=1.4, rev=0.7, dly_beats=1.0, fb=0.2)
    s.fx["bg"].update(rt60=1.2, rev=0.5)
    s.fx["amb"].update(rt60=1.6, rev=0.8, damp=4000)
    lead = bars(s,
                "C5/.75 C5/.25 G4/.75 G4/.25 C5/1 Eb5/1",
                "D5/.75 D5/.25 B4/.75 G4/.25 D5/2",
                "Eb5/.75 F5/.25 G5/1 Eb5/1 C5/1",
                "Ab5/.75 G5/.25 F5/.75 Eb5/.25 D5/1 B4/1",
                "C5/.75 C5/.25 G4/.75 G4/.25 C5/1 Eb5/1",
                "F5/.75 F5/.25 C5/.75 C5/.25 F5/1 Ab5/1",
                "Eb5/.75 Eb5/.25 C5/.75 Ab4/.25 Eb5/1 C5/1",
                "D5/.75 Eb5/.25 D5/.75 C5/.25 B4/2",
                "C6/1.5 Ab5/.5 F5/1 Ab5/1",
                "G5/1.5 Eb5/.5 C5/1 Eb5/1",
                "Ab5/.75 Bb5/.25 C6/1 Eb6/1 C6/1",
                "Bb5/2 G5/1 Eb5/1",
                "C6/.75 C6/.25 Ab5/.75 F5/.25 C6/1 F6/1",
                "Eb6/.75 D6/.25 C6/.75 G5/.25 Eb5/2",
                "D5/.75 F5/.25 Ab5/1 F5/1 D5/1",
                "G5/.75 G5/.25 B5/.75 D6/.25 G5/1 r/1")
    x = s.notes_line(lead, I.fmv, "lead", "lead", legato=0.85, rise=0.05, idx=3.2, idx_end=1.2, a=0.02, dec=0.2,
                     sus=0.75, rel=0.08, vib=0.004)
    s.send("fg", circ_lp(s, d.sat(x, 1.5), 4500), 0.5, rev=0.25, dly=0.1, name="fm brass fanfare")
    dbl = [(b, du, m - 12, 0.85) for b, du, m, v in lead if b >= 32]
    x2 = s.notes_line(dbl, I.supersaw, "brass-8vb", "lead", legato=0.85, a=0.02, det=0.004)
    s.send("fg", circ_lp(s, x2, 2500), 0.35, pan=-0.2, rev=0.25, name="B low brass")

    pat = [(0, 1.5, 0), (1.5, 0.5, 0), (2, 1, 0), (3, 1, 7)]
    b = s.notes_line(bass_part(s, pr, pat), I.sawbass, "bass", "bass", legato=0.8, dec=0.1, sus=0.6)
    s.send("bg", d.sat(circ_lp(s, b, 900), 1.6), 0.5, name="march bass")
    pd = held_chords(pr, 55, 3)
    s.notes += [("strings", "chord", e[0], e[1], e[2]) for e in pd]
    p = s.notes_line(pd, I.pad, a=0.2)
    s.send("bg", circ_lp(s, p, 1500), 0.16, pan=0.2, rev=0.3, name="low strings")
    kk = I.kick("march")
    s.send("bg", s.hits_line(every(s, [0, 2]), lambda v: kk), 0.9, name="bass drum")
    sn = I.snare(210, 0.18, 1.0, 1.6)
    rud = [(0, 1.0), (0.75, 0.45), (1, 0.85), (1.5, 0.55), (1.75, 0.45), (2, 1.0), (2.75, 0.45), (3, 0.85),
           (3.25, 0.45), (3.5, 0.55), (3.75, 0.45)]
    hits = []
    for bar in range(16):
        if bar in (7, 15):
            hits += [(bar * 4 + o, g) for o, g in rud if o < 2] + [(bar * 4 + 2 + k * 0.25, 0.4 + 0.6 * k / 7) for k in range(8)]
        else:
            hits += [(bar * 4 + o, g) for o, g in rud]
    s.send("bg", s.hits_line(hits, lambda v: sn), 0.45, rev=0.2, name="march snare")
    s.send("bg", s.hits_line([(bar * 4 + o - 0.06, 0.35) for bar in range(16) for o in (0, 2)], lambda v: sn), 0.45,
           name="flams")
    anv = I.metal(1150, 0.8, 0.2)
    s.send("bg", s.hits_line(every(s, [3], bars_on=[3, 7, 11, 15]), lambda v: anv), 0.25, pan=0.3, rev=0.3, name="anvil")
    cr = I.crash(2.0)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.2, rev=0.3, name="crash")

    s.send("amb", mask_breaths(s, 4.0), 2.0, name="mask breathing (per bar)")
    s.send("amb", I.hum(s, hz(midi("G1"))), 0.1, name="mains hum")
    hs = I.steam(0.45, 2800)
    s.send("amb", s.hits_line(every(s, [3.5], bars_on=range(1, 16, 2)), lambda v: hs), 0.25, pan=0.35, rev=0.3, name="valve hiss")
    st = I.metal(170, 0.3, 0.05)
    s.send("amb", s.hits_line(every(s, [0, 1, 2, 3], 1.0), lambda v: st), 0.3, pan=-0.2, rev=0.4, name="boots on metal")
    return s, dict(name="Marsz maski gazowej", key="C minor (harmonic)", meter="4/4",
                   desc="C minor, 100 BPM military march: stern FM brass fanfare (low brass doubles in B), snare rudiments, breathing in step")


# ---------------------------------------------------------------- C: pressure rising (EBM, B minor -> C minor)
def eksterminator_c():
    s = Song("eksterminator-c", 144, 16)
    s.section(0, "B", "harm")
    s.section(32, "C", "harm")
    pr = prog(s, "Bm", "Bm", "G", "A", "Bm", "Bm", "Em", "F#", "Cm", "Cm", "Ab", "Bb", "Cm", "Cm", "Fm", "G")
    s.fx["fg"].update(rt60=0.9, rev=0.5, dly_beats=0.5, fb=0.3, dly_lp=5000)
    s.fx["bg"].update(rt60=0.6, rev=0.4)
    s.fx["amb"].update(rt60=1.1, rev=0.6, damp=6000)
    lead = bars(s,
                "B4/.5 r/.25 B4/.25 D5/.5 F#5/.5 E5/.5 D5/.5 C#5/1",
                "B4/.5 r/.25 B4/.25 D5/.5 F#5/.5 B5/2",
                "D5/.5 r/.25 D5/.25 G5/.5 B5/.5 A5/.5 G5/.5 F#5/1",
                "E5/.5 r/.25 E5/.25 A5/.5 C#6/.5 B5/.5 A5/.5 E5/1",
                "B4/.5 r/.25 B4/.25 D5/.5 F#5/.5 E5/.5 D5/.5 C#5/1",
                "B4/.5 r/.25 B4/.25 D5/.5 F#5/.5 D6/1 C#6/1",
                "E5/.5 r/.25 E5/.25 G5/.5 B5/.5 G5/.5 E5/.5 B4/1",
                "F#5/.5 r/.25 F#5/.25 A#5/.5 C#6/.5 A#5/1 F#5/1",
                "C5/.5 r/.25 C5/.25 Eb5/.5 G5/.5 F5/.5 Eb5/.5 D5/1",
                "C5/.5 r/.25 C5/.25 Eb5/.5 G5/.5 C6/1 Eb6/1",
                "Eb5/.5 r/.25 Eb5/.25 Ab5/.5 C6/.5 Bb5/.5 Ab5/.5 G5/1",
                "F5/.5 r/.25 F5/.25 Bb5/.5 D6/.5 C6/.5 Bb5/.5 F5/1",
                "G5/.25 G5/.25 G5/.5 Eb6/.5 D6/.5 C6/1 G5/1",
                "C6/.5 B5/.5 C6/.5 D6/.5 Eb6/2",
                "F5/.5 r/.25 F5/.25 Ab5/.5 C6/.5 Ab5/1 F5/1",
                "G5/.5 r/.25 G5/.25 B5/.5 D6/.5 B5/1 D6/1")
    x = s.notes_line(lead, I.supersaw, "lead", "lead", legato=0.7, det=0.003, a=0.003, dec=0.1, sus=0.6, rel=0.05, vib=0.0)
    x = d.crush(x, hold=3, bits=6)
    s.send("fg", circ_lp(s, x, 6000), 0.45, rev=0.15, dly=0.25, name="crushed saw lead")
    rm = [(b, du, m + 12, 0.6) for b, du, m, v in lead if b >= 48]
    y = s.notes_line(rm, I.pulse, "lead-8va", "lead", legato=0.6, duty=0.125, dec=0.05, sus=0.4)
    s.send("fg", circ_lp(s, y, 7000), 0.18, pan=0.3, dly=0.3, name="last-4 octave stabs")

    pat = []
    for k in range(4):
        pat += [(k, 0.25, 0), (k + 0.25, 0.25, 0), (k + 0.5, 0.25, 12), (k + 0.75, 0.25, 0)]
    ev = bass_part(s, pr, pat)
    ev = [(b_, du, m, 1.2 if abs(b_ % 1) < 1e-6 else 0.85) for b_, du, m in ev]
    b = s.notes_line(ev, I.sawbass, "bass", "bass", legato=0.65, dec=0.06, sus=0.5, rel=0.02)
    s.send("bg", d.sat(circ_lp(s, b, 1300), 2.0), 0.45, name="EBM 16th bass")
    st = stab_part(s, pr, [0.75, 1.5, 2.75, 3.5], 0.25, 64, 3)
    s.notes += [("stabs", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.pad, a=0.004, rel=0.06)
    s.send("bg", circ_hp(s, circ_lp(s, o, 3000), 300), 0.25, pan=-0.25, rev=0.2, name="saw stabs")
    kk = I.kick("hard")
    s.send("bg", s.hits_line(every(s, [0, 1, 2, 3]), lambda v: kk), 0.85, name="kick")
    sn, cp, mt = I.snare(200, 0.18, 1.0, 2.0), I.clap(), I.metal(880, 0.3, 0.05)
    s.send("bg", s.hits_line(every(s, [1, 3], bars_on=range(15)) + every(s, [1], bars_on=[15]), lambda v: sn), 0.4, rev=0.2, name="snare")
    s.send("bg", s.hits_line(every(s, [1, 3]), lambda v: cp), 0.4, rev=0.2, name="clap")
    s.send("bg", s.hits_line(every(s, [1, 3]), lambda v: mt), 0.15, pan=0.3, name="metal layer")
    hh = I.hat(False, 0.03)
    s.send("bg", s.hits_line(every(s, [k * 0.25 for k in range(16)], 0.7), lambda v: hh), 0.3, pan=0.25, name="16th hats")
    oh = I.hat(True, 0.06)
    s.send("bg", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], bars_on=range(8, 16)), lambda v: oh), 0.25, pan=-0.2, name="open hats B")
    roll = [(60 + 2 + k * 0.25, 0.4 + 0.6 * k / 7) for k in range(8)]
    s.send("bg", s.hits_line(roll, lambda v: sn), 0.35, name="fill")
    cr = I.crash(1.4)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.2, rev=0.2, name="crash")

    sp = [I.steam(0.22, 3000, a=0.004, tau=0.06) for _ in range(2)]
    s.send("amb", s.hits_line(every(s, [3.5]) + [(h[0], h[1], 1) for h in every(s, [1.5], bars_on=range(8, 16))],
                              lambda v: sp[v]), 0.35, pan=0.4, name="spray psst")
    s.send("amb", mask_breaths(s, 8.0, bars_on=range(8)) + mask_breaths(s, 4.0, bars_on=range(8, 16)), 2.0,
           name="breathing (faster in B)")
    n = s.ns(16)
    t = np.linspace(0, 1, n)
    f = 700 * (1800 / 700) ** t * (1 + 0.006 * np.sin(2 * np.pi * 7 * t * s.sec(16)))
    gauge = (d.sine(f, n) * t ** 1.5 + d.bp(d.noise(n), 1500, 4000, 1) * t * 0.4) * np.clip((1 - t) * 30, 0, 1)
    s.send("amb", s.hits_line([(48, 1.0)], lambda v: gauge), 0.06, pan=-0.3, rev=0.3, name="pressure gauge")
    vent = I.steam(1.6, 1800, a=0.003, tau=0.5)
    s.send("amb", s.hits_line([(0, 1.0), (32, 0.7)], lambda v: vent), 0.4, rev=0.3, name="vent")
    s.send("amb", s.noise(30, 160, -1.0), 0.35, name="compressor rumble")
    return s, dict(name="Ciśnienie rośnie", key="B minor, B section C minor", meter="4/4",
                   desc="B minor -> C minor (B section a semitone up), 144 BPM EBM: bit-crushed saw stabs, 16th saw bass, spray bursts, pressure gauge")


TRACKS = {"a": eksterminator_a, "b": eksterminator_b, "c": eksterminator_c}
