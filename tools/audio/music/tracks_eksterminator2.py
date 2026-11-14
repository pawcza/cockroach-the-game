"""Eksterminator, round two (d/e/f): industrial, relentless, distorted, mechanical. Every take builds from an A
section into a harder B (he gets angrier as his health drops)."""
from engine import Song, bars, d, root
import instruments as I
import heavy as H
from common import prog, bass_part, every, circ_lp, np
from tracks_eksterminator import mask_breaths


def fuzz(s, ev, part, drive, tone, gain, name, stem="fg", cents=8, rev=0.25, dly=0.2, fn=None, **kw):
    x2 = H.double(s, ev, fn or H.fatlead, part, "lead", cents=cents, proc=lambda v: H.amp(s, v, drive, 150, tone), **kw)
    s.send(stem, x2, gain, rev=rev, dly=dly, name=name)


# ---------------------------------------------------------------- D: industrial metal, D minor, 150 BPM
def eksterminator_d():
    s = Song("eksterminator-d", 150, 16)
    s.section(0, "D", "harm")
    pr = prog(s, "Dm", "Dm", "Bb", "A", "Dm", "Dm", "Gm", "A", "Bb", "C", "Dm", "Dm", "Bb", "Gm", "A", "A")
    s.fx["fg"].update(rt60=1.3, rev=0.7, dly_beats=0.75, fb=0.3, dly_lp=3000)
    s.fx["bg"].update(rt60=0.8, rev=0.4)
    s.fx["amb"].update(rt60=1.0, rev=0.6, damp=5000)
    lead = bars(s,
                "A5/2 F5/1 D5/1", "E5/1.5 F5/.5 E5/1 C#5/1", "D5/2 F5/1 Bb5/1", "A5/3 C#6/1",
                "D6/2 C6/1 A5/1", "Bb5/1.5 A5/.5 F5/1 D5/1", "G5/1.5 Bb5/.5 D6/1 Bb5/1", "C#6/2 E6/1 A5/1",
                "F6/2 D6/1 Bb5/1", "E6/2 C6/1 G5/1", "F6/1.5 E6/.5 D6/1 A5/1", "D6/.5 E6/.5 F6/.5 G6/.5 A6/2",
                "F6/2 D6/1 Bb5/1", "G6/1.5 F6/.5 D6/1 Bb5/1", "E6/1 C#6/1 A5/1 E5/1", "A5/2 r/2")
    fuzz(s, lead, "lead", 5.5, 2800, 0.5, "screaming fuzz lead", legato=0.96, slide=-1.5, stau=0.05, vib=0.008)
    ctr = bars(s, *(["r/4"] * 8), "D5/4", "E5/4", "F5/4", "F5/4", "D5/4", "D5/4", "C#5/4", "C#5/4")
    fuzz(s, ctr, "counter", 3.5, 2600, 0.28, "harmony line (B)", cents=11, legato=1.0, a=0.05)

    # gallop palm-mutes on the chord root: x.xx x.xx x.xx x.x.
    gal = [o + k for k in range(4) for o in ((0, 0.5, 0.75) if k < 3 else (0, 0.5))]
    rf = bass_part(s, pr, [(o, 0.22, 0) for o in gal])
    r2 = H.double(s, rf, H.chug, None, None, cents=6, haas_ms=9, proc=lambda v: H.amp(s, v, 6.0, 80, 2600), legato=0.9)
    s.send("bg", r2, 0.8, name="gallop chugs")
    b = s.notes_line(rf, H.reese, "bass", "bass", legato=0.85, det=0.004)
    s.send("bg", np.tanh(circ_lp(s, b, 700) * 1.6) * 0.7 + s.notes_line(rf, H.subsine, legato=0.85) * 0.4, 0.7,
           name="bass + sub")

    kk, sn = H.big_kick(0.08, 190, 50, 3.4), H.clank_snare()
    kA = every(s, [0, 0.75, 2, 2.5], 1.0, bars_on=range(8))
    kB = every(s, [k * 0.25 for k in range(16)], 0.75, bars_on=range(8, 16))
    kicks = s.hits_line(kA + kB, lambda v: kk)
    snares = s.hits_line(every(s, [1, 3], bars_on=range(15)), lambda v: sn)
    s.send("bg", H.drum_bus(s, kicks + snares * 0.6, 2.5), 0.6, name="kick (double-kick in B) + clank snare")
    rd = I.metal(3200, 0.5, 0.15)
    s.send("bg", s.hits_line(every(s, [0, 1, 2, 3], 0.8, bars_on=range(8, 16)), lambda v: rd), 0.12, pan=0.35, name="ride bell (B)")
    hh = I.hat(False, 0.03)
    s.send("bg", s.hits_line(every(s, [k * 0.5 for k in range(8)], 0.8, bars_on=range(8)), lambda v: hh), 0.25, pan=-0.3, name="hats (A)")
    cr = I.crash(1.8)
    s.send("bg", s.stereo(s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr)), 0.22, rev=0.3, name="crash")
    H.build(s, 28, 4, I.snare(220, 0.14, 1.0, 1.8), 0.45)
    H.build(s, 62, 2, I.snare(220, 0.14, 1.0, 1.8), 0.45, riser=False)

    s.send("amb", mask_breaths(s, 4.0, bars_on=range(8)) + mask_breaths(s, 2.0, bars_on=range(8, 16)), 2.2,
           name="breathing (panting in B)")
    sp = I.steam(0.3, 2500, a=0.004, tau=0.09)
    s.send("amb", s.hits_line(every(s, [3.5]), lambda v: sp), 0.35, pan=0.4, rev=0.2, name="spray")
    s.send("amb", I.hum(s, 73.42 / 2) * 0.6 + s.noise(30, 150, -1.0) * 0.5, 0.25, name="tank compressor")
    return s, dict(name="Opryskiwacz", key="D minor (harmonic)", meter="4/4",
                   desc="D minor, 150 BPM industrial metal: screaming double-tracked fuzz lead, amp-driven gallop chugs, double-kick B section, panting mask")


