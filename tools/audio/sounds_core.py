"""Gameplay, pickups, combo and UI sounds. Registered into lib.registry; rebuilt by build.py."""
import numpy as np
from lib import dsp as d
from lib import synth as s
from lib.dsp import SR, n_, expdec, noise
from lib.registry import group, snd

K = "kenney-"
J = "oga-512-retro/The Essential Retro Video Game Sound Effects Collection [512 sounds] By Juhani Junkala/"


def notes(seq_, step, voice, gain=1.0, length=None):
    """seq_: list of midi notes; voice(freq, idx) -> array; one note every `step` seconds."""
    layers = [(voice(float(s.mtof(m)), i), i * step, gain) for i, m in enumerate(seq_)]
    return d.mix(*layers, length=length)


def lofi(x, hold=2, bits=None, verb=None, drive=None):
    if drive:
        x = d.sat(x, drive)
    if hold > 1 or bits:
        x = d.crush(x, hold, bits)
    if verb:
        x = d.reverb(x, verb[0], verb[1])
    return x


# =========================================================================== GAMEPLAY
G = "Gameplay"
group("jump", G, "Hop to the top lane (every jump)", [("audio/jump.ogg", "current")])
group("hop-land", G, "Hop landing, back on the floor (new, no sound today)")
group("floor-switch", G, "Drop to the bottom lane", [("audio/floor-switch.ogg", "current")])
group("dash", G, "Dash starts", [("audio/dash.ogg", "current")])
group("dash-ready", G, "Dash recharged", [("audio/dash-ready.ogg", "current")])
group("death", G, "Roach dies", [("audio/death.ogg", "current")])
group("hiss", G, "Roach hiss: moult, death, vents", [("audio/cockroach-hiss.ogg", "current")])
group("roach-noise", G, "Roach ambient skitter (loops, every 20-35 s)", [("audio/cockroach-noise.ogg", "current")])
group("cricket", G, "Pause screen cricket (loops)", [("audio/cricket.ogg", "current")])
group("huh", G, "Bird overlook corner appears (\"huh?\")", [("audio/huh.ogg", "current")])
group("heartbeat", G, "Death replay heartbeat (loops; the old death sound ran at half speed)", [("audio/death.ogg", "current, rate 0.5")])


@snd("jump", "a", "gameplay", note="chip hop: pulse slide up + boing body")
def _():
    n = n_(0.2)
    f = d.expramp(n, 300, 720)
    x = d.square(f, n, 0.25) * 0.55 + d.tri(f * 0.5, n) * 0.5 + d.sine(f * 2, n) * 0.15
    x *= d.adsr(n, 0.002, 0.05, 0.55, 0.08)
    t = s.click(2, 0.2, hpf=2500)
    x[:len(t)] += t[:n]
    return lofi(x, 2, drive=1.8)


@snd("jump", "b", "gameplay", note="rubbery boing: FM sine with vibrato + pack jump layer")
def _():
    n = n_(0.22)
    f = d.expramp(n, 220, 520) * (1 + 0.03 * np.sin(2 * np.pi * 22 * np.arange(n) / SR))
    boing = d.fm(f, 2.0, 2.5 * np.linspace(1, 0.1, n), n) * d.adsr(n, 0.002, 0.06, 0.5, 0.1)
    p = d.load(J + "Movement/Jumping and Landing/sfx_movement_jump5.wav")[:n]
    p = d.lp(p, 4500, 1)
    return d.mix(boing * 0.8, (p, 0, 0.45), length=n)


@snd("hop-land", "", "gameplay", note="soft pack thud + tiny dust tick")
def _():
    th = d.load(K + "impact-sounds/Audio/impactSoft_medium_001.ogg")
    th = d.pitch(th, 1.25)
    th = d.mix(th, (s.thump(0.12, 110, 55, tau=0.04), 0, 0.7))
    dust = d.hp(noise(n_(0.06)), 2500, 1) * expdec(n_(0.06), 0.012) * 0.5
    body = d.bp(noise(n_(0.08)), 250, 1400, 1) * expdec(n_(0.08), 0.02) * 3
    return d.hp(d.mix(th, (dust, 0.004, 0.5), (body, 0.0, 0.8)), 140, 2)


@snd("floor-switch", "", "gameplay", note="down-swoosh with a thump at the bottom")
def _():
    w = s.whoosh(0.13, 4500, 700, peak=0.08, q=1.4)
    t = s.thump(0.12, 120, 55, tau=0.03)
    return d.mix(w, (t, 0.06, 0.6))


