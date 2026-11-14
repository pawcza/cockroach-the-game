"""Babcia Lodzia: three takes on her 450 ms beat (133.33 BPM, or half of it). Mean, bustling, comic; the lightest
of the four fights. The ambient layer is her flat: wall clock on the beat, kettle, radio, floorboards."""
from engine import Song, bars, d, voicing
import instruments as I
from common import prog, bass_part, stab_part, every, circ_lp, circ_hp, circ_bp, np

BPM = 400 / 3   # one beat = 450 ms, the beat her curlers land on (lodziaPatterns.ts CURLER_* beat: 450)


def clock(s, every_beats=1.0, gain=1.0, pan=-0.4):
    tk, tc = I.tick(2400), I.tick(1700, 0.006)
    hits, k, t = [], 0, 0.0
    while t < s.beats - 1e-9:
        hits.append((t, 1.0, k % 2))
        k += 1
        t += every_beats
    s.send("amb", s.hits_line(hits, lambda v: tk if v == 0 else tc), gain, pan=pan, rev=0.2, name="wall clock")


def boards(s, n, gain=0.5):
    r = s.rng
    hits = [(float(r.uniform(0, s.beats - 2)), r.uniform(0.5, 1.0), i) for i in range(n)]
    sigs = [I.floorboard(r) for _ in range(n)]
    s.send("amb", s.hits_line(hits, lambda v: sigs[v]), gain, pan=0.3, rev=0.4, name="floorboards")


# ---------------------------------------------------------------- A: spiteful kitchen polka
def lodzia_a():
    s = Song("lodzia-a", BPM, 16)
    s.section(0, "E", "harm")
    pr = prog(s, "Em", "B7", "Em", "B7", "Em", "Am", "B7", "Em", "G", "D7", "Am", "Em", "C", "Am", "B7", "B7")
    s.fx["fg"].update(rt60=0.7, rev=0.6, dly_beats=0.5, fb=0.15)
    s.fx["bg"].update(rt60=0.6, rev=0.5)
    s.fx["amb"].update(rt60=0.9, rev=0.8, damp=4000)
    lead = bars(s,
                "E5/.5 F#5/.5 G5/.5 E5/.5 B5/1 B4/1",
                "A5/.5 G5/.5 F#5/.5 D#5/.5 F#5/1 B4/1",
                "E5/.5 F#5/.5 G5/.5 E5/.5 B5/1 G5/1",
                "A5/.5 F#5/.5 D#5/.5 F#5/.5 B4/2",
                "G5/.5 F#5/.5 E5/.5 G5/.5 B5/.5 A5/.5 G5/1",
                "A5/.5 G5/.5 F#5/.5 E5/.5 C6/1 A5/1",
                "B5/.5 A5/.5 F#5/.5 D#5/.5 A5/.5 F#5/.5 D#5/1",
                "E5/1 B4/1 E5/1 r/1",
                "D6/.5 B5/.5 G5/.5 B5/.5 D6/1 B5/1",
                "C6/.5 A5/.5 F#5/.5 A5/.5 D6/1 A5/1",
                "C6/.5 B5/.5 A5/.5 E5/.5 A5/1 C6/1",
                "B5/1.5 G5/.5 E5/1 G5/1",
                "E6/.5 D6/.5 C6/.5 G5/.5 E5/1 G5/1",
                "A5/.5 B5/.5 C6/.5 A5/.5 E5/1 A5/1",
                "D#6/.5 C6/.5 B5/.5 A5/.5 F#5/.5 A5/.5 B5/1",
                "F#5/.5 D#5/.5 B4/.5 D#5/.5 F#5/1 r/1")
    # polka is short and bouncy: staccato accordion, accents on the off-beat eighths she stomps on
    lead = [(b, du, m, 1.15 if abs(b * 2 % 2 - 1) < 1e-6 else 1.0) for b, du, m, v in lead]
    x = s.notes_line(lead, I.accordion, "lead", "lead", legato=0.7, vib=0.0)
    s.send("fg", circ_bp(s, x, 220, 6000), 0.6, rev=0.2, dly=0.08, name="staccato accordion")
    # comic grace notes: a squeaky pulse a semitone-slide into every bar's first note in the B section
    gr = [(b, 0.5, m + 12, 0.5) for b, du, m, v in lead if b >= 32 and abs(b % 4) < 1e-6]
    g = s.notes_line(gr, I.pulse, "squeak", "lead", legato=0.6, duty=0.125, slide=-1.0, stau=0.04, dec=0.1, sus=0.3)
    s.send("fg", circ_lp(s, g, 7000), 0.25, pan=0.3, rev=0.3, name="squeak")

    bass = bass_part(s, pr, [(0, 1, 0), (1, 1, 7), (2, 1, 0), (3, 1, 7)])
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.5, rise=0.03, idx=1.8, idx_end=0.6, a=0.01, dec=0.1,
                     sus=0.7, rel=0.05)
    s.send("bg", circ_lp(s, b, 1600), 0.5, name="tuba oom")
    st = stab_part(s, pr, [0.5, 1.5, 2.5, 3.5], 0.3, 64, 3)
    s.notes += [("pah", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.accordion, a=0.004, rel=0.03)
    s.send("bg", circ_bp(s, o, 250, 3500), 0.2, pan=-0.25, rev=0.2, name="left-hand chords")
    k = I.sy.kick(0.2, 130, 60, 1.6, 0.2, 0.05)
    s.send("bg", s.hits_line(every(s, [0, 2]), lambda v: k), 0.6, name="kick")
    sn = I.snare(240, 0.12, 0.7, 1.3)
    s.send("bg", s.hits_line(every(s, [1, 3]), lambda v: sn), 0.35, rev=0.2, name="snare")
    hh = I.hat(False, 0.03)
    s.send("bg", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], 1.0), lambda v: hh), 0.3, pan=0.3, name="hat")
    wb = I.rim()
    roll = [(60 + 2 + k * 0.25, 0.6 + 0.4 * k / 7) for k in range(8)]
    s.send("bg", s.hits_line(roll + [(28 + 3.5, 1.0), (28 + 3.75, 1.0)], lambda v: wb), 0.4, pan=0.2, name="woodblock fills")

    # amb: her kitchen: clock on every other beat, kettle simmering then whistling in the B section, boards, slippers
    clock(s, 2.0, 0.5)
    s.send("amb", I.simmer(s), 0.25, pan=0.35, name="kettle simmer")
    s.send("amb", s.hits_line([(36, 1.0)], lambda v: I.whistle(s.sec(6), 1950)), 0.08, pan=0.4, rev=0.4, name="kettle whistle")
    boards(s, 5, 0.15)
    sh = I.shuffle()
    s.send("amb", s.hits_line(every(s, [0, 1], bars_on=[3, 7, 11, 15]), lambda v: sh), 0.25, pan=-0.2, name="slippers")
    return s, dict(name="Złośliwa polka z kuchni", key="E minor (harmonic)", meter="4/4 (2/4 polka feel)",
                   desc="E minor, 133.3 BPM (450 ms beat): staccato musette accordion, tuba oom-pah, kitchen clock, kettle, floorboards")


