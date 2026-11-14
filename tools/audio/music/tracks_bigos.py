"""DJ Bigos: three takes, all exactly 120 BPM, 16 bars of 4/4 = 32.000 s, kick on every beat, downbeat at sample 0."""
from engine import Song, bars, midi, d
import instruments as I
from common import (prog, bass_part, stab_part, held_chords, arp_part, diatonic, every, circ_lp, circ_hp, circ_bp,
                    chord_at, np)
from engine import voicing

ALL = list(range(16))


def club_drums(s, open_bars, clap_kind="clap", fill="snare", hat16=True):
    """Four on the floor: kick on every beat of every bar (Bigos's clock), backbeat on 2 and 4."""
    kick = I.kick("disco")
    s.send("bg", s.hits_line(every(s, [0, 1, 2, 3]), lambda v: kick), 1.0, name="kick")
    back = I.clap() if clap_kind == "clap" else I.snare(200, 0.2, 0.9, 1.5)
    bb = every(s, [1, 3], bars_on=range(15)) + every(s, [1], bars_on=[15])
    s.send("bg", s.hits_line(bb, lambda v: back), 1.0 if clap_kind == "clap" else 0.45, rev=0.25, name=clap_kind)
    oh = I.hat(True, 0.06)
    if len(open_bars):
        s.send("bg", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5], bars_on=open_bars), lambda v: oh), 0.28, pan=0.25, name="openhat")
    if hat16:
        ch = I.hat(False, 0.03)
        s.send("bg", s.hits_line(every(s, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75], 0.6), lambda v: ch), 0.45,
               pan=-0.3, name="hat16")
    cr = I.crash(1.8)
    s.send("bg", s.hits_line([(0, 1.0), (32, 1.0)], lambda v: cr), 0.22, pan=0.2, rev=0.2, name="crash")
    if fill == "snare":   # bar 16: 16th snare roll, crescendo, over the kick
        sn = I.snare(210, 0.16, 0.9, 1.4)
        roll = [(60 + 2 + k * 0.25, 0.25 + 0.75 * k / 7) for k in range(8)]
        s.send("bg", s.hits_line(roll, lambda v: sn), 0.3, rev=0.2, name="fill")
    elif fill == "toms":
        toms = [I.tom(f, 0.35) for f in (220, 175, 140, 110)]
        hits = [(60 + 2 + k * 0.5, 0.9, k // 2) for k in range(4)] + [(60 + 3 + k * 0.25, 1.0, 2 + k // 2) for k in range(4)]
        s.send("bg", s.hits_line(hits, lambda v: toms[v]), 0.3, rev=0.2, name="toms")


# ---------------------------------------------------------------- A: disco polo hit
def bigos_a():
    s = Song("bigos-a", 120, 16)
    s.section(0, "A", "harm")
    pr = prog(s, "Am", "F", "C", "G", "Am", "F", "G", "E", "Dm", "G", "C", "Am", "Dm", "E", "F", "E")
    s.fx["fg"].update(rt60=1.0, rev=0.8, dly_beats=0.75, fb=0.3)
    s.fx["bg"].update(rt60=0.8, rev=0.6)
    s.fx["amb"].update(rt60=1.8, rev=1.0)

    lead = bars(s,
                "E5/.5 E5/.5 A5/.5 E5/.5 C5/.5 E5/.5 A5/1",
                "G5/.5 F5/.5 E5/.5 D5/.5 C5/1 A4/1",
                "E5/.5 E5/.5 G5/.5 E5/.5 C5/.5 E5/.5 G5/1",
                "D5/.5 E5/.5 D5/.5 C5/.5 B4/2",
                "E5/.5 E5/.5 A5/.5 E5/.5 C5/.5 E5/.5 A5/1",
                "G5/.5 F5/.5 E5/.5 D5/.5 C5/1 A4/1",
                "B4/.5 D5/.5 G5/.5 D5/.5 B4/.5 D5/.5 F5/1",
                "E5/1.5 D5/.5 C5/.5 B4/.5 G#4/1",
                "A5/1.5 F5/.5 D5/1 F5/1",
                "G5/1.5 F5/.5 D5/1 B4/1",
                "C5/.5 E5/.5 G5/.5 C6/.5 B5/1 G5/1",
                "A5/2 E5/1 C5/1",
                "D5/.5 F5/.5 A5/.5 D6/.5 C6/1 A5/1",
                "B5/1.5 G#5/.5 E5/2",
                "A5/.5 G5/.5 F5/.5 E5/.5 F5/.5 G5/.5 A5/1",
                "G#5/1 B5/1 E5/.5 r/1.5")
    x = s.notes_line(lead, I.pulse, "lead", "lead", legato=0.88, duty=0.25, dec=0.12, sus=0.55, rel=0.06, vib=0.004)
    x = circ_lp(s, x, 6500)
    dbl = s.notes_line([(b, du, m - 12, v) for b, du, m, v in lead], I.tri, legato=0.88)
    s.send("fg", d.sat(x * 0.8, 1.3), 0.5, rev=0.22, dly=0.28, name="square lead")
    s.send("fg", dbl, 0.3, name="tri double")

    bass = bass_part(s, pr, [(k * 0.5, 0.5, 0 if k % 2 == 0 else 12) for k in range(8)])
    b = s.notes_line(bass, I.fmv, "bass", "bass", legato=0.8, idx=3.0, idx_end=0.8, itau=0.05, dec=0.1, sus=0.5, rel=0.04)
    s.send("bg", circ_lp(s, b, 2600), 0.55, name="octave fm bass")

    st = stab_part(s, pr, [0.5, 1.5, 2.5, 3.5], 0.3, 64, 3)
    s.notes += [("stabs", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.organ)
    s.send("bg", circ_hp(s, o, 250), 0.22, pan=0.2, rev=0.25, name="offbeat organ")
    pd = held_chords(pr, 60, 3, bars_on=range(8, 14))
    p = s.notes_line(pd, I.pad) * s.pump(0.6)
    s.send("bg", circ_lp(s, p, 2200), 0.16, pan=-0.2, rev=0.3, name="B pad")
    club_drums(s, open_bars=ALL)

    # amb: club with a vinyl DJ: room murmur, record crackle, risers into the drops, disco-ball sparkle
    s.send("amb", I.crowd(s, 9), 0.5, rev=0.4, name="crowd")
    cr = s.circ(lambda v: d.hp(v, 1200, 1), I.sy.crackle(s.N / I.SR, 40, 1500, 1.0)[:s.N])
    s.send("amb", np.pad(cr, (0, s.N - len(cr))), 0.35, pan=0.1, name="vinyl crackle")
    s.send("amb", s.noise(60, 4000, -0.8) * (1 + 0.0 * s.lfo(1)), 0.12, name="room hiss")
    ris = [(28, 1.0, 0), (56, 1.0, 1)]
    risers = [I.riser(s.sec(4), 400, 6000), I.riser(s.sec(8), 250, 7000)]
    s.send("amb", s.hits_line(ris, lambda v: risers[v]), 0.45, rev=0.5, name="risers")
    claps = [I.crowd_clap(s.rng) for _ in range(3)]
    cl = every(s, [1, 3], 1.0, bars_on=range(8, 14))
    s.send("amb", s.hits_line([(h[0], h[1], i % 3) for i, h in enumerate(cl)], lambda v: claps[v]), 1.2, rev=0.6,
           name="crowd claps")
    sp = []
    for bar in range(16):
        for k in range(2):
            t = bar * 4 + float(s.rng.integers(0, 8)) * 0.5
            v = voicing(chord_at(pr, t), 88, 3)
            m = v[int(s.rng.integers(3))]
            sp.append((t, 0.5, m, s.rng.uniform(0.4, 1.0)))
    s.notes += [("sparkle", "chord", e[0], e[1], e[2]) for e in sp]
    s.send("amb", s.notes_line(sp, I.bellv, tau=0.35), 0.18, pan=0.0, rev=0.9, name="sparkle")
    return s, dict(name="Weselny hit disco polo", key="A minor (harmonic)", meter="4/4",
                   desc="A minor, 120 BPM: 25% square hook with slapback, octave FM bass, offbeat organ, club crowd + vinyl")


# ---------------------------------------------------------------- B: italo night
def bigos_b():
    s = Song("bigos-b", 120, 16)
    s.section(0, "D", "harm")
    pr = prog(s, "Dm", "Bb", "C", "Am", "Dm", "Bb", "C", "A", "Gm", "Bb", "F", "C", "Gm", "Bb", "A", "A")
    s.fx["fg"].update(rt60=1.6, rev=1.0, dly_beats=0.75, fb=0.4)
    s.fx["bg"].update(rt60=1.2, rev=0.7, dly_beats=0.75, fb=0.45, dly_lp=5000)
    s.fx["amb"].update(rt60=2.2, rev=1.0)
    lead = bars(s,
                "A5/.75 A5/.75 G5/.5 F5/1 D5/1",
                "F5/.75 F5/.75 E5/.5 D5/1 Bb4/1",
                "C5/.5 E5/.5 G5/.75 G5/.75 A5/.5 G5/1",
                "E5/3 r/1",
                "A5/.75 A5/.75 G5/.5 F5/1 D5/1",
                "F5/.75 F5/.75 E5/.5 D5/1 Bb4/1",
                "C5/.5 E5/.5 G5/.75 C6/.75 Bb5/.5 G5/1",
                "C#6/1.5 A5/.5 E5/2",
                "Bb5/2 A5/1 G5/1",
                "F5/2 D5/1 F5/1",
                "A5/1.5 C6/.5 A5/1 F5/1",
                "G5/3 E5/1",
                "D6/1.5 C6/.5 Bb5/1 A5/1",
                "Bb5/1.5 A5/.5 F5/1 D5/1",
                "E5/1 A5/1 C#6/1 E6/1",
                "C#6/2 r/2")
    x = s.notes_line(lead, I.supersaw, "lead", "lead", legato=0.96, vib=0.005, rel=0.14)
    s.send("fg", circ_lp(s, x, 5200), 0.55, rev=0.35, dly=0.3, name="supersaw lead")

    bass = bass_part(s, pr, [(k, 0.5, 0) for k in range(4)] + [(k + 0.5, 0.25, 12) for k in range(4)]
                     + [(k + 0.75, 0.25, 12) for k in range(4)])
    b = s.notes_line(bass, I.sawbass, "bass", "bass", legato=0.85, dec=0.08, sus=0.45)
    s.send("bg", circ_lp(s, b, 1100), 0.5, name="gallop bass")
    ar = arp_part(s, pr, 0.25, 74, (0, 1, 2, 1))
    s.notes += [("arp", "chord", e[0], e[1], e[2]) for e in ar]
    a = s.notes_line(ar, I.pluck, duty=0.125, tau=0.07)
    s.send("bg", circ_lp(s, a, 4500), 0.14, pan=-0.35, dly=0.35, name="16th arp")
    pd = held_chords(pr, 62, 3)
    p = s.notes_line(pd, I.pad, a=0.15) * s.pump(0.65) * np.where(np.arange(s.N) >= s.at(32), 1.0, 0.45)
    s.send("bg", s.stereo(circ_lp(s, p, 2600), circ_lp(s, p, 2400)) * 0.9, 0.2, rev=0.35, name="string pad")
    club_drums(s, open_bars=range(8, 16), fill="toms", hat16=False)
    sh = I.shaker()
    s.send("bg", s.hits_line(every(s, [k * 0.25 for k in range(16)], 1.0), lambda v: sh), 0.5, pan=0.35, name="shaker")

    # amb: late-night club: dark room tone, whoosh sweeps every 4 bars, reverse cymbals into the drops, glints
    s.send("amb", s.noise(40, 700, -1.0) * (0.75 + 0.25 * s.lfo(4)), 0.5, name="room tone")
    whs = [I.sy.whoosh(s.sec(2), 300, 4000, 0.7, 1.4, "pink")]
    s.send("amb", s.hits_line([(b_, 1.0) for b_ in (14, 30, 46)], lambda v: whs[0]), 0.35, pan=-0.3, rev=0.5, name="whooshes")
    rc = I.rev_crash(s.sec(4))
    s.send("amb", s.hits_line([(28, 1.0), (60, 1.0)], lambda v: rc), 0.4, pan=0.3, rev=0.3, name="reverse cymbals")
    cw = I.crowd(s, 12) * np.clip(0.35 + 0.65 * np.exp(-((np.arange(s.N) - s.at(33)) / (s.spb * 3)) ** 2), 0, 1)
    s.send("amb", cw, 0.45, rev=0.5, name="crowd cheer at B")
    gl = []
    for bar in range(16):
        for k in range(3):
            t = bar * 4 + float(s.rng.integers(0, 16)) * 0.25
            v = voicing(chord_at(pr, t), 93, 3)
            gl.append((t, 0.25, v[int(s.rng.integers(3))], s.rng.uniform(0.3, 1.0)))
    s.notes += [("glints", "chord", e[0], e[1], e[2]) for e in gl]
    g = s.notes_line(gl, I.bellv, tau=0.25, bright=1.4)
    s.send("amb", s.stereo(g * 0.8, np.roll(g, I.n_(0.011))), 0.16, rev=1.0, name="glints")
    return s, dict(name="Italo kula o północy", key="D minor (harmonic)", meter="4/4",
                   desc="D minor, 120 BPM: detuned supersaw lead, galloping Italo bass, 16th pluck arp, pumped strings, night club room")


# ---------------------------------------------------------------- C: wedding-hall polka-disco
def bigos_c():
    s = Song("bigos-c", 120, 16)
    s.section(0, "G", "major")
    pr = prog(s, "G", "D", "Em", "C", "G", "D", "C D", "G", "C", "G", "Am", "D", "C", "G", "Am D", "D")
    s.fx["fg"].update(rt60=0.9, rev=0.7, dly_beats=0.5, fb=0.2)
    s.fx["bg"].update(rt60=0.7, rev=0.5)
    s.fx["amb"].update(rt60=1.4, rev=0.9)
    lead = bars(s,
                "B4/.5 D5/.5 G5/.5 D5/.5 B4/.5 D5/.5 G5/.5 A5/.5",
                "F#5/.5 E5/.5 D5/.5 A4/.5 D5/1 F#5/1",
                "G5/.5 F#5/.5 E5/.5 B4/.5 E5/.5 G5/.5 B5/1",
                "A5/.5 G5/.5 E5/.5 C5/.5 E5/1 r/1",
                "B4/.5 D5/.5 G5/.5 D5/.5 B4/.5 D5/.5 G5/.5 A5/.5",
                "F#5/.5 E5/.5 D5/.5 A4/.5 D5/1 F#5/1",
                "E5/.5 G5/.5 C6/1 D6/.5 C6/.5 A5/1",
                "G5/1.5 B5/.5 G5/1 r/1",
                "E6/1.5 D6/.5 C6/1 G5/1",
                "D6/1.5 C6/.5 B5/1 G5/1",
                "C6/.5 B5/.5 A5/.5 G5/.5 A5/1 E5/1",
                "F#5/1 A5/1 D6/2",
                "E6/.5 E6/.5 D6/.5 C6/.5 G5/1 E5/1",
                "D6/.5 D6/.5 C6/.5 B5/.5 G5/1 D5/1",
                "C5/.5 E5/.5 A5/1 D5/.5 F#5/.5 A5/1",
                "D6/1 C6/.5 B5/.5 A5/1 r/1")
    x = s.notes_line(lead, I.accordion, "lead", "lead", legato=0.9, vib=0.003)
    # B section: the accordion plays in thirds, the way the wedding band does
    thirds = [(b, du, diatonic(m, -2, 7, "major"), v) for b, du, m, v in lead if b >= 32]
    h = s.notes_line(thirds, I.accordion, "thirds", "lead", legato=0.9, vib=0.003)
    s.send("fg", circ_bp(s, x, 200, 6500), 0.6, pan=0.05, rev=0.2, dly=0.1, name="accordion")
    s.send("fg", circ_bp(s, h, 200, 6000), 0.4, pan=-0.2, rev=0.2, name="accordion thirds")

    # oom-pah over the four-on-the-floor: root on 1 and 3, fifth on 2 and 4, walk-ups into bars 9 and 1
    ev = bass_part(s, pr, [(0, 1, 0), (1, 1, 7), (2, 1, 0), (3, 1, 7)])
    for bar, walk in ((7, ("G2", "A2", "B2")), (15, ("D2", "E2", "F#2"))):
        ev = [e for e in ev if not (bar * 4 + 1 <= e[0] < bar * 4 + 4)]
        ev += [(bar * 4 + 1 + k, 1, midi(n)) for k, n in enumerate(walk)]
    ev.sort()
    b = s.notes_line(ev, I.fmv, "bass", "bass", legato=0.6, idx=1.6, idx_end=0.5, itau=0.06, dec=0.15, sus=0.5, sub=0.4)
    s.send("bg", circ_lp(s, b, 2000), 0.55, name="oom-pah bass")
    st = stab_part(s, pr, [0.5, 1.5, 2.5, 3.5], 0.25, 67, 3)
    s.notes += [("pah", "chord", e[0], e[1], e[2]) for e in st]
    o = s.notes_line(st, I.pulse, duty=0.5, dec=0.06, sus=0.2, rel=0.03)
    s.send("bg", circ_lp(s, o, 3500), 0.13, pan=0.3, rev=0.15, name="pah stabs")
    club_drums(s, open_bars=[], clap_kind="snare", fill="snare")
    tb = I.tamb()
    s.send("bg", s.hits_line(every(s, [0.5, 1.5, 2.5, 3.5]), lambda v: tb), 0.6, pan=-0.35, name="tambourine")
    sn = I.snare(220, 0.12, 0.9, 1.4)
    s.send("bg", s.hits_line([(31.5, 0.6), (31.75, 0.8)], lambda v: sn), 0.45, name="bar-8 pickup")

    # amb: the wedding hall: a full room talking, glasses clinking, everybody clapping along on 2 and 4
    s.send("amb", I.crowd(s, 16), 0.55, rev=0.5, name="hall crowd")
    claps = [I.crowd_clap(s.rng, 20) for _ in range(3)]
    cl = every(s, [1, 3], 0.7, bars_on=range(0, 8)) + every(s, [1, 3], 1.0, bars_on=range(12, 16))
    s.send("amb", s.hits_line([(h[0], h[1], i % 3) for i, h in enumerate(cl)], lambda v: claps[v]), 1.4, rev=0.5,
           name="clap-along")
    gls = [I.glass(s.rng) for _ in range(4)]
    t, hits = 0.3, []
    while t < 63:
        hits.append((t, s.rng.uniform(0.4, 1.0), int(s.rng.integers(4))))
        t += s.rng.uniform(1.5, 4.0)
    s.send("amb", s.hits_line(hits, lambda v: gls[v]), 0.12, pan=0.2, rev=0.7, name="glasses")
    s.send("amb", s.noise(80, 3000, -1.0), 0.1, name="hall air")
    return s, dict(name="Remiza do białego rana", key="G major", meter="4/4",
                   desc="G major, 120 BPM: musette accordion lead (thirds in B), oom-pah bass over 4-on-floor, wedding hall clap-along")


TRACKS = {"a": bigos_a, "b": bigos_b, "c": bigos_c}