@snd("dash", "a", "gameplay", note="rising whoosh + saw sweep, bright front")
def _():
    n = n_(0.28)
    w = s.whoosh(0.28, 500, 7000, peak=0.2, q=1.0)
    f = d.expramp(n, 260, 1900)
    sw = (d.saw(f, n) * 0.5 + d.square(f * 1.5, n) * 0.2) * d.adsr(n, 0.004, 0.08, 0.6, 0.12)
    sw = d.lp(sw, 5000, 1)
    t = s.click(3, 0.3)
    k = s.thump(0.1, 180, 70, tau=0.03) * 0.7
    return lofi(d.mix(w, (sw, 0, 0.7), (t, 0, 1.0), (k, 0, 1.0)), 1, drive=1.6)


@snd("dash", "b", "gameplay", note="Kenney phaserUp zap + noise whoosh underneath")
def _():
    p = d.load(K + "digital-audio/Audio/phaserUp3.ogg")
    p = d.trim(p)[:n_(0.3)]
    w = s.whoosh(len(p) / SR, 800, 6000, peak=0.6, q=0.9)
    k = s.thump(0.1, 160, 60, tau=0.03)
    return d.mix(p, (w, 0, 0.6), (k, 0, 0.5))


@snd("dash-ready", "", "pickup", note="two-step chirp up + bell ping")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.16 if i == 0 else 0.3, 0.5, 0.002, 0.08, 0.4, 0.1, sub=0.3)
    ch = notes([88, 95], 0.075, v)
    b = s.bell(float(s.mtof(100)), 0.35, tau=0.2)
    return lofi(d.mix(ch, (b, 0.075, 0.35)), 2, verb=(0.3, 0.15))


@snd("death", "a", "gameplay", note="splat + bass thump + falling pulse + crackle")
def _():
    n = n_(0.55)
    sp = s.splat(0.3, 2600, 250)
    th = s.thump(0.5, 90, 32, tau=0.12, drive=2.4)
    f = d.expramp(n, 440, 70)
    fall = d.square(f, n, 0.25) * d.adsr(n, 0.002, 0.1, 0.4, 0.3) * 0.5
    cr = s.crackle(0.4, 200, 1500, 0.4, decay=0.15)
    x = d.mix(sp, (th, 0, 1.0), (fall, 0.03, 0.6), (cr, 0.05, 0.6))
    return lofi(x, 2, drive=1.7, verb=(0.25, 0.12))


@snd("death", "b", "gameplay", note="pack squish-splat + heavy punch + sad 3-note chip drop")
def _():
    sp = d.load("oga-squish/oga-squish__squishsplat_impact.mp3")
    pu = d.load(K + "impact-sounds/Audio/impactPunch_heavy_002.ogg")[:n_(0.5)]
    v = lambda f, i: s.pulse_voice(f, 0.2, 0.5, 0.002, 0.1, 0.4, 0.1, slide=0.85)
    sad = notes([67, 62, 55], 0.1, v)
    th = s.thump(0.4, 80, 32, tau=0.1)
    x = d.mix(sp, (pu, 0, 0.8), (sad, 0.04, 0.45), (th, 0, 0.8), length=n_(0.6))
    return lofi(x, 2, drive=1.6)


@snd("hiss", "", "gameplay", note="pulsing band-limited hiss, rattle-like AM")
def _():
    n = n_(0.55)
    z = d.bp(noise(n), 2500, 9500, 2)
    am = 0.55 + 0.45 * (np.sign(np.sin(2 * np.pi * 38 * np.arange(n) / SR)) * 0.5 + 0.5)
    x = z * am * d.adsr(n, 0.015, 0.08, 0.75, 0.2) * 3
    b = d.lp(noise(n), 500, 1) * d.adsr(n, 0.02, 0.1, 0.5, 0.2) * 0.4
    return d.sat(x + b, 1.4)


@snd("roach-noise", "", "ambient", loop=True, note="sparse tiny scratches and skitters, 3.2 s loop")
def _():
    L = 3.2 + 0.1
    n = n_(L)
    out = np.zeros(n)
    r = d.rng()
    t = 0.05
    while t < L - 0.2:
        burst = int(r.integers(3, 9))
        f = r.uniform(3500, 7500)
        for k in range(burst):
            w = n_(r.uniform(0.004, 0.012))
            c = d.bp(noise(w + 64), f * 0.7, f * 1.3, 1)[:w] * np.hanning(w) * r.uniform(0.4, 1.0)
            p = n_(t + k * r.uniform(0.018, 0.034))
            if p + w < n:
                out[p:p + w] += c * 5
        t += r.uniform(0.35, 0.8)
    out += d.lp(noise(n, "pink"), 1200, 1) * 0.012
    return d.make_loop(out, 0.1)


