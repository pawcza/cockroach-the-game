"""Babcia Lodzia, round two (d/e/f): the accordion through an overdriven amp with a stomping kick. Still her
450 ms beat (133.33 BPM, or half of it), still mean and comic, but heavy and driving."""
from engine import Song, bars, d, root
import instruments as I
import heavy as H
from common import prog, bass_part, every, circ_lp, circ_bp, np
from tracks_lodzia import BPM, clock, boards


def amp_acc(s, ev, part, drive, tone, gain, name, cents=8, rev=0.25, dly=0.1, legato=0.85, **kw):
    """Double-tracked musette accordion, each take through its own overdriven amp."""
    x2 = H.double(s, ev, I.accordion, part, "lead", cents=cents, proc=lambda v: H.amp(s, v, drive, 180, tone),
                  legato=legato, **kw)
    s.send("fg", x2, gain, rev=rev, dly=dly, name=name)


def power_part(s, pr, offsets, du, octave=3, bars_on=None, drive=5.0, tone=2600, gain=0.25, name="power chords"):
    out = []
    for bt, dd, nm in pr:
        bar = int(bt // s.meter)
        if bars_on is not None and bar not in bars_on:
            continue
        for o in offsets:
            b = bar * s.meter + o
            if bt <= b < bt + dd - 1e-6:
                out.append((b, du, root(nm, octave), 1.0))
                s.notes.append(("power", "chord", b, du, root(nm, octave)))
    x2 = H.double(s, out, H.power, None, None, cents=10, haas_ms=14, proc=lambda v: H.amp(s, v, drive, 90, tone),
                  legato=0.9)
    s.send("bg", x2, gain, rev=0.2, name=name)


# ---------------------------------------------------------------- D: polka-punk, D minor
def lodzia_d():
    s = Song("lodzia-d", BPM, 16)
    s.section(0, "D", "harm")
    pr = prog(s, "Dm", "A7", "Dm", "A7", "Dm", "Gm", "A7", "Dm", "Bb", "F", "Gm", "Dm", "Bb", "Gm", "A7", "A7")
    s.fx["fg"].update(rt60=0.9, rev=0.6, dly_beats=0.5, fb=0.2)
    s.fx["bg"].update(rt60=0.8, rev=0.5)
    s.fx["amb"].update(rt60=1.0, rev=0.7, damp=4000)
    lead = bars(s,
                "D5/.5 E5/.5 F5/.5 D5/.5 A5/1 A4/1",
                "G5/.5 F5/.5 E5/.5 C#5/.5 E5/1 A4/1",
                "D5/.5 E5/.5 F5/.5 D5/.5 A5/1 F5/1",
                "G5/.5 E5/.5 C#5/.5 E5/.5 A4/2",
                "F5/.5 E5/.5 D5/.5 F5/.5 A5/.5 G5/.5 F5/1",
                "G5/.5 F5/.5 E5/.5 D5/.5 Bb5/1 G5/1",
                "A5/.5 G5/.5 E5/.5 C#5/.5 G5/.5 E5/.5 C#5/1",
                "D5/1 A4/1 D5/1 r/1",
                "D6/1 C6/.5 Bb5/.5 F5/1 D6/1",
                "C6/1 A5/.5 F5/.5 C5/1 A5/1",
                "Bb5/.5 A5/.5 G5/.5 D5/.5 G5/1 Bb5/1",
                "A5/1.5 F5/.5 D5/1 F5/1",
                "F6/.5 D6/.5 Bb5/.5 F5/.5 D6/1 Bb5/1",
                "G5/.5 A5/.5 Bb5/.5 G5/.5 D6/1 Bb5/1",
                "C#6/.5 E6/.5 C#6/.5 A5/.5 G5/.5 E5/.5 C#5/1",
                "E5/.5 C#5/.5 A4/.5 C#5/.5 E5/1 r/1")
    amp_acc(s, lead, "lead", 4.0, 2800, 0.5, "overdriven accordion")
    ctr = bars(s, *(["r/4"] * 8), "Bb3/2 D4/2", "C4/2 A3/2", "D4/2 Bb3/2", "A3/2 F3/2", "Bb3/2 D4/2", "G3/2 Bb3/2",
               "A3/2 C#4/2", "E4/2 G4/2")
    c2 = H.double(s, ctr, H.fatlead, "counter", "lead", cents=7, proc=lambda v: H.amp(s, v, 3.0, 100, 2200), legato=0.98)
    s.send("fg", c2, 0.3, rev=0.3, name="low fuzz counter (B)")

    st = H.stomp()
    kick = s.hits_line(every(s, [0, 1, 2, 3]), lambda v: st)
    sn = H.big_snare(230, 0.12)
    pah = s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], 0.8), lambda v: sn)
    s.send("bg", H.drum_bus(s, kick + pah * 0.45), 0.7, name="stomp oom + snare pah")
    hh = I.hat(False, 0.03)
    hats = s.hits_line(every(s, [k * 0.25 for k in range(16)], 0.7, bars_on=range(8, 16)), lambda v: hh)
    s.send("bg", s.stereo(hats, np.roll(hats, I.n_(0.008))), 0.14, name="16th hats (B)")
    cr = I.crash(1.6)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.22, pan=0.2, rev=0.3, name="crash")
    H.build(s, 28, 4, I.snare(240, 0.12, 0.9, 1.5), 0.4, riser=False)
    H.build(s, 62, 2, I.snare(240, 0.12, 0.9, 1.5), 0.4, riser=False)

    bass = bass_part(s, pr, [(0, 1, 0), (1, 1, 7), (2, 1, 0), (3, 1, 7)])
    b = s.notes_line(bass, H.reese, "bass", "bass", legato=0.6, det=0.005)
    sb = s.notes_line(bass, H.subsine, legato=0.6)
    s.send("bg", H.amp(s, circ_lp(s, b, 900), 2.2, 40, 1200) * 0.8 + sb * 0.4, 1.0, name="driven tuba-bass + sub")
    power_part(s, pr, [0.5, 1.5, 2.5, 3.5], 0.3, bars_on=range(16), gain=0.2, name="power-chord left hand")

    clock(s, 1.0, 0.45)
    s.send("amb", s.hits_line([(24, 1.0)], lambda v: I.whistle(s.sec(8), 1850)), 0.12, pan=0.4, rev=0.4,
           name="kettle screams into B")
    lids = [I.metal(f, 0.7, 0.2) for f in (590, 790)]
    s.send("amb", s.hits_line(every(s, [3], 1.0, bars_on=[9, 11, 13, 15]), lambda v: lids[0]), 0.12, pan=-0.35,
           rev=0.5, name="pot lid bangs (B)")
    boards(s, 5, 0.15)
    s.send("amb", I.simmer(s), 0.2, pan=0.3, name="stove")
    return s, dict(name="Babcia na przesterze", key="D minor (harmonic)", meter="4/4 (polka-punk)",
                   desc="D minor, 133.3 BPM polka-punk: double-tracked accordion through a driven amp, stomp on every beat, snare on every 'pah', fuzz counter in B")