# ---------------------------------------------------------------- E: pressure-pump grind, C# minor, 90 BPM
def eksterminator_e():
    s = Song("eksterminator-e", 90, 12)
    s.section(0, "C#", "harm")
    pr = prog(s, "C#m", "C#m", "A", "G#", "F#m", "A", "C#m", "G#", "A", "B", "C#m", "G#")
    s.fx["fg"].update(rt60=1.8, rev=0.8, dly_beats=0.75, fb=0.35, dly_lp=2800)
    s.fx["bg"].update(rt60=1.2, rev=0.5)
    s.fx["amb"].update(rt60=1.5, rev=0.8, damp=4500)
    lead = bars(s,
                "G#4/1.5 C#5/.5 E5/1 D#5/1", "C#5/2 B4/1 G#4/1", "A4/1.5 C#5/.5 E5/1 F#5/1", "G#5/2 C5/1 D#5/1",
                "A5/1.5 G#5/.5 F#5/1 C#5/1", "E5/1.5 F#5/.5 G#5/1 A5/1", "G#5/1 E5/1 C#5/1 E5/1", "D#5/2 C5/1 G#4/1",
                "C#6/1.5 B5/.5 A5/1 E5/1", "D#6/1.5 C#6/.5 B5/1 F#5/1", "E6/1 D#6/.5 C#6/.5 G#5/1 E5/1", "C6/1 D#6/1 G#6/2")
    fuzz(s, lead, "lead", 4.5, 2000, 0.5, "metallic FM lead (driven)", fn=I.fmv, legato=0.95, ratio=1.41, idx=2.5,
         idx_end=1.2, rise=0.06, a=0.01, dec=0.3, sus=0.8, rel=0.15, vib=0.005)
    ctr = bars(s, *(["r/4"] * 8), "E5/4", "F#5/4", "G#5/4", "G#5/2 C5/2")
    fuzz(s, ctr, "counter", 3.0, 2400, 0.28, "counter (C)", cents=12, legato=1.0, a=0.1)

    # machine: 16th sequencer bass, distorted, on the chord root with octave pops
    pat = [(k * 0.25, 0.22, 12 if k in (3, 7, 10, 14) else 0) for k in range(16)]
    bass = bass_part(s, pr, pat)
    bass = [(b, du, m, 1.2 if abs(b % 1) < 1e-6 else 0.8) for b, du, m in bass]
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.8, idx=3.5, idx_end=1.2, itau=0.03, dec=0.08, sus=0.6, rel=0.02)
    s.send("bg", H.amp(s, circ_lp(s, b, 2000), 3.0, 40, 1600) * 0.8 + s.notes_line(bass, H.subsine, legato=0.8) * 0.4,
           1.0, name="machine 16th bass")
    pw = [(bt, dd, root(nm, 3), 1.0) for bt, dd, nm in pr if bt >= 16]
    s.notes += [("power", "chord", e[0], e[1], e[2]) for e in pw]
    p2 = H.double(s, pw, H.power, None, None, cents=10, haas_ms=15, proc=lambda v: H.amp(s, v, 5.0, 90, 2400), legato=1.0)
    s.send("bg", p2, 0.2, rev=0.3, name="power-chord drones (B, C)")

    kk, sn = H.big_kick(0.14, 160, 44, 3.4), H.clank_snare()
    kicks = every(s, [0, 1.75]) + every(s, [2.5, 3.25], 0.8, bars_on=range(8, 12))
    drums = s.hits_line(kicks, lambda v: kk) + s.hits_line(every(s, [2]), lambda v: sn) * 0.6
    s.send("bg", H.drum_bus(s, drums, 2.5), 0.65, name="half-time industrial kit")
    hs = I.steam(0.07, 4000, a=0.002, tau=0.02)
    tick = every(s, [k * 0.25 for k in range(16)], 0.6, bars_on=range(4, 12))
    tick = [(b_, 1.0 if abs(b_ % 1 - 0.5) < 1e-6 else 0.55) for b_, g_, v_ in tick]
    sx = s.hits_line(tick, lambda v: hs)
    s.send("bg", s.stereo(sx, np.roll(sx, I.n_(0.009))), 0.25, name="steam 16ths (B, C)")
    an = I.metal(980, 0.6, 0.12)
    s.send("bg", s.hits_line(every(s, [3.5], bars_on=range(1, 12, 2)), lambda v: an), 0.25, pan=-0.3, rev=0.4, name="anvil")
    cr = I.crash(2.2)
    s.send("bg", s.hits_line([(0, 1.0), (16, 0.8), (32, 1.0)], lambda v: cr), 0.22, rev=0.3, name="crash")
    H.build(s, 44, 4, I.snare(210, 0.14, 1.0, 1.8), 0.4)

    # amb: the pressure pump: a piston every 2 beats (thud + rising hiss + valve release), slow mask breathing
    th = H.big_kick(0.05, 90, 40, 1.5) * 0.5
    s.send("amb", s.hits_line(every(s, [0, 2]), lambda v: th), 0.3, name="piston thud")
    rise = s.noise(2500, 9000) * np.clip(((np.arange(s.N) / s.spb) % 2) / 2, 0, 1) ** 2
    s.send("amb", rise, 0.25, pan=0.35, name="pressure hiss")
    s.send("amb", mask_breaths(s, 8.0), 2.0, name="slow mask breathing")
    cr2 = I.creak(140, 1.2, 25, 45)
    s.send("amb", s.hits_line([(10, 1.0), (30, 1.0)], lambda v: cr2), 0.2, pan=-0.4, rev=0.5, name="tank creak")
    return s, dict(name="Pompa ciśnieniowa", key="C-sharp minor (harmonic)", meter="4/4",
                   desc="C-sharp minor, 90 BPM half-time grind: driven metallic FM lead, distorted 16th machine bass, power-chord drones, piston pump")