@snd("cricket", "", "ambient", loop=True, note="synth crickets: 3-pulse chirps on a 4.8 kHz carrier, 4 s loop")
def _():
    L = 4.0 + 0.1
    n = n_(L)
    out = np.zeros(n)
    r = d.rng()
    t = 0.1
    while t < L - 0.5:
        f = 4700 + r.uniform(-120, 120)
        for k in range(3):
            w = n_(0.055)
            tn = np.arange(w) / SR
            c = np.sin(2 * np.pi * (f + 60 * tn * 10) * tn) * np.sin(np.pi * np.arange(w) / w) ** 2
            c += 0.3 * np.sin(2 * np.pi * f * 2 * tn) * np.sin(np.pi * np.arange(w) / w) ** 2
            p = n_(t + k * 0.075)
            if p + w < n:
                out[p:p + w] += c
        t += 0.62 + r.uniform(-0.05, 0.05)
    out += d.lp(noise(n, "pink"), 900, 1) * 0.02
    return d.make_loop(out, 0.1)


@snd("heartbeat", "", "loop", loop=True, note="soft low lub-dub, 1 s loop (death replay, under the music)")
def _():
    L = 1.0 + 0.06
    n = n_(L)
    out = np.zeros(n)
    for at, f0, level in ((0.0, 78, 1.0), (0.26, 66, 0.65)):
        t = d.lp(s.thump(0.22, f0, f0 * 0.55, drive=1.3, tau=0.05, noise_amt=0.05), 220, 2)
        p = n_(at)
        out[p:p + len(t)] += t[:n - p] * level
    return d.make_loop(out, 0.06)


@snd("huh", "", "gameplay", note="rising two-note questioning blip")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.18 if i == 0 else 0.26, 0.5, 0.003, 0.08, 0.5, 0.1, vib=0.01 if i else 0, sub=0.2,
                                   slide=1.0 if i == 0 else 1.12)
    return lofi(notes([72, 79], 0.14, v), 2, verb=(0.2, 0.1))


# =========================================================================== OBSTACLES
O = "Obstacles"
group("onion", O, "Onion obstacle on screen (new, no sound today)")
group("spray", O, "Pest spray on screen", [("audio/spray.ogg", "current"), ])
group("flipper", O, "Flipper on screen / obstacle punted", [("audio/flipper.ogg", "current")])
group("newspaper", O, "Newspaper on screen", [("audio/newspaper.ogg", "current")])
group("bird", O, "Bird on screen", [("audio/bird.ogg", "current")])
group("cat", O, "Cat paw on screen", [("audio/cat.ogg", "current")])
group("disco", O, "Disco ball on screen", [("audio/disco.ogg", "current")])
group("jellyfish", O, "Jellyfish on screen", [("audio/jellyfish.ogg", "current")])
group("bison", O, "Bison on screen", [("audio/bison.ogg", "current")])
group("blackhole", O, "Black hole on screen", [("audio/blackhole.ogg", "current")])
group("holy-choir", O, "\"Pope\" obstacle on screen: neutral synthetic holy choir sting", [("audio/pope.ogg", "current (pope.ogg)")])


def drop(f, dur=0.12, up=True):
    n = n_(dur)
    ff = d.expramp(n, f * (0.6 if up else 1.4), f * (1.3 if up else 0.7))
    return d.sine(ff, n) * expdec(n, dur * 0.35) * 0.9


@snd("onion", "", "obstacle", note="three water-drop plinks (tears) + sniffly hiss + sizzle")
def _():
    n = n_(0.9)
    layers = [(drop(1100, 0.12), 0.0, 1.0), (drop(900, 0.14), 0.19, 0.8), (drop(1350, 0.11), 0.37, 0.7)]
    sn = s.hiss(0.45, 3500, 9000, 0.02, 0.2) * 0.35
    sz = s.crackle(0.5, 160, 3000, 0.4, decay=0.2)
    x = d.mix(*layers, (sn, 0.45, 1.0), (sz, 0.0, 0.5), length=n)
    return d.reverb(lofi(x, 1, drive=1.3), 0.3, 0.2)