# ---------------------------------------------------------------- E: heavy oberek, C minor, 3/4
def lodzia_e():
    s = Song("lodzia-e", BPM, 24, meter=3)
    s.section(0, "C", "harm")
    pr = prog(s, "Cm", "Cm", "G", "G", "Cm", "Cm", "G", "Cm",
              "Ab", "Eb", "Fm", "G", "Ab", "Eb", "Fm", "G",
              "Cm", "Fm", "G", "Cm", "Ab", "Fm", "G", "G")
    s.fx["fg"].update(rt60=1.1, rev=0.7, dly_beats=1.0, fb=0.2)
    s.fx["bg"].update(rt60=0.9, rev=0.5)
    s.fx["amb"].update(rt60=1.0, rev=0.6, damp=3500)
    lead = bars(s,
                "G4/1 C5/1 Eb5/1", "D5/1.5 C5/.5 G4/1", "B4/1 D5/1 F5/1", "Eb5/1.5 D5/.5 B4/1",
                "C5/.5 D5/.5 Eb5/1 G5/1", "F5/.5 Eb5/.5 D5/1 C5/1", "B4/.5 C5/.5 D5/1 B4/1", "C5/2 r/1",
                "Eb5/.5 F5/.5 Ab5/.5 C6/.5 Ab5/1", "G5/.5 F5/.5 Eb5/.5 G5/.5 Bb5/1", "Ab5/.5 G5/.5 F5/.5 C5/.5 F5/1",
                "B5/1 G5/1 D5/1", "C6/.5 Bb5/.5 Ab5/.5 Eb5/.5 C6/1", "Bb5/.5 G5/.5 Eb5/.5 G5/.5 Bb5/1",
                "Ab5/.5 C6/.5 F6/.5 C6/.5 Ab5/1", "G5/.5 B5/.5 D6/.5 F6/.5 D6/1",
                "C6/1 Eb6/1 C6/1", "F6/1.5 Eb6/.5 C6/1", "D6/1 B5/1 G5/1", "Eb6/1.5 D6/.5 C6/1",
                "C6/.5 D6/.5 Eb6/1 C6/1", "Ab5/.5 C6/.5 F6/1 C6/1", "B5/.5 C6/.5 D6/.5 F6/.5 Eb6/.5 D6/.5",
                "B5/1 G5/1 D5/1")
    # oberek: the weight lands on beat 3
    lead = [(b, du, m, 1.25 if abs(b % 3 - 2) < 1e-6 else 1.0) for b, du, m, v in lead]
    x2 = H.double(s, lead, H.fatlead, "lead", "lead", cents=8, proc=lambda v: H.amp(s, v, 4.5, 200, 2700),
                  legato=0.92, vib=0.009, vrate=6.0, slide=-0.8, stau=0.02)
    s.send("fg", x2, 0.5, rev=0.25, dly=0.08, name="distorted fiddle")
    acc = s.notes_line([(b, du, m - 12, v * 0.8) for b, du, m, v in lead], I.accordion, legato=0.85)
    s.send("fg", circ_bp(s, acc, 200, 4000), 0.3, pan=-0.15, rev=0.2, name="accordion 8vb")
    ctr = bars(s, *(["r/3"] * 8), "C5/3", "Bb4/3", "C5/3", "B4/3", "C5/3", "Bb4/3", "Ab4/3", "B4/3",
               "Eb5/3", "F5/3", "D5/3", "Eb5/3", "Eb5/3", "F5/3", "D5/3", "D5/3")
    c2 = H.double(s, ctr, I.accordion, "counter", "lead", cents=12, haas_ms=17,
                  proc=lambda v: H.amp(s, v, 2.0, 200, 2800), legato=1.0, a=0.05)
    s.send("fg", c2, 0.28, rev=0.4, name="sustained accordion counter (B, C)")

    st, sn = H.stomp(), H.big_snare(210, 0.2)
    kick = s.hits_line(every(s, [0]) + every(s, [1.5], 0.6, bars_on=range(16, 24)), lambda v: st)
    three = s.hits_line(every(s, [2]), lambda v: sn)
    tb = I.tamb()
    s.send("bg", H.drum_bus(s, kick + three * 0.55), 0.75, name="stomp on 1, snare on 3")
    s.send("bg", s.hits_line(every(s, [1, 2.5]), lambda v: tb), 0.35, pan=-0.3, name="tambourine")
    hh = I.hat(False, 0.03)
    s.send("bg", s.hits_line(every(s, [0.5, 1, 1.5, 2, 2.5], 0.7, bars_on=range(8, 24)), lambda v: hh), 0.22, pan=0.3,
           name="hats (B, C)")
    cr = I.crash(1.8)
    s.send("bg", s.hits_line([(0, 1.0), (24, 1.0), (48, 1.0)], lambda v: cr), 0.22, rev=0.3, name="crash")
    H.build(s, 45, 3, I.snare(240, 0.12, 0.9, 1.5), 0.4)
    H.build(s, 70, 2, I.snare(240, 0.12, 0.9, 1.5), 0.4, riser=False)

    bass = bass_part(s, pr, [(0, 1.5, 0), (2, 1, 7)])
    b = s.notes_line(bass, H.reese, "bass", "bass", legato=0.8, det=0.005)
    s.send("bg", H.amp(s, circ_lp(s, b, 800), 2.0, 40, 1100) * 0.8 + s.notes_line(bass, H.subsine, legato=0.8) * 0.4,
           1.0, name="driven bass + sub")
    power_part(s, pr, [1, 2], 0.45, bars_on=range(8, 24), gain=0.2, name="power chords on 2-3 (B, C)")

    s.send("amb", I.radio(s), 0.25, pan=0.5, rev=0.3, name="radio")
    clock(s, 1.0, 0.5)
    boards(s, 5, 0.15)
    sh = I.shuffle()
    s.send("amb", s.hits_line(every(s, [0, 1.5], bars_on=range(1, 24, 4)), lambda v: sh), 0.3, pan=-0.2, name="slippers")
    return s, dict(name="Oberek z kopytem", key="C minor (harmonic)", meter="3/4",
                   desc="C minor, 133.3 BPM 3/4 heavy oberek: amp-driven fiddle saw + accordion 8vb, stomp on 1 / snare on 3, power chords, A-B-C arc")