# ---------------------------------------------------------------- B: sour oberek (3/4)
def lodzia_b():
    s = Song("lodzia-b", BPM, 24, meter=3)
    s.section(0, "A", "harm")
    pr = prog(s, "Am", "Am", "E", "E", "Am", "Am", "E", "Am",
              "C", "G", "Am", "E", "F", "C", "Dm", "E",
              "Am", "Am", "E", "E", "F", "Dm", "E", "Am")
    s.fx["fg"].update(rt60=0.9, rev=0.6, dly_beats=1.0, fb=0.15)
    s.fx["bg"].update(rt60=0.7, rev=0.5)
    s.fx["amb"].update(rt60=0.8, rev=0.6, damp=3500)
    lead = bars(s,
                "A4/.5 B4/.5 C5/.5 E5/.5 A5/1",
                "G#5/.5 A5/.5 B5/.5 A5/.5 E5/1",
                "B5/.5 G#5/.5 E5/.5 G#5/.5 B5/1",
                "D6/.5 C6/.5 B5/.5 A5/.5 G#5/1",
                "A5/.5 E5/.5 C5/.5 E5/.5 A5/1",
                "C6/.5 B5/.5 A5/.5 G#5/.5 A5/1",
                "B5/.5 C6/.5 D6/.5 B5/.5 G#5/1",
                "A5/1.5 E5/.5 A4/1",
                "E5/.5 G5/.5 C6/.5 G5/.5 E5/1",
                "D5/.5 G5/.5 B5/.5 G5/.5 D5/1",
                "C5/.5 E5/.5 A5/.5 E5/.5 C6/1",
                "B5/1 G#5/1 E5/1",
                "F5/.5 A5/.5 C6/.5 A5/.5 F5/1",
                "E5/.5 G5/.5 C6/.5 G5/.5 E5/1",
                "D5/.5 F5/.5 A5/.5 F5/.5 D6/1",
                "B5/.5 G#5/.5 E5/.5 G#5/.5 B5/1",
                "E5/.5 A5/.5 C6/.5 B5/.5 A5/1",
                "G#5/.5 A5/.5 B5/.5 C6/.5 E6/1",
                "D6/.5 B5/.5 G#5/.5 B5/.5 E6/1",
                "D6/.5 C6/.5 B5/.5 A5/.5 G#5/1",
                "A5/.5 C6/.5 F6/.5 C6/.5 A5/1",
                "F5/.5 A5/.5 D6/.5 A5/.5 F5/1",
                "E5/.5 G#5/.5 B5/.5 D6/.5 C6/.5 B5/.5",
                "A5/1 E5/1 A4/1")
    # oberek: the kick of the bar lands late, on beat 2 or 3, never where you expect it
    lead = [(b, du, m, 1.3 if abs(b % 3 - 2) < 1e-6 else 1.0) for b, du, m, v in lead]
    x = s.notes_line(lead, I.pulse, "lead", "lead", legato=0.92, duty=0.5, dec=0.08, sus=0.75, rel=0.05,
                     vib=0.009, vrate=6.3, slide=-0.7, stau=0.018)
    x = circ_bp(s, x, 500, 4200)
    x = d.formant(x, [1100, 2600], [3, 4], [1, 0.6]) * 0.5 + x
    s.send("fg", x, 0.55, pan=-0.05, rev=0.25, dly=0.06, name="village fiddle")
    # B section answer: a second, lower fiddle drone on the chord root, the band's "basy" player
    dr = [(b, du, root_m, 0.8) for b, du, root_m in
          [(e[0], e[1], voicing(e[2], 57, 1)[0]) for e in pr if 24 <= e[0] < 48]]
    dd = s.notes_line(dr, I.pulse, "drone", "lead", legato=0.98, duty=0.33, a=0.06, sus=0.9, rel=0.1, vib=0.004)
    s.send("fg", circ_lp(s, dd, 2500), 0.18, pan=0.3, rev=0.3, name="drone fiddle")

    bass = bass_part(s, pr, [(0, 1, 0)])
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.7, rise=0.02, idx=1.4, idx_end=0.5, a=0.008, dec=0.12,
                     sus=0.6, sub=0.3)
    s.send("bg", circ_lp(s, b, 1500), 0.55, name="bass on 1")
    st = stab_part(s, pr, [1, 2], 0.45, 62, 3)
    st = [(b_, du, m, 1.25 if abs(b_ % 3 - 2) < 1e-6 else 0.8) for b_, du, m, v in st]
    s.notes += [("chords", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.organ, drawbars=(0.3, 0.0, 1.0, 0.8, 0.3, 0.5, 0.0, 0.2))
    s.send("bg", circ_hp(s, o, 200), 0.22, pan=0.2, rev=0.2, name="harmonium chords")
    k = I.sy.kick(0.22, 120, 55, 1.5, 0.15, 0.06)
    s.send("bg", s.hits_line(every(s, [0]), lambda v: k), 0.6, name="bass drum")
    cym = I.hat(True, 0.05)
    sn = I.snare(260, 0.1, 0.6, 1.2)
    s.send("bg", s.hits_line(every(s, [2]), lambda v: sn), 0.35, rev=0.15, name="snare on 3")
    s.send("bg", s.hits_line(every(s, [2]) + [(23 * 3 + 1, 0.7)], lambda v: cym), 0.25, pan=0.25, name="drum cymbal")
    tb = I.tamb()
    s.send("bg", s.hits_line(every(s, [1, 1.5, 2.5]), lambda v: tb), 0.35, pan=-0.3, name="tambourine")

    # amb: radio on in the other room, clock ticking each beat, a pot lid now and then, boards
    s.send("amb", I.radio(s), 0.3, pan=0.5, rev=0.3, name="radio")
    s.send("amb", I.hum(s, 50.0), 0.05, name="mains hum")
    clock(s, 1.0, 0.7)
    lids = [I.metal(f, 0.7, 0.2) for f in (610, 820)]
    s.send("amb", s.hits_line([(13.0, 0.8, 0), (40.5, 1.0, 1), (58.0, 0.6, 0)], lambda v: lids[v]), 0.15, pan=-0.3,
           rev=0.5, name="pot lids")
    boards(s, 4, 0.15)
    return s, dict(name="Oberek na złość", key="A minor (harmonic)", meter="3/4",
                   desc="A minor, 133.3 BPM 3/4 oberek (beat-3 accents): scooping village fiddle, bass on 1, harmonium on 2-3, radio + clock")


# ---------------------------------------------------------------- C: creeping tango (half time)
def lodzia_c():
    s = Song("lodzia-c", BPM / 2, 8)   # 66.67 BPM: her 450 ms beat is the eighth note
    s.section(0, "F", "harm")
    pr = prog(s, "Fm", "Fm", "C7", "Fm", "Bbm", "Fm", "Db", "C7")
    s.fx["fg"].update(rt60=1.1, rev=0.7, dly_beats=0.75, fb=0.25)
    s.fx["bg"].update(rt60=0.8, rev=0.5)
    s.fx["amb"].update(rt60=1.0, rev=0.7, damp=3500)
    lead = bars(s,
                "F5/.75 E5/.25 F5/.5 Ab5/.5 C6/1 Ab5/1",
                "G5/.75 F5/.25 E5/.5 F5/.5 C5/2",
                "Bb5/.75 Ab5/.25 G5/.5 E5/.5 C5/1 E5/1",
                "F5/.5 G5/.5 Ab5/.5 Bb5/.5 C6/2",
                "Db6/.75 C6/.25 Bb5/.5 F5/.5 Db5/1 F5/1",
                "C6/.75 Bb5/.25 Ab5/.5 F5/.5 C5/2",
                "Ab5/.75 F5/.25 Db5/.5 F5/.5 Ab5/1 Bb5/1",
                "G5/.75 E5/.25 C5/.5 E5/.5 G5/.5 Bb5/.5 E5/1")
    x = s.notes_line(lead, I.fmv, "lead", "lead", legato=0.9, ratio=2.0, idx=1.6, idx_end=1.1, rise=0.08, a=0.03,
                     dec=0.2, sus=0.8, rel=0.1, vib=0.006)
    x = x * (1 + 0.18 * np.sin(2 * np.pi * np.arange(s.N) * round(5.5 * s.N / I.SR) / s.N))   # bellows tremolo
    s.send("fg", circ_lp(s, x, 4500), 0.55, rev=0.3, dly=0.15, name="bandoneon reed")
    # pizzicato answers in the long notes (bars 2, 4, 6) - the sly little laugh
    pz = bars(s, "r/4", "r/3 C6/.25 Ab5/.25 F5/.25 C5/.25", "r/4",
              "r/3 G5/.25 Ab5/.25 Bb5/.25 C6/.25", "r/4", "r/3 F6/.25 C6/.25 Ab5/.25 F5/.25", "r/4", "r/4")
    p = s.notes_line(pz, I.pluck, "pizz", "lead", duty=0.25, tau=0.06)
    s.send("fg", circ_lp(s, p, 5000), 0.3, pan=0.35, rev=0.35, name="pizzicato")

    # habanera bass: dotted eighth, sixteenth, two eighths (twice a bar)
    hab = [(0, 0.75, 0), (0.75, 0.25, 7), (1, 0.5, 12), (1.5, 0.5, 7)]
    bass = bass_part(s, pr, hab + [(o + 2, du, iv) for o, du, iv in hab])
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.75, idx=2.2, idx_end=0.4, itau=0.06, dec=0.18, sus=0.3,
                     rel=0.05, sub=0.3)
    s.send("bg", circ_lp(s, b, 1800), 0.55, name="habanera bass")
    st = stab_part(s, pr, [0, 1, 2, 3], 0.2, 60, 3)
    st = [(b_, du, m, 1.2 if abs(b_ % 4) < 1e-6 else 0.85) for b_, du, m, v in st]
    s.notes += [("marcato", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.accordion, a=0.003, rel=0.04)
    s.send("bg", circ_bp(s, o, 200, 3000), 0.2, pan=-0.2, rev=0.25, name="marcato chords")
    cl = I.rim()
    s.send("bg", s.hits_line(every(s, [0, 0.75, 1.5, 2, 2.75, 3.5], 1.0), lambda v: cl), 0.8, pan=0.3, name="claves")
    k = I.sy.kick(0.25, 110, 50, 1.4, 0.1, 0.07)
    s.send("bg", s.hits_line(every(s, [0, 2]), lambda v: k), 0.55, name="soft kick")
    br = I.shaker()
    s.send("bg", s.hits_line(every(s, [1, 3], 1.0), lambda v: I.snare(200, 0.25, 1.0, 1.0)), 0.18, rev=0.3, name="brush")
    s.send("bg", s.hits_line(every(s, [k_ * 0.5 for k_ in range(8)], 0.6), lambda v: br), 1.0, pan=-0.3, name="shaker")

    # amb: night in the flat: the clock tocks each beat (0.9 s, a real clock), fridge hum, boards under her slippers
    clock(s, 1.0, 0.4)
    s.send("amb", I.hum(s, 98.0, (1.0, 0.3, 0.5, 0.1)) * (0.7 + 0.3 * s.lfo(1)), 0.05, pan=0.4, name="fridge hum")
    boards(s, 6, 0.15)
    sh = I.shuffle(0.45)
    s.send("amb", s.hits_line(every(s, [0.5, 1.5], bars_on=[1, 3, 5, 7]), lambda v: sh), 0.3, pan=-0.3, rev=0.2,
           name="slippers")
    s.send("amb", s.noise(100, 6000, -1.2), 0.12, name="room air")
    return s, dict(name="Tango spod kapcia", key="F minor (harmonic)", meter="4/4",
                   desc="F minor, 66.7 BPM (her 450 ms beat = the eighth): tremolo FM bandoneon, habanera bass, marcato chords, night flat")


TRACKS = {"a": lodzia_a, "b": lodzia_b, "c": lodzia_c}