@snd("spray", "", "obstacle", note="ball-rattle ticks into a long pressurised hiss")
def _():
    n = n_(1.0)
    rat = np.zeros(n)
    for k in range(5):
        rat = d.mix(rat, (d.bp(s.click(4, 1.0), 3000, 6000, 1), 0.03 * k, 0.5 if k % 2 else 0.8), length=n)
    h = s.hiss(0.9, 2000, 11000, 0.04, 0.35) * 0.9
    h = d.sweep(h, 9000, 4500, "lowpass", q=0.7)
    return d.mix((rat, 0, 0.8), (h, 0.15, 1.0), length=n)


@snd("flipper", "", "obstacle", note="solenoid thunk + metal ting + spring boing")
def _():
    th = s.thump(0.14, 150, 70, tau=0.03)
    mt = d.load(K + "impact-sounds/Audio/impactMetal_light_002.ogg")[:n_(0.3)]
    n = n_(0.3)
    spr = d.fm(d.expramp(n, 520, 260) * (1 + 0.04 * np.sin(2 * np.pi * 30 * np.arange(n) / SR)), 3.0, 2.0 * np.linspace(1, 0, n), n) * expdec(n, 0.09) * 0.5
    return d.mix(th, (mt, 0, 0.7), (spr, 0.02, 0.6))


@snd("newspaper", "", "obstacle", note="paper slide/shove pack sounds + flutter whoosh")
def _():
    a = d.load(K + "casino-audio/Audio/card-slide-3.ogg")
    b = d.load(K + "casino-audio/Audio/card-shove-2.ogg")
    a = d.pitch(a, 0.85)
    w = s.whoosh(0.5, 900, 4500, peak=0.35, q=0.7)
    return d.mix((a, 0, 1.2), (b, 0.28, 1.0), (w, 0, 0.6))


@snd("bird", "", "obstacle", note="four FM chirps (sine glides) + wing flap whoosh")
def _():
    layers = []
    for k, (f0, f1) in enumerate([(3000, 4600), (3300, 4900), (2800, 4400), (3500, 5200)]):
        n = n_(0.09)
        f = d.expramp(n, f0, f1)
        c = d.fm(f, 1.5, 1.5, n) * np.sin(np.pi * np.arange(n) / n) ** 0.7
        layers.append((c, 0.11 * k, 0.8))
    flap = s.whoosh(0.2, 300, 1500, peak=0.3, q=0.7) * 0.45
    return d.mix(*layers, (flap, 0.0, 1.0), (flap, 0.25, 0.8), length=n_(0.7))


@snd("cat", "", "obstacle", note="paw-swipe whoosh then a synthetic 'mrow' (formant-filtered saw)")
def _():
    sw = s.whoosh(0.25, 1200, 5500, peak=0.4, q=1.0)
    n = n_(0.5)
    f = np.interp(np.linspace(0, 1, n), [0, 0.25, 0.7, 1], [420, 760, 560, 380])
    v = d.saw(f * (1 + 0.012 * np.sin(2 * np.pi * 6 * np.arange(n) / SR)), n)
    v = d.formant(v, [720, 1250, 2700], [7, 8, 9], [1, 0.6, 0.2])
    v *= d.adsr(n, 0.03, 0.1, 0.8, 0.15)
    return d.mix(sw, (v, 0.12, 0.6))


@snd("disco", "", "obstacle", note="kick + hat + funky 4-note chord stab + glitter bells")
def _():
    k = s.kick(0.2, 150, 50)
    h = s.hat(0.05) * 0.5
    stab = np.zeros(n_(0.9))
    for i, chord in enumerate([[60, 64, 67, 71], [62, 65, 69, 72], [64, 67, 71, 74]]):
        for m in chord:
            f = float(s.mtof(m))
            stab = d.mix(stab, (s.pulse_voice(f, 0.14, 0.5, 0.002, 0.05, 0.5, 0.06, sub=0.2), 0.12 * i, 0.4), length=n_(0.9))
    gl = np.zeros(n_(0.9))
    for i, m in enumerate([96, 100, 103, 108, 103, 100]):
        gl = d.mix(gl, (s.bell(float(s.mtof(m)), 0.3, tau=0.12), 0.35 + 0.08 * i, 0.25), length=n_(0.9))
    x = d.mix((k, 0, 1.0), (h, 0.06, 1.0), (h, 0.18, 1.0), (k, 0.24, 0.8), (stab, 0.0, 0.9), (gl, 0, 1.0), length=n_(0.9))
    return d.reverb(x, 0.3, 0.15)