# ---------------------------------------------------------------- F: doom waltz, B minor, half time
def lodzia_f():
    s = Song("lodzia-f", BPM / 2, 12, meter=3)    # 66.67 BPM: the hats tick her 450 ms beat as eighths
    s.section(0, "B", "harm")
    pr = prog(s, "Bm", "G", "Em", "F#", "Bm", "G", "Em", "F#", "G", "D", "Em", "F#")
    s.fx["fg"].update(rt60=2.0, rev=0.8, dly_beats=1.0, fb=0.3, dly_lp=2500)
    s.fx["bg"].update(rt60=1.6, rev=0.6)
    s.fx["amb"].update(rt60=1.4, rev=0.7, damp=3000)
    lead = bars(s,
                "F#4/1.5 B4/.5 D5/1", "D5/1.5 C#5/.5 B4/1", "G4/1 B4/1 E5/1", "C#5/2 A#4/1",
                "F#5/1.5 E5/.5 D5/1", "B4/1.5 D5/.5 G5/1", "G5/1.5 F#5/.5 E5/1", "F#5/2 C#5/1",
                "B5/1.5 A5/.5 G5/1", "A5/1.5 F#5/.5 D5/1", "G5/1 E5/1 B4/1", "A#4/1 C#5/1 F#5/1")
    x2 = H.double(s, lead, I.accordion, "lead", "lead", cents=9, proc=lambda v: H.amp(s, v, 6.0, 150, 2800),
                  legato=0.97, vib=0.006)
    s.send("fg", x2, 0.5, rev=0.3, dly=0.15, name="fuzz accordion")
    ctr = bars(s, *(["r/3"] * 4), "B4/3", "G4/3", "B4/3", "A#4/3", "D5/3", "A4/3", "E4/3", "F#4/3")
    c2 = H.double(s, ctr, H.fatlead, "counter", "lead", cents=6, proc=lambda v: H.amp(s, v, 4.0, 120, 2000),
                  legato=1.0, slide=-1.0, stau=0.08)
    s.send("fg", c2, 0.28, rev=0.4, name="bending fuzz counter")

    kk, sn = H.big_kick(0.16, 140, 42, 3.4), H.big_snare(170, 0.3)
    drums = s.hits_line(every(s, [0]) + every(s, [2.5], 0.6, bars_on=range(4, 12)), lambda v: kk)
    drums += s.hits_line(every(s, [1]), lambda v: sn) * 0.5 + s.hits_line(every(s, [2], 0.6), lambda v: sn) * 0.3
    s.send("bg", H.drum_bus(s, drums), 0.9, name="doom waltz kit")
    hh = I.hat(False, 0.04)
    s.send("bg", s.hits_line(every(s, [0, 0.5, 1, 1.5, 2, 2.5], 0.8), lambda v: hh), 0.25, pan=0.3,
           name="hats on her 450 ms beat")
    toms = [I.tom(f, 0.6) for f in (120, 95, 75, 60)]
    s.send("bg", s.hits_line([(21 + k * 0.5, 0.8 + 0.05 * k, k % 4) for k in range(6)] +
                             [(33 + k * 0.5, 0.8 + 0.05 * k, k % 4) for k in range(6)], lambda v: toms[v]), 0.45,
           rev=0.3, name="tom builds")
    cr = I.crash(2.5)
    s.send("bg", s.hits_line([(0, 1.0), (24, 1.0)], lambda v: cr), 0.22, rev=0.4, name="crash")

    bass = bass_part(s, pr, [(0, 1.8, 0), (2, 0.9, 0)])
    main = [e for e in bass if abs(e[0] % 3) < 1e-6]
    sag = [e for e in bass if abs(e[0] % 3 - 2) < 1e-6]
    b = s.notes_line(main, I.sawbass, "bass", "bass", legato=0.95, sus=0.85)
    b += s.notes_line(sag, I.sawbass, "bass", "bass", legato=1.0, drop=3.0)
    s.send("bg", d.sat(circ_lp(s, b, 650), 2.5), 0.6, name="sagging sludge bass")
    power_part(s, pr, [0], 2.6, bars_on=range(12), drive=6.0, tone=2400, gain=0.2, name="ringing power chords")

    clock(s, 1.0, 0.6)
    s.send("amb", I.hum(s, 50.0) * 0.5 + s.noise(1500, 7000) * 0.2, 0.15, pan=0.4, name="radio hum + static")
    s.send("amb", I.simmer(s), 0.2, pan=-0.3, name="kettle on low")
    boards(s, 6, 0.2)
    sh = I.shuffle(0.6)
    s.send("amb", s.hits_line(every(s, [1.5], bars_on=range(1, 12, 2)), lambda v: sh), 0.3, pan=-0.2, rev=0.3, name="slippers")
    return s, dict(name="Walc z wałkiem", key="B minor (harmonic)", meter="3/4",
                   desc="B minor, 66.7 BPM doom waltz (hats on her 450 ms beat): fuzz accordion, bending fuzz counter, sagging sludge bass, ringing power chords")


TRACKS = {"d": lodzia_d, "e": lodzia_e, "f": lodzia_f}
