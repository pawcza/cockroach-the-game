"""DJ Bigos, round two (d/e/f): club bangers. Exactly 120 BPM, 16 bars = 32.000 s, kick on every beat, downbeat at
sample 0. Huge kick, sidechained bass, a driven hook, layered harmony, a build at bar 7-8 into a drop at bar 9."""
from engine import Song, bars, d
import instruments as I
import heavy as H
from common import prog, bass_part, stab_part, held_chords, arp_part, every, circ_lp, np

DROP = range(8, 16)


def club(s, snare="clap", kick_f0=170, open_from=8):
    """Four on the floor through a drum bus; claps on 2 and 4; build at bars 7-8; fill into the loop point."""
    kk = H.big_kick(0.12, kick_f0, 46, 3.2)
    kick = s.hits_line(every(s, [0, 1, 2, 3]), lambda v: kk)
    bk = H.big_snare(200)
    cp = I.clap()
    back = s.hits_line(every(s, [1, 3], bars_on=range(15)) + every(s, [1], bars_on=[15]),
                       lambda v: bk if snare == "snare" else (bk * 0.5 + np.pad(cp, (0, len(bk)))[:len(bk)] * 1.2))
    ch, oh = I.hat(False, 0.03), I.hat(True, 0.07)
    hats = s.hits_line(every(s, [k * 0.25 for k in range(16)], 0.5) + every(s, [k + 0.5 for k in range(4)], 0.9), lambda v: ch)
    opens = s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], bars_on=range(open_from, 16)), lambda v: oh)
    bus = H.drum_bus(s, kick * 1.0 + back * 0.55)
    s.send("bg", bus, 0.8, name="kick+backbeat bus")
    s.send("bg", s.stereo(hats * 0.8, np.roll(hats, I.n_(0.007))), 0.14, name="hats")
    s.send("bg", opens, 0.18, pan=0.3, rev=0.15, name="open hats (drop)")
    cr = I.crash(2.0)
    s.send("bg", s.stereo(*[s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr)] * 2), 0.22, rev=0.3, name="crash")
    sn = I.snare(220, 0.14, 1.0, 1.6)
    H.build(s, 24, 8, sn, 0.4)
    H.build(s, 62, 2, sn, 0.4, riser=False)
    return kick


def lead_wide(s, ev, fn, drive, tone, gain, name, role="lead", part="lead", rev=0.25, dly=0.25, **kw):
    x2 = H.double(s, ev, fn, part, role, proc=lambda v: H.amp(s, v, drive, 150, tone), **kw)
    s.send("fg", x2, gain, rev=rev, dly=dly, name=name)