@snd("jellyfish", "", "obstacle", note="wobbly underwater bloop, two notes + bubbles")
def _():
    n = n_(1.1)
    lfo = 1 + 0.05 * np.sin(2 * np.pi * 5 * np.arange(n) / SR)
    f = np.interp(np.linspace(0, 1, n), [0, 0.3, 0.6, 1], [380, 560, 320, 240]) * lfo
    v = d.fm(f, 1.0, 1.8 * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * np.arange(n) / SR)), n) * d.adsr(n, 0.04, 0.2, 0.6, 0.4)
    bub = np.zeros(n)
    for k, t in enumerate([0.1, 0.35, 0.55, 0.78]):
        bub = d.mix(bub, (drop(900 + 250 * k, 0.07) * 0.5, t, 1.0), length=n)
    x = d.lp(v, 1800, 1) * 0.8 + bub * 0.6
    return d.reverb(x, 0.45, 0.28)


@snd("bison", "", "obstacle", note="three gallop thumps + low pack grunt pitched down + rumble")
def _():
    n = n_(1.3)
    th = [(s.thump(0.3, 85, 36, tau=0.08, drive=2.0), t, 1.0 - 0.15 * k) for k, t in enumerate([0.0, 0.22, 0.44])]
    g = d.load("oga-80-creature/grunt_02.ogg")
    g = d.pitch(g, 0.7)
    r = s.rumble(1.0, 50, 0.1, 0.5) * 0.6
    return d.mix(*th, (g, 0.5, 0.9), (r, 0.2, 0.5), length=n)


@snd("blackhole", "", "obstacle", note="inward FM sweep that tightens, plus reversed-crash swell")
def _():
    n = n_(1.6)
    f = d.expramp(n, 1800, 55)
    x = d.fm(f, 0.5, 4.0 * np.linspace(1, 3, n), n)
    x *= np.linspace(0.2, 1, n) ** 1.5 * (1 - np.exp(-np.arange(n) / (0.02 * SR)))
    sw = d.rev(s.crash(1.2, 3000))[:n]
    tr = d.tremolo(x, 6, 0.4)
    y = d.mix((tr, 0, 0.8), (sw, 0, 0.5), (s.thump(0.5, 70, 30), 1.1, 0.8), length=n)
    return d.sat(y, 1.5)


@snd("holy-choir", "", "obstacle", note="synthetic 'ah' choir: detuned saws through vowel formants, bell sparkle")
def _():
    n = n_(1.5)
    out = np.zeros(n)
    for m in [48, 55, 60, 64, 67, 72]:
        f = float(s.mtof(m))
        for det in (0.994, 1.0, 1.006):
            v = d.saw(f * det * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * np.arange(n) / SR)), n)
            out += v * 0.12
    out = d.formant(out, [700, 1150, 2600], [5, 6, 8], [1, 0.7, 0.3])
    out *= d.adsr(n, 0.25, 0.1, 0.85, 0.5)
    bl = np.zeros(n)
    for i, m in enumerate([96, 100, 103, 108]):
        bl = d.mix(bl, (s.bell(float(s.mtof(m)), 0.5, tau=0.3), 0.55 + 0.08 * i, 0.25), length=n)
    return d.reverb(d.mix(out * 0.7, bl, length=n), 0.9, 0.35, tail=0.4)


# =========================================================================== PICKUPS & COMBO
P = "Pickups & combo"
group("apple", P, "Pick up an apple (also the combo chime base)", [("audio/apple.ogg", "current")])
group("beer", P, "Pick up a beer (6 flavours can share these 3)", [("audio/burp.ogg", "current burp (what beer plays today)")])
group("burp", P, "Burp (after a beer; Eksterminator's last puff borrows it)", [("audio/burp.ogg", "current")])
group("pill", P, "Pick up a pill", [("audio/pill.ogg", "current")])
group("pill-end", P, "Pill wears off (new)")
group("combo-tick", P, "Combo tick, 8 rising pitches (one per combo step)", [("audio/apple.ogg", "current (apple chime, pitched)")])
group("mult-up", P, "Score multiplier goes up (new)")
group("combo-lost", P, "Combo lost", [("audio/combo-lost.ogg", "current")])
group("combo-break", P, "Big combo shattered (bigger sibling of combo-lost, new)")
group("na-styk", P, "NA STYK! (close call)", [("audio/dash-ready.ogg", "current stand-in")])
group("przebicie", P, "PRZEBICIE! (dash-through smash)", [("audio/flipper.ogg", "current stand-in")])