# ---------------------------------------------------------------- F: acid industrial techno, A minor, 125 BPM
def eksterminator_f():
    s = Song("eksterminator-f", 125, 16)
    s.section(0, "A", "harm")
    pr = prog(s, "Am", "Am", "F", "G", "Am", "Am", "Dm", "E", "F", "G", "Am", "Am", "F", "G", "E", "E")
    s.fx["fg"].update(rt60=1.6, rev=0.8, dly_beats=0.75, fb=0.4, dly_lp=3500)
    s.fx["bg"].update(rt60=0.9, rev=0.4, dly_beats=0.75, fb=0.3)
    s.fx["amb"].update(rt60=1.4, rev=0.7)
    lead = bars(s,
                "E5/3 C5/1", "D5/2 E5/2", "F5/3 A5/1", "G5/2 B5/1 D6/1",
                "A5/3 E5/1", "G5/2 E5/2", "F5/2 A5/1 D6/1", "G#5/3 B5/1",
                "C6/2 A5/1 F5/1", "D6/2 B5/1 G5/1", "E6/2 C6/1 A5/1", "A5/1 B5/1 C6/1 E6/1",
                "F6/2 C6/1 A5/1", "G6/2 D6/1 B5/1", "G#6/2 E6/1 B5/1", "E6/2 r/2")
    fuzz(s, lead, "lead", 5.0, 2700, 0.45, "siren fuzz lead", fn=H.hoover, legato=0.98, dly=0.3)

    stp = [0, 0, 12, 0, 7, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 12]
    acc = {0, 4, 10}
    ac = bass_part(s, pr, [(k * 0.25, 0.25, iv) for k, iv in enumerate(stp)])
    ac = [(b, du, m, 1.3 if int(round((b % 4) * 4)) in acc else 0.9) for b, du, m in ac]
    pump = s.pump(0.75, 0.2)
    x = s.notes_line(ac, H.acid, "acid", "bass", legato=0.85, c0=2400, c1=280, q=6.0)
    xB = s.notes_line(ac, H.acid, legato=0.85, c0=4800, c1=500, q=8.0)
    a_ = H.arc(s, [(0, 0.0), (24, 0.0), (32, 1.0), (63.5, 1.0)])
    s.send("bg", H.amp(s, (1 - a_) * x + a_ * xB, 3.0, 60, 4000) * pump, 0.7, pan=0.0, dly=0.15, name="acid line (opens at B)")
    sub = bass_part(s, pr, [(k * 0.5, 0.45, 0) for k in range(8)], octave=1)
    s.send("bg", s.notes_line(sub, H.subsine, legato=0.9) * pump, 0.6, name="sub")

    kk, sn, cp = H.big_kick(0.15, 175, 44, 3.6), H.clank_snare(), I.clap()
    kick = s.hits_line(every(s, [0, 1, 2, 3]), lambda v: kk)
    rum = s.circ(lambda v: d.lp(v, 120, 2), s.cconv(kick, s.ir(0.6, 900, 11))) * 2.0
    back = s.hits_line(every(s, [1, 3], bars_on=range(8, 16)), lambda v: sn) * 0.5
    back += s.hits_line(every(s, [1, 3], bars_on=range(8)), lambda v: cp) * 0.6
    s.send("bg", H.drum_bus(s, kick + back, 2.5), 0.7, name="kick + snare/clap")
    s.send("bg", rum * pump, 0.15, name="kick rumble")
    hh, oh = I.hat(False, 0.03), I.hat(True, 0.07)
    hx = s.hits_line(every(s, [k * 0.25 for k in range(16)], 0.6), lambda v: hh)
    s.send("bg", s.stereo(hx, np.roll(hx, I.n_(0.008))), 0.13, name="16th hats")
    s.send("bg", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], bars_on=range(4, 16)), lambda v: oh), 0.14, pan=0.3, name="open hats")
    mt = [I.metal(f, 0.25, 0.04) for f in (620, 930)]
    perc = every(s, [0.75, 2.25, 3.5], 1.0, bars_on=range(8, 16))
    s.send("bg", s.hits_line([(p[0], p[1], i % 2) for i, p in enumerate(perc)], lambda v: mt[v]), 0.18, pan=-0.35,
           rev=0.3, name="metal percussion (B)")
    cr = I.crash(2.0)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.2, rev=0.3, name="crash")
    H.build(s, 24, 8, I.snare(220, 0.14, 1.0, 1.8), 0.4)
    H.build(s, 60, 4, None, 0.0)

    sp = I.steam(0.18, 3000, a=0.003, tau=0.05)
    s.send("amb", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], 0.8, bars_on=range(8, 16)), lambda v: sp), 0.3, pan=0.4,
           name="spray bursts (B)")
    s.send("amb", mask_breaths(s, 8.0, bars_on=range(8)) + mask_breaths(s, 4.0, bars_on=range(8, 16)), 2.0,
           name="breathing (faster in B)")
    s.send("amb", s.noise(3000, 10000) * s.pump(0.8, 0.3, every=2.0), 0.1, pan=-0.3, name="tank hiss")
    return s, dict(name="Dezynfekcja totalna", key="A minor (harmonic)", meter="4/4",
                   desc="A minor, 125 BPM acid industrial techno: siren fuzz lead, 303-style acid line that opens at B, rumbling distorted kick, metal percussion")


TRACKS = {"d": eksterminator_d, "e": eksterminator_e, "f": eksterminator_f}