# ---------------------------------------------------------------- D: F minor banger
def bigos_d():
    s = Song("bigos-d", 120, 16)
    s.section(0, "F", "harm")
    pr = prog(s, "Fm", "Db", "Ab", "Eb", "Fm", "Db", "Eb", "C", "Db", "Eb", "Fm", "Fm", "Db", "Eb", "C", "C")
    s.fx["fg"].update(rt60=1.4, rev=0.8, dly_beats=0.75, fb=0.35)
    s.fx["bg"].update(rt60=1.0, rev=0.5, dly_beats=0.75, fb=0.3)
    s.fx["amb"].update(rt60=2.0, rev=1.0)
    hook = bars(s,
                "C5/1.5 Ab4/.5 F4/.5 Ab4/.5 C5/1",
                "Db5/1.5 C5/.5 Ab4/1 F4/1",
                "Eb5/1.5 C5/.5 Ab4/.5 C5/.5 Eb5/1",
                "G5/2 F5/1 Eb5/1",
                "C5/1.5 Ab4/.5 F4/.5 Ab4/.5 C5/1",
                "Db5/1.5 F5/.5 Ab5/1 F5/1",
                "G5/1.5 F5/.5 Eb5/1 Bb4/1",
                "E5/2 G5/1 C6/1",
                "F5/.5 F5/.5 Ab5/.5 F5/.5 Db6/1 C6/1",
                "G5/.5 G5/.5 Bb5/.5 G5/.5 Eb6/1 Db6/1",
                "C6/1.5 Ab5/.5 F5/1 Ab5/1",
                "G5/.5 Ab5/.5 G5/.5 F5/.5 C5/2",
                "F5/.5 F5/.5 Ab5/.5 F5/.5 Db6/1 C6/1",
                "G5/.5 G5/.5 Bb5/.5 G5/.5 Eb6/1 Db6/1",
                "E6/1.5 C6/.5 G5/1 Bb5/1",
                "C6/2 r/2")
    lead_wide(s, hook, H.fatlead, 4.5, 2900, 0.5, "driven saw hook", legato=0.92)
    ctr = bars(s, *(["r/4"] * 8), "Ab4/4", "Bb4/4", "C5/4", "C5/2 Bb4/2", "Ab4/4", "G4/4", "G4/4", "E4/4")
    c2 = H.double(s, ctr, I.supersaw, "counter", "lead", cents=12, haas_ms=15, legato=1.0, a=0.15, rel=0.3)
    s.send("fg", H.spread(np.stack([circ_lp(s, c, 2400) for c in c2]), 1.0), 0.35, rev=0.5, name="counter-melody (drop)")

    kick = club(s)
    bass = bass_part(s, pr, [(k * 0.5, 0.5, 0) for k in range(8)])
    b = s.notes_line(bass, H.reese, "bass", "bass", legato=0.9)
    pump = s.pump(0.85, 0.2)
    bA, bB = circ_lp(s, b, 380), circ_lp(s, b, 950)
    a_ = H.arc(s, [(0, 0.0), (24, 0.0), (32, 1.0), (63.5, 1.0)])
    s.send("bg", np.tanh(((1 - a_) * bA + a_ * bB) * 1.8) * pump, 0.7, name="sidechained reese")
    st = stab_part(s, pr, [0.5, 1.5, 2.5, 3.5], 0.35, 65, 3, bars_on=DROP)
    s.notes += [("stabs", "chord", e[0], e[1], e[2]) for e in st]
    sx = H.double(s, st, I.supersaw, None, None, cents=14, haas_ms=9, a=0.003, dec=0.15, sus=0.5, rel=0.08, vib=0.0)
    s.send("bg", np.stack([circ_lp(s, c, 4500) for c in sx]) * pump, 0.25, rev=0.3, name="supersaw stabs (drop)")
    pd = held_chords(pr, 60, 3)
    s.notes += [("pad", "chord", e[0], e[1], e[2]) for e in pd]
    px = H.double(s, pd, I.pad, None, None, cents=10, haas_ms=20, a=0.3)
    s.send("bg", np.stack([circ_lp(s, c, 1800) for c in px]) * pump * H.arc(s, [(0, 1.0), (32, 0.6)]), 0.22, rev=0.4,
           name="pumped pad")

    s.send("amb", I.crowd(s, 12) * H.arc(s, [(0, 0.5), (30, 0.6), (33, 1.0), (40, 0.6)]), 0.45, rev=0.5, name="crowd (cheer at drop)")
    s.send("amb", s.noise(40, 600, -1.0) * s.pump(0.5, 0.25), 0.4, name="club sub-room")
    gl = I.sy.whoosh(s.sec(2), 6000, 300, 0.1, 1.2, "white")
    s.send("amb", s.hits_line([(32, 1.0), (0, 0.7)], lambda v: gl), 0.35, pan=-0.3, rev=0.5, name="downlifters")
    return s, dict(name="Bigos na bombie", key="F minor (harmonic)", meter="4/4",
                   desc="F minor, 120 BPM club banger: amp-driven double-tracked saw hook, sidechained reese that opens at the drop, supersaw stabs, counter-line")