def crunch_bursts(times, dur=0.05, lo=1500, hi=6500, level=1.0):
    n = n_(max(times) + dur + 0.02)
    out = np.zeros(n)
    for t in times:
        w = n_(dur)
        c = d.bp(noise(w + 32), lo, hi, 2)[:w] * expdec(w, dur * 0.35) * 3
        c[:n_(0.0008)] *= np.linspace(0, 1, n_(0.0008))
        p = n_(t)
        out[p:p + w] += c * level
    return out


@snd("apple", "a", "pickup", note="two juicy crunch bursts + rising two-note chip blip")
def _():
    cr = crunch_bursts([0.0, 0.045], 0.05)
    v = lambda f, i: s.pulse_voice(f, 0.12, 0.5, 0.002, 0.05, 0.5, 0.05, sub=0.3)
    bl = notes([81, 88], 0.06, v)
    return lofi(d.mix(cr, (bl, 0.03, 0.7), length=n_(0.3)), 2)


@snd("apple", "b", "pickup", note="pack retro coin + crunch + pop")
def _():
    c = d.load(J + "General Sounds/Coins/sfx_coin_single3.wav")
    cr = crunch_bursts([0.0], 0.06)
    pop = s.thump(0.06, 400, 150, tau=0.015, drive=1.4)
    return d.mix((c, 0.015, 0.8), (cr, 0, 0.9), (pop, 0, 0.5), length=n_(0.3))


def glug(f, n_glugs, step=0.11, seed=0):
    n = n_(step * n_glugs + 0.12)
    out = np.zeros(n)
    for k in range(n_glugs):
        w = n_(0.1)
        ff = d.expramp(w, f * (0.8 + 0.05 * k), f * (1.5 + 0.05 * k))
        g = d.fm(ff, 1.0, 1.2, w) * expdec(w, 0.04) * np.minimum(1, np.arange(w) / (0.004 * SR))
        out[n_(k * step):n_(k * step) + w] += g
    return out


@snd("beer", "1", "pickup", note="glug-glug-glug + fizz + bottle tick")
def _():
    g = glug(210, 3)
    fz = s.hiss(0.5, 5000, 12000, 0.01, 0.3) * 0.3
    bt = d.load(K + "impact-sounds/Audio/impactGlass_light_001.ogg")[:n_(0.25)]
    return lofi(d.mix((g, 0.04, 0.9), (fz, 0.0, 1.0), (bt, 0, 0.6), length=n_(0.6)), 1, drive=1.3)


@snd("beer", "2", "pickup", note="higher glug pair + fizz + glass clink")
def _():
    g = glug(300, 2, 0.1)
    fz = s.hiss(0.4, 6000, 13000, 0.01, 0.25) * 0.3
    bt = d.load(K + "impact-sounds/Audio/impactGlass_light_003.ogg")[:n_(0.25)]
    return lofi(d.mix((g, 0.03, 0.9), (fz, 0.0, 1.0), (bt, 0, 0.5), length=n_(0.5)), 1, drive=1.3)


@snd("beer", "3", "pickup", note="low long gulp x4 + pop-the-cap click + fizz")
def _():
    g = glug(165, 4, 0.12)
    cap = d.load(K + "rpg-audio/Audio/metalClick.ogg")[:n_(0.12)]
    fz = s.hiss(0.6, 4500, 11000, 0.01, 0.3) * 0.3
    return lofi(d.mix((cap, 0, 0.7), (g, 0.08, 0.9), (fz, 0.06, 1.0), length=n_(0.7)), 1, drive=1.3)


@snd("burp", "a", "pickup", note="pack creature burp, trimmed, slightly pitched down")
def _():
    b = d.load("oga-80-creature/burp_01.ogg")
    return d.pitch(d.trim(b), 0.92)


@snd("burp", "b", "pickup", note="synth belch: low glottal pulse train through vowel formants, gliding down")
def _():
    n = n_(0.7)
    f = np.interp(np.linspace(0, 1, n), [0, 0.15, 0.6, 1], [70, 95, 62, 48])
    pulse = d.saw(f, n)
    pulse = np.where(pulse > 0.2, pulse, pulse * 0.2)
    x = d.sweep(pulse, 1800, 450, "lowpass", q=2.5)
    x = d.formant(x, [450, 900, 1700], [4, 5, 6], [1, 0.8, 0.3])
    wob = 1 + 0.35 * np.sin(2 * np.pi * 24 * np.arange(n) / SR)
    x = x * wob * d.adsr(n, 0.03, 0.12, 0.7, 0.25)
    return d.sat(x, 1.8)


@snd("pill", "", "pickup", note="fast 5-note rising arpeggio + fizz")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.14 + (0.2 if i == 4 else 0), 0.25, 0.002, 0.06, 0.5, 0.08, sub=0.35)
    ar = notes([72, 76, 79, 84, 88], 0.055, v)
    fz = s.hiss(0.5, 4000, 12000, 0.02, 0.3) * 0.3
    b = s.bell(float(s.mtof(100)), 0.4, tau=0.2) * 0.4
    return lofi(d.mix(ar, (fz, 0, 1.0), (b, 0.22, 1.0), length=n_(0.6)), 2, verb=(0.25, 0.12))


@snd("pill-end", "", "pickup", note="falling arpeggio + deflating pssh")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.12, 0.25, 0.002, 0.06, 0.4, 0.06, sub=0.35, slide=0.93)
    ar = notes([88, 84, 79, 76, 72], 0.06, v)
    dz = s.whoosh(0.35, 6000, 800, peak=0.1, q=0.8) * 0.55
    return lofi(d.mix(ar, (dz, 0.05, 1.0), length=n_(0.45)), 2)


SCALE = s.scale(72, list(range(8)), "major_pent")  # C5 D5 E5 G5 A5 C6 D6 E6


def tick(i):
    f = float(s.mtof(SCALE[i]))
    n = n_(0.14)
    x = s.pulse_voice(f, 0.14, 0.5, 0.001, 0.05, 0.3, 0.06, sub=0.3)
    b = s.bell(f * 2, 0.18, tau=0.07) * 0.28
    return d.mix(x, b, length=n)


for _i in range(8):
    snd("combo-tick", str(_i + 1), "pickup", note=f"pentatonic step {_i + 1}/8: pulse + bell octave")(lambda i=_i: lofi(tick(i), 2))


@snd("mult-up", "", "stinger", note="3-note riser + bell + upward zap")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.1 + 0.15 * (i == 2), 0.25, 0.002, 0.04, 0.6, 0.08, sub=0.4)
    ar = notes([79, 84, 91], 0.07, v)
    z = s.zap(500, 3000, 0.12) * 0.4
    b = s.bell(float(s.mtof(103)), 0.4, tau=0.2) * 0.5
    return lofi(d.mix(ar, (z, 0, 1.0), (b, 0.14, 1.0), length=n_(0.5)), 2, verb=(0.2, 0.1))


@snd("combo-lost", "", "pickup", note="two falling wah notes (tri), deflating")
def _():
    n = n_(0.45)
    f = d.expramp(n, 520, 170)
    x = d.tri(f, n) * 0.7 + d.square(f * 0.5, n, 0.5) * 0.25
    x = x * (1 + 0.3 * np.sin(2 * np.pi * 14 * np.arange(n) / SR)) * d.adsr(n, 0.004, 0.1, 0.6, 0.2)
    t = s.click(2, 0.2)
    x[:len(t)] += t[:n]
    return lofi(x, 2, drive=1.4)


@snd("combo-break", "", "stinger", note="glass shatter pack + falling chip + low thump")
def _():
    gl = d.load(K + "impact-sounds/Audio/impactGlass_medium_002.ogg")[:n_(0.5)]
    n = n_(0.5)
    f = d.expramp(n, 700, 110)
    fall = d.square(f, n, 0.25) * d.adsr(n, 0.002, 0.1, 0.4, 0.2) * 0.4
    th = s.thump(0.35, 85, 38, tau=0.07)
    return lofi(d.mix(gl, (fall, 0.02, 0.6), (th, 0, 0.9), length=n), 2, drive=1.5)


@snd("na-styk", "", "stinger", note="tight swish + metallic ping + high chirp")
def _():
    sw = s.whoosh(0.16, 1500, 7000, peak=0.5, q=1.2)
    pg = s.bell(1900, 0.3, bright=1.4, tau=0.12) * 0.7
    n = n_(0.12)
    ch = d.square(d.expramp(n, 1500, 3200), n, 0.25) * d.adsr(n, 0.001, 0.03, 0.4, 0.06) * 0.4
    return lofi(d.mix(sw, (pg, 0.07, 0.9), (ch, 0.07, 0.8), length=n_(0.45)), 2, drive=1.4)