# ---------------------------------------------------------------- E: filter house, B-flat major
def bigos_e():
    s = Song("bigos-e", 120, 16)
    s.section(0, "Bb", "major")
    pr = prog(s, "Gm", "Eb", "Bb", "F", "Gm", "Eb", "Bb", "F", "Eb", "F", "Gm", "Gm", "Eb", "F", "Bb", "F")
    s.fx["fg"].update(rt60=1.2, rev=0.7, dly_beats=0.75, fb=0.4)
    s.fx["bg"].update(rt60=0.9, rev=0.5)
    s.fx["amb"].update(rt60=1.8, rev=1.0)
    hook = bars(s,
                "D5/.75 D5/.75 Bb4/.5 G4/1 Bb4/1",
                "Eb5/.75 Eb5/.75 D5/.5 Bb4/2",
                "F5/.75 F5/.75 D5/.5 Bb4/1 D5/1",
                "C5/3 r/1",
                "D5/.75 D5/.75 Bb4/.5 G4/1 Bb4/1",
                "Eb5/.75 G5/.75 F5/.5 Eb5/2",
                "F5/.75 Bb5/.75 A5/.5 F5/1 D5/1",
                "C5/1 F5/1 A5/2",
                "G5/1.5 F5/.5 Eb5/1 G5/1",
                "A5/1.5 G5/.5 F5/1 C5/1",
                "Bb5/1.5 A5/.5 G5/1 D5/1",
                "G5/.5 A5/.5 Bb5/.5 C6/.5 D6/2",
                "Eb6/1.5 D6/.5 Bb5/1 G5/1",
                "C6/1.5 Bb5/.5 A5/1 F5/1",
                "D6/1.5 C6/.5 Bb5/1 F5/1",
                "A5/1 C6/1 r/2")
    lead_wide(s, hook, H.talk, 2.5, 3000, 0.5, "talkbox lead", legato=0.9, dly=0.3)
    ctr = bars(s, *(["r/4"] * 8), "Bb4/4", "C5/4", "D5/4", "D5/4", "G4/4", "A4/4", "F4/4", "A4/4")
    c2 = H.double(s, ctr, I.pad, "strings", "lead", cents=10, haas_ms=18, a=0.2)
    s.send("fg", np.stack([circ_lp(s, c, 3000) for c in c2]), 0.3, rev=0.5, name="string counter (drop)")

    club(s, open_from=0)
    pump = s.pump(0.8, 0.22)
    bass = bass_part(s, pr, [(k + 0.5, 0.45, 0 if k % 2 == 0 else 12) for k in range(4)])
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.9, idx=2.2, idx_end=0.6, itau=0.06, dec=0.12, sus=0.6)
    sb = s.notes_line(bass, H.subsine, legato=0.9)
    s.send("bg", (np.tanh(circ_lp(s, b, 1500) * 1.5) * 0.7 + sb * 0.8) * pump, 0.55, name="offbeat house bass + sub")
    st = stab_part(s, pr, [0, 0.75, 1.5, 2.5, 3.25], 0.3, 65, 3)
    s.notes += [("piano", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.organ, drawbars=(0.4, 0.2, 1.0, 0.9, 0.6, 0.5, 0.3, 0.3))
    # the filter opens across bars 1-8 (filter house), stays open in the drop, closes over the last bar
    ver = [circ_lp(s, o, f) for f in (500, 1400, 5000)]
    a_ = H.arc(s, [(0, 0.0), (28, 2.0), (32, 2.0), (62, 2.0), (63.9, 0.0)])
    w = [np.clip(1 - np.abs(a_ - i), 0, 1) for i in range(3)]
    oo = sum(v * k for v, k in zip(ver, w)) * pump
    s.send("bg", s.stereo(oo, np.roll(oo, I.n_(0.013))), 0.28, rev=0.3, name="filtered piano stabs")
    sh = I.shaker()
    s.send("bg", s.hits_line(every(s, [k * 0.25 for k in range(16)], 1.0), lambda v: sh), 0.3, pan=-0.35, name="shaker")

    s.send("amb", I.crowd(s, 10), 0.4, rev=0.5, name="crowd")
    cr = s.circ(lambda v: d.hp(v, 1200, 1), I.sy.crackle(s.N / I.SR, 30, 1500, 1.0)[:s.N])
    s.send("amb", cr, 0.3, name="vinyl")
    s.send("amb", s.noise(60, 3000, -1.0) * H.arc(s, [(0, 0.4), (31.9, 1.0), (32, 0.4)]), 0.3, name="room swell into drop")
    return s, dict(name="Filtrowana kula disco", key="B-flat major", meter="4/4",
                   desc="B-flat major, 120 BPM filter house: wide talkbox lead, offbeat bass + sub (sidechained), piano stabs whose filter opens into the drop")


# ---------------------------------------------------------------- F: vixa / pompa, E minor
def bigos_f():
    s = Song("bigos-f", 120, 16)
    s.section(0, "E", "harm")
    pr = prog(s, "Em", "C", "G", "D", "Em", "C", "D", "B", "C", "D", "Em", "Em", "C", "D", "B", "B")
    s.fx["fg"].update(rt60=1.6, rev=0.9, dly_beats=0.75, fb=0.35)
    s.fx["bg"].update(rt60=1.0, rev=0.5, dly_beats=0.5, fb=0.3)
    s.fx["amb"].update(rt60=2.2, rev=1.0)
    hook = bars(s,
                "E5/1 G5/.5 B5/1 A5/.5 G5/1",
                "E5/1 G5/.5 C6/1 B5/.5 G5/1",
                "D5/1 G5/.5 B5/1 A5/.5 G5/1",
                "F#5/2 A5/1 D5/1",
                "E5/1 G5/.5 B5/1 A5/.5 G5/1",
                "E5/1 G5/.5 C6/1 D6/.5 E6/1",
                "F#6/1 E6/.5 D6/1 C6/.5 A5/1",
                "D#6/2 B5/1 F#5/1",
                "G5/.5 G5/.5 E5/.5 G5/.5 C6/1 B5/1",
                "A5/.5 A5/.5 F#5/.5 A5/.5 D6/1 C6/1",
                "B5/1.5 G5/.5 E5/1 G5/1",
                "B5/.5 C6/.5 B5/.5 A5/.5 G5/1 E5/1",
                "G5/.5 G5/.5 E5/.5 G5/.5 C6/1 B5/1",
                "A5/.5 A5/.5 F#5/.5 A5/.5 D6/1 C6/1",
                "D#6/1 F#6/1 B5/1 A5/1",
                "F#5/1 D#5/1 r/2")
    lead_wide(s, hook, H.hoover, 3.0, 2900, 0.5, "hoover lead", legato=0.95)
    ar = arp_part(s, pr, 0.25, 79, (0, 1, 2, 1, 2, 0, 2, 1), bars_on=DROP)
    s.notes += [("arp", "lead", e[0], e[1], e[2]) for e in ar]
    a2 = H.double(s, ar, I.pluck, None, None, cents=6, haas_ms=13, duty=0.25, tau=0.08)
    s.send("fg", np.stack([circ_lp(s, c, 5000) for c in a2]), 0.18, dly=0.3, name="pluck arp counter (drop)")

    club(s, snare="snare", kick_f0=200)
    pump = s.pump(0.9, 0.18)
    # pompa: the bass rolls on the three 16ths after every kick
    bass = bass_part(s, pr, [(k + o, 0.25, 0) for k in range(4) for o in (0.25, 0.5, 0.75)])
    b = s.notes_line(bass, H.reese, "bass", "bass", legato=0.85, det=0.006)
    s.send("bg", H.amp(s, circ_lp(s, b, 1200), 2.5, 40, 1400) * pump, 1.0, name="rolling pompa bass")
    sb = s.notes_line(bass, H.subsine, legato=0.85)
    s.send("bg", sb * pump, 0.55, name="sub")
    pd = held_chords(pr, 64, 3)
    s.notes += [("gate", "chord", e[0], e[1], e[2]) for e in pd]
    gate = np.array([1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0], float)
    gi = (np.arange(s.N) / (s.spb / 4)).astype(int) % 16
    gk = np.convolve(gate[gi], np.ones(I.n_(0.006)) / I.n_(0.006), "same")
    px = H.double(s, pd, I.supersaw, None, None, cents=12, haas_ms=10, a=0.01, sus=0.9, rel=0.1, vib=0.0)
    lvl = H.arc(s, [(0, 0.5), (24, 0.5), (31.9, 1.0), (32, 1.0)])
    s.send("bg", np.stack([circ_lp(s, c, 3500) for c in px]) * gk * lvl, 0.22, rev=0.3, name="trance-gated chords")

    s.send("amb", I.crowd(s, 14) * H.arc(s, [(0, 0.5), (31, 0.6), (33, 1.0), (44, 0.6)]), 0.45, rev=0.5, name="wedding crowd")
    claps = [I.crowd_clap(s.rng, 18) for _ in range(3)]
    cl = every(s, [1, 3], 1.0, bars_on=DROP)
    s.send("amb", s.hits_line([(h[0], h[1], i % 3) for i, h in enumerate(cl)], lambda v: claps[v]), 1.0, rev=0.6,
           name="crowd claps (drop)")
    s.send("amb", s.noise(80, 5000, -1.0), 0.15, name="hall air")
    return s, dict(name="Pompa na weselu", key="E minor (harmonic)", meter="4/4",
                   desc="E minor, 120 BPM vixa/pompa: diving hoover lead, rolling 16th 'pompa' bass + sub ducked by a hard kick, trance-gated chords")


TRACKS = {"d": bigos_d, "e": bigos_e, "f": bigos_f}