@snd("przebicie", "", "stinger", note="pack glass-break crack + punch + zap + sub thump")
def _():
    br = d.load("oga-75-breaking-hit/bfh1_breaking_01.ogg")[:n_(0.6)]
    pu = d.load(K + "impact-sounds/Audio/impactPunch_heavy_000.ogg")[:n_(0.5)]
    z = s.zap(2600, 180, 0.2) * 0.8
    th = s.thump(0.4, 100, 36, tau=0.09)
    return lofi(d.mix((br, 0, 0.7), (pu, 0, 0.9), (z, 0, 0.7), (th, 0, 0.9), length=n_(0.65)), 1, drive=1.6)


# =========================================================================== UI
U = "UI"
group("ui-press", U, "Button press", [])
group("ui-hover", U, "Hover / select / focus")
group("ui-back", U, "Back / close")
group("ui-slider", U, "Slider tick (settings)")
group("ui-purchase", U, "Purchase in the shop")
group("ui-error", U, "Error / denied")


@snd("ui-press", "a", "ui", note="Kenney ui-audio click + 2-note chip pluck")
def _():
    c = d.load(K + "ui-audio/Audio/click4.ogg")
    v = lambda f, i: s.pulse_voice(f, 0.07, 0.5, 0.001, 0.03, 0.2, 0.04, sub=0.2)
    bl = notes([84, 91], 0.025, v)
    return lofi(d.mix((c, 0, 0.6), (bl, 0.0, 0.8), length=n_(0.12)), 2)


@snd("ui-press", "b", "ui", note="all synth: low thock + bright 2-tone blip")
def _():
    th = s.thump(0.06, 260, 120, tau=0.015, drive=1.3) * 0.8
    v = lambda f, i: s.pulse_voice(f, 0.06, 0.25, 0.001, 0.025, 0.2, 0.03, sub=0.1)
    bl = notes([79, 86], 0.03, v)
    return lofi(d.mix(th, bl, length=n_(0.12)), 2)


@snd("ui-hover", "", "ui", note="tiny soft triangle blip")
def _():
    n = n_(0.05)
    x = d.tri(1760, n) * d.adsr(n, 0.002, 0.02, 0.3, 0.02) * 0.8
    return lofi(d.mix(x, (s.click(1.5, 0.08, hpf=3500), 0, 1.0), length=n), 2)


@snd("ui-back", "", "ui", note="falling two-note blip")
def _():
    v = lambda f, i: s.pulse_voice(f, 0.07, 0.5, 0.001, 0.03, 0.3, 0.04, sub=0.2)
    return lofi(notes([79, 72], 0.05, v), 2)


@snd("ui-slider", "", "ui", note="very short click + 1.2 kHz tick")
def _():
    n = n_(0.03)
    x = d.mix(d.sine(1200, n) * expdec(n, 0.006), (s.click(1.5, 0.3, hpf=3000), 0, 1.0), length=n)
    return lofi(x, 2)


@snd("ui-purchase", "", "pickup", note="coin clink pack + two quick bell hits (cha-ching)")
def _():
    c = d.load(K + "rpg-audio/Audio/handleCoins2.ogg")[:n_(0.3)]
    b1 = s.bell(float(s.mtof(88)), 0.4, tau=0.18)
    b2 = s.bell(float(s.mtof(95)), 0.5, tau=0.25)
    v = s.pulse_voice(float(s.mtof(95)), 0.12, 0.5, 0.001, 0.05, 0.3, 0.05, sub=0.2) * 0.4
    return d.reverb(lofi(d.mix((c, 0, 0.9), (b1, 0.0, 0.7), (b2, 0.09, 0.8), (v, 0.09, 1.0), length=n_(0.6)), 1), 0.2, 0.1)


@snd("ui-error", "", "ui", note="two dissonant buzzer pulses")
def _():
    n = n_(0.16)
    b = (d.saw(130, n) * 0.5 + d.square(139, n, 0.5) * 0.5) * d.adsr(n, 0.002, 0.02, 0.9, 0.03)
    b = d.lp(b, 2200, 1)
    return lofi(d.mix(b, (b, 0.2, 1.0), length=n_(0.38)), 2, drive=1.5)
