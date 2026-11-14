"""Own sounds for the rebuilt bosses and the enemies that used to borrow another sound's key.

Bosses first (shared parry, Eksterminator, DJ Bigos, Zlewiatan), then the obstacles. Every sound is short, chip-flavoured
synthesis, some layered with a CC0 pack sample like the rest of the set.
"""
import numpy as np
from lib import dsp as d
from lib import synth as s
from lib.dsp import SR, n_, expdec, noise
from lib.registry import group, snd
from sounds_core import lofi, K
from sounds_boss import EK, BI

K_ = K


def pk(name, dur):
    """A pack sound (path under _packs/, no extension) with its silence trimmed, cut to dur seconds."""
    return d.trim(d.load(name + ".ogg"))[:n_(dur)]


def env(n, pts):
    """Piecewise-linear envelope: pts = [(seconds, level), ...]."""
    t = np.arange(n) / SR
    return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])


def gate(x, f=40.0, duty=0.5, soft=0.15):
    """Chop x on and off at f Hz (a pulse train with softened edges): scuttle, chuff, ribbit."""
    n = len(x)
    ph = (np.arange(n) * f / SR) % 1.0
    g = np.clip((duty - ph) / soft + 0.5, 0, 1) * np.clip(ph / soft, 0, 1)
    return x * g


# =========================================================================== BOSSES
NB = "Bosses: shared (own sounds)"
ZL2 = "Boss: Zlewiatan (own sounds)"
group("boss-parry", NB, "The roach parries: a shot or a thrown thing deflected back (Eksterminator, Bigos, Zlewiatan)", [("audio/przebicie.ogg", "current stand-in")])
group("ex-knock", EK, "His wand knocked out of his hand by the lunge", [("boss/vs-slam-2.ogg", "current stand-in")])
group("ex-shove", EK, "Shoved reeling back by the lunge or a crash", [("boss/vs-slam-1.ogg", "current stand-in")])
group("ex-struck", EK, "The roach is struck by his gas or jet", [("boss/vs-slam-2.ogg", "current stand-in")])
group("ex-mine-arm", EK, "A mine arms and starts to gas", [("boss/bigos-sizzle.ogg", "current stand-in")])
group("ex-leak", EK, "The tank leaks, whistling higher each rage step (played at rising rate)", [("boss/bigos-sizzle.ogg", "current stand-in")])
group("ex-charge", EK, "He braces for the charge", [("boss/ex-pump.ogg", "current stand-in (slowed)")])
group("ex-rush", EK, "The charge passes along a lane", [("boss/vs-slam-2.ogg", "current stand-in")])
group("ex-grenade-bounce", EK, "The grenade can bounces", [("boss/ex-canister-pop.ogg", "current stand-in")])
group("ex-whiff", EK, "A lunge into empty air", [("boss/bullet-ricochet.ogg", "current stand-in")])
group("bigos-bonk", BI, "Dash bonks a broken speaker", [("boss/bullet-ricochet.ogg", "current stand-in")])
group("bigos-overload", BI, "His system overloads (drop bounced back)", [("boss/bigos-sizzle.ogg", "current stand-in")])
group("bigos-shriek", BI, "A speaker shrieks with feedback (played at 1.6x rate)", [("boss/bigos-sizzle.ogg", "current stand-in")])
group("bigos-defeat", BI, "DJ Bigos is defeated: the deck winds down", [("boss/victory.ogg", "current stand-in")])
group("zl-head-fall", ZL2, "A head wrenches off its pipe and falls", [("boss/vs-slam-2.ogg", "current stand-in")])
group("zl-head-bounce", ZL2, "The loose head lands, bounces and rolls", [("boss/zl-slab-impact.ogg", "current stand-in")])
group("zl-head-smash", ZL2, "A head smashed (loose head dashed, or a head smacked by what was sent back)", [("boss/vs-slam-2.ogg", "current stand-in")])


@snd("boss-parry", "", "boss", note="bright metal deflect: click + pack light metal hit + rising FM zing + high bell")
def _():
    n = n_(0.45)
    zing = d.fm(d.expramp(n, 900, 3600), 1.5, 1.5, n) * d.adsr(n, 0.001, 0.12, 0.25, 0.2) * 0.5
    ting = s.bell(1760, 0.35, bright=0.6, tau=0.09) * 0.7
    mt = pk(K_ + "impact-sounds/Audio/impactMetal_light_002", 0.3)
    return lofi(d.mix((s.click(3, 0.9, hpf=1500), 0, 1.0), (mt, 0, 0.6), (zing, 0.005, 0.7), (ting, 0, 0.8), length=n), 1, drive=1.4)


@snd("ex-knock", "", "boss", note="pack metal clang, a spinning rod's falling FM wobble, two tink bounces, tank puff")
def _():
    n = n_(0.7)
    mt = pk(K_ + "impact-sounds/Audio/impactMetal_medium_001", 0.4)
    rod = d.fm(d.expramp(n_(0.4), 1500, 500), 2.01, 2.0, n_(0.4)) * expdec(n_(0.4), 0.14) * 0.4
    tinks = d.mix((s.bell(2600, 0.15, 0.5, 0.03), 0.20, 0.5), (s.bell(3200, 0.12, 0.5, 0.025), 0.32, 0.35),
                  (s.bell(2800, 0.1, 0.5, 0.02), 0.40, 0.2), length=n)
    puff = s.hiss(0.3, 2500, 9000, 0.005, 0.2) * 0.4
    return lofi(d.mix((s.click(3, 0.8, hpf=1200), 0, 1.0), (mt, 0, 0.9), (rod, 0.02, 0.8), tinks, (puff, 0.08, 0.7), length=n), 1, drive=1.4)


@snd("ex-shove", "", "big", note="heavy body shove: low thump + cloth/suit rustle + pack plate hit (low-passed) + slosh rattle")
def _():
    n = n_(0.6)
    th = s.thump(0.5, 100, 40, tau=0.12, drive=2.0)
    cl = pk(K_ + "rpg-audio/Audio/cloth3", 0.4)
    pl = d.lp(pk(K_ + "impact-sounds/Audio/impactPlate_heavy_001", 0.5), 1800, 1)
    sl = np.zeros(n)
    for t, f, g in [(0.12, 380, 0.5), (0.2, 330, 0.4), (0.3, 300, 0.25)]:
        sl = d.mix(sl, (s.bell(f, 0.15, 1.2, 0.04) * g, t, 1.0), length=n)
    return lofi(d.mix((th, 0, 1.0), (cl, 0.02, 0.8), (pl, 0, 0.7), sl, length=n), 1, drive=1.4)


@snd("ex-struck", "", "big", note="spray-gun whack on the roach: pack heavy punch + wet splat + gas crackle + falling zap")
def _():
    n = n_(0.65)
    pu = pk(K_ + "impact-sounds/Audio/impactPunch_heavy_002", 0.4)
    sp = s.splat(0.3, 2400, 350) * 0.6
    cr = s.crackle(0.45, 260, 2500, 0.6, decay=0.15)
    zp = s.zap(2800, 250, 0.2) * 0.5
    th = s.thump(0.3, 140, 55, tau=0.06)
    return lofi(d.mix((pu, 0, 1.0), (sp, 0, 0.8), (cr, 0.03, 0.8), (zp, 0, 0.8), (th, 0, 0.8), length=n), 1, drive=1.5)


@snd("ex-mine-arm", "", "boss", note="metal click, two rising square beeps, a puff of gas")
def _():
    n = n_(0.6)
    ck = pk(K_ + "rpg-audio/Audio/metalClick", 0.1)
    b1 = s.blip_stack(1500, 0.07, "square") * d.adsr(n_(0.07), 0.002, 0.02, 0.7, 0.02) * 0.4
    b2 = s.blip_stack(2000, 0.09, "square") * d.adsr(n_(0.09), 0.002, 0.02, 0.7, 0.03) * 0.4
    h = s.hiss(0.35, 2000, 8000, 0.02, 0.25) * 0.6
    return lofi(d.mix((ck, 0, 0.9), (b1, 0.1, 1.0), (b2, 0.22, 1.0), (h, 0.3, 1.0), length=n), 1, drive=1.3)


@snd("ex-leak", "", "boss", note="pressure leak: bandpassed hiss + wavering whistle + little pops (made to be played at rate 1 to 3.5)")
def _():
    n = n_(1.0)
    hs = d.bp(noise(n), 2500, 9000, 2) * d.adsr(n, 0.03, 0.1, 0.8, 0.3) * 2.5
    f = 1150 * (1 + 0.04 * np.sin(2 * np.pi * 7 * np.arange(n) / SR)) * np.linspace(0.9, 1.15, n)
    wh = d.sine(f, n) * d.adsr(n, 0.05, 0.1, 0.6, 0.35) * 0.35
    pp = s.crackle(0.9, 25, 800, 0.4, decay=0.5)
    return d.sat(d.mix(hs, wh, (pp, 0.05, 1.0), length=n), 1.3)


@snd("ex-charge", "", "boss", note="he braces: clank, a low saw engine winding up with a hissing exhale")
def _():
    n = n_(0.85)
    ck = pk(K_ + "rpg-audio/Audio/metalLatch", 0.12)
    eng = d.lp(d.saw(d.expramp(n, 55, 120), n) + d.saw(d.expramp(n, 82, 181), n) * 0.5, 700, 1)
    eng = eng * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(8, 22, n)) / SR)) * np.linspace(0.3, 1, n) * d.adsr(n, 0.02, 0.05, 1.0, 0.15)
    h = s.hiss(0.6, 2000, 8000, 0.15, 0.3) * 0.5
    return d.sat(d.mix((ck, 0, 0.8), (eng, 0.05, 0.9), (h, 0.2, 1.0), (s.thump(0.2, 90, 45, tau=0.05), 0.0, 0.7), length=n), 1.6)


@snd("ex-rush", "", "boss", note="the charge passing: doppler band-noise rise and fall over four stamping thumps")
def _():
    n = n_(0.9)
    w = s.whoosh(0.8, 200, 2500, peak=0.45, q=0.9, shape=1.4) * 0.8
    w2 = d.lp(noise(n), 500, 1) * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.2
    x = d.mix(w, (w2, 0, 0.9), length=n)
    for k, t in enumerate([0.08, 0.24, 0.40, 0.55]):
        x = d.mix(x, (s.thump(0.18, 75, 42, tau=0.05, drive=2.0), t, 0.9 - 0.1 * k), length=n)
    return d.sat(x, 1.4)


@snd("ex-grenade-bounce", "", "boss", note="hollow tin can bounce: pack tin hit + falling dong + two rattle tinks")
def _():
    n = n_(0.5)
    tn = pk(K_ + "impact-sounds/Audio/impactTin_medium_002", 0.3)
    dong = d.sine(d.expramp(n_(0.3), 700, 420), n_(0.3)) * expdec(n_(0.3), 0.08) * 0.6
    rt = d.mix((s.bell(3100, 0.1, 0.5, 0.02) * 0.4, 0.14, 1.0), (s.bell(3700, 0.08, 0.5, 0.015) * 0.3, 0.2, 1.0), length=n)
    return lofi(d.mix((tn, 0, 0.9), (dong, 0, 0.8), rt, (s.thump(0.12, 160, 70, tau=0.03), 0, 0.5), length=n), 1, drive=1.3)


@snd("ex-whiff", "", "boss", note="a miss: short falling swish and a tiny click")
def _():
    w = s.whoosh(0.28, 3500, 800, peak=0.25, q=1.0, shape=1.5)
    return d.mix(w, (s.click(2, 0.4, hpf=2500), 0, 1.0), length=n_(0.3))


@snd("bigos-bonk", "", "boss", note="dull speaker-cone bonk: falling sine + paper slap + low-passed wood hit + buzzy cone rattle")
def _():
    n = n_(0.4)
    bo = d.sine(d.expramp(n, 220, 85), n) * expdec(n, 0.07)
    sl = d.bp(noise(n_(0.06)), 300, 2000, 1) * expdec(n_(0.06), 0.012) * 2
    wd = d.lp(pk(K_ + "impact-sounds/Audio/impactWood_heavy_002", 0.3), 1500, 1)
    rat = d.lp(d.saw(125, n), 700, 1) * expdec(n, 0.05) * 0.4
    return lofi(d.mix(bo, (sl, 0, 0.6), (wd, 0, 0.8), (rat, 0.03, 0.7), length=n), 1, drive=1.5)


@snd("bigos-overload", "", "boss", note="power surge: 60 Hz buzz with climbing pitch and AM, arcing crackle, ends in a falling power-down groan")
def _():
    n = n_(1.2)
    t = np.arange(n) / SR
    f = np.interp(t, [0, 0.8, 1.2], [60, 150, 35])
    buz = d.lp(d.saw(f, n) + d.square(f * 2.01, n) * 0.4, 1800, 1)
    am = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(np.interp(t, [0, 1.2], [14, 40])) / SR)
    buz = buz * am * d.adsr(n, 0.03, 0.1, 0.9, 0.35)
    cr = s.crackle(1.0, 300, 2500, 0.9, decay=0.9)
    arc = np.zeros(n)
    for at in [0.06, 0.28, 0.5, 0.7]:
        arc = d.mix(arc, (s.zap(3200, 500, 0.08) * 0.4, at, 1.0), length=n)
    return d.sat(d.mix((buz, 0, 0.9), (cr, 0, 0.8), arc, length=n), 1.7)


@snd("bigos-shriek", "", "boss", lufs=-17.5, note="speaker feedback squeal: rising sine with vibrato + octave harmonics, driven; made for 1.6x rate")
def _():
    n = n_(1.4)
    t = np.arange(n) / SR
    f = np.interp(t, [0, 1.2, 1.4], [650, 980, 960]) * (1 + 0.015 * np.sin(2 * np.pi * 6 * t))
    x = d.sine(f, n) + 0.5 * d.sine(f * 2.0, n) + 0.25 * d.sine(f * 3.0, n)
    x = d.sat(x * np.linspace(0.3, 1.6, n), 2.5) * d.adsr(n, 0.04, 0.1, 0.9, 0.15)
    nz = d.hp(noise(n), 3000, 1) * np.linspace(0, 0.3, n)
    return x * 0.8 + nz * 0.3


@snd("bigos-defeat", "", "stinger", lufs=-15.5, note="turntable winding down: a falling saw chord slows to a stop over vinyl crackle, a sad square slide, last thump and sparks")
def _():
    n = n_(2.1)
    t = np.arange(n) / SR
    rate = np.interp(t, [0, 0.15, 1.7, 2.1], [1.0, 1.0, 0.05, 0.02])
    ph = np.cumsum(rate) / SR
    chord = np.zeros(n)
    for fr, g in [(110, 1.0), (165, 0.6), (220, 0.5)]:
        chord += g * (2 * ((ph * fr) % 1.0) - 1)
    chord = d.lp(chord, 2500, 1) * env(n, [(0, 0), (0.1, 1), (1.6, 0.5), (2.1, 0)]) * 0.5
    sad = np.zeros(n)
    for m, tm, du in [(67, 0.1, 0.28), (65, 0.4, 0.28), (62, 0.7, 0.28), (55, 1.0, 0.8)]:
        sad = d.mix(sad, (s.pulse_voice(float(s.mtof(m)), du, 0.5, 0.02, 0.08, 0.7, 0.1, vib=0.01, slide=0.93), tm, 0.45), length=n)
    vin = s.crackle(1.8, 70, 1500, 0.5, decay=1.2)
    th = s.thump(0.5, 70, 32, tau=0.15)
    sp = s.crackle(0.5, 200, 3500, 0.5, decay=0.15)
    return d.reverb(d.sat(d.mix(chord, sad, (vin, 0.1, 0.8), (th, 1.75, 0.9), (sp, 1.78, 0.6), length=n), 1.3), 0.3, 0.12)[:n]


@snd("zl-head-fall", "", "big", note="a head tears off its pipe: pack creak pitched down, metal snap, long falling heavy thud, clatter")
def _():
    n = n_(1.0)
    cr = d.pitch(pk(K_ + "rpg-audio/Audio/creak2", 0.5), 0.8)
    sn = pk(K_ + "impact-sounds/Audio/impactMetal_heavy_000", 0.4)
    th = s.thump(0.6, 80, 32, tau=0.16, drive=2.2)
    rb = s.rumble(0.5, 40, 0.01, 0.3) * 0.6
    ra = np.zeros(n)
    for k, t in enumerate([0.55, 0.65, 0.73, 0.79]):
        ra = d.mix(ra, (s.bell(float(1100 - 120 * k), 0.12, 1.2, 0.04) * (0.5 - 0.1 * k), t, 1.0), length=n)
    return d.reverb(d.mix((cr, 0, 0.8), (sn, 0.25, 1.0), (th, 0.38, 1.1), (rb, 0.38, 0.7), ra, length=n), 0.3, 0.15)


@snd("zl-head-bounce", "", "boss", note="stone-ceramic head landing: pack plate thud (low-passed), low sine knock, short wobbling rolling rumble")
def _():
    n = n_(0.65)
    pt = d.lp(pk(K_ + "impact-sounds/Audio/impactPlate_medium_001", 0.35), 2200, 1)
    kn = d.sine(d.expramp(n_(0.2), 160, 70), n_(0.2)) * expdec(n_(0.2), 0.05)
    roll = d.hp(d.lp(noise(n_(0.45), "brown"), 350, 2), 40, 1) * 4
    roll = roll * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(np.linspace(14, 7, len(roll))) / SR)) * expdec(len(roll), 0.14)
    return lofi(d.mix((pt, 0, 0.9), (kn, 0, 1.0), (roll, 0.08, 0.8), length=n), 1, drive=1.4)


@snd("zl-head-smash", "", "big", note="a head smashed: pack heavy glass shatter + plate hit + crumbling crackle + low thump")
def _():
    n = n_(0.8)
    gl = d.lp(pk(K_ + "impact-sounds/Audio/impactGlass_heavy_001", 0.6), 5000, 1)
    pl = pk(K_ + "impact-sounds/Audio/impactPlate_heavy_003", 0.5)
    cr = s.crackle(0.5, 240, 1200, 0.7, decay=0.2)
    th = s.thump(0.4, 110, 45, tau=0.08, drive=2.0)
    return d.reverb(lofi(d.mix((gl, 0, 0.9), (pl, 0, 0.8), (cr, 0.05, 0.8), (th, 0, 1.0), length=n), 1, drive=1.5), 0.25, 0.12)


# =========================================================================== OBSTACLES
OB = "Obstacles: own sounds (replacing borrowed ones)"
for _gid, _ev, _cur in [
    ("hedgehog", "Hedgehog curls and rushes", "audio/bison.ogg"),
    ("centipede-rear", "Centipede rears with a hiss, then scuttles", "audio/cat.ogg"),
    ("zapper-charge", "Bug zapper charges", "boss/bigos-sizzle.ogg"),
    ("zapper-bolt", "Bug zapper bolt", "boss/bigos-beam.ogg"),
    ("aerosol-rattle", "Aerosol can shot: rattles before it blows", "boss/ex-canister-pop.ogg"),
    ("aerosol-blast", "Aerosol can blast", "boss/ex-tank-burst.ogg"),
    ("bait-ooze", "Poison bait oozes out", "boss/ex-gas.ogg"),
    ("glue-squelch", "Glue trap on screen", "audio/onion.ogg"),
    ("bleach-drip", "Bleach drop falls and splashes", "audio/spray.ogg"),
    ("frog-croak", "Frog's throat swells: croak", "audio/jellyfish.ogg"),
    ("frog-tongue", "Frog's tongue lashes out", "audio/spray.ogg"),
    ("repeller-hum", "Ultrasonic repeller comes into view", "boss/bigos-scratch.ogg"),
    ("repeller-ring", "Repeller sends a ring down the lane", "boss/shell-casing.ogg"),
    ("spraywall-puff", "Spray can shakes and puffs its cloud wall", "audio/spray.ogg"),
    ("gull-screech", "Gull screeches", "audio/bird.ogg"),
    ("hen-cluck", "Hen clucks (the wind-up)", "audio/bird.ogg"),
    ("hen-peck", "Hen pecks", "audio/flipper.ogg"),
    ("robovac-whir", "Robot vacuum comes into view", "audio/blackhole.ogg"),
    ("robovac-crack", "Robot vacuum cracks under the first shot", "boss/bullet-ricochet.ogg"),
    ("boots-stomp", "A boot stomps", "audio/hop-land.ogg"),
    ("mop-slap", "Mop presses down and sweeps", "audio/spray.ogg"),
    ("lamp-flicker", "Lamp flickers", "audio/floor-switch.ogg"),
    ("lamp-snap", "Lamp snaps on", "audio/disco.ogg"),
    ("wasp-buzz", "Wasp locks on, trembling", "audio/bird.ogg"),
    ("wasp-dive", "Wasp dives", "(silent)"),
    ("vacuum-roar", "Vacuum cleaner's roar from behind", "audio/blackhole.ogg"),
]:
    group(_gid, OB, _ev, [(_cur, "current stand-in")])


@snd("hedgehog", "", "gameplay", note="snuffling chuffs (gated band noise), prickly rustle, a squeak, tiny scurry ticks")
def _():
    n = n_(0.55)
    ch = gate(d.bp(noise(n_(0.35)), 1500, 6000, 2), 16, 0.45, 0.2) * expdec(n_(0.35), 0.3) * 2.5
    ru = s.crackle(0.5, 220, 3000, 0.5, decay=0.3)
    sq = d.sine(d.expramp(n_(0.1), 2600, 3600), n_(0.1)) * expdec(n_(0.1), 0.04) * 0.4
    tk = gate(d.bp(noise(n_(0.3)), 2500, 7000, 1), 32, 0.3, 0.2) * expdec(n_(0.3), 0.15) * 1.2
    return d.mix((ch, 0, 1.0), (ru, 0.1, 0.8), (sq, 0.04, 1.0), (tk, 0.22, 0.7), length=n)


@snd("centipede-rear", "", "gameplay", note="rising dry hiss as it rears, then a fast run of leg ticks (gated high noise) with a rattle")
def _():
    n = n_(0.85)
    hs = d.bp(noise(n_(0.4)), 2500, 8000, 2) * env(n_(0.4), [(0, 0), (0.25, 1), (0.4, 0)]) * 2.2
    run = gate(d.bp(noise(n_(0.5)), 1800, 6500, 1), 44, 0.35, 0.25) * env(n_(0.5), [(0, 0.2), (0.1, 1), (0.5, 0.2)]) * 2.2
    rt = s.crackle(0.5, 280, 3500, 0.6, decay=0.35)
    return d.mix((hs, 0, 1.0), (run, 0.3, 0.9), (rt, 0.3, 0.6), length=n)


@snd("zapper-charge", "", "gameplay", note="rising crackle and a climbing 120 Hz electric buzz with a high whine")
def _():
    n = n_(0.9)
    cr = s.crackle(0.9, 300, 2500, 1.0, decay=0.0) * np.linspace(0.2, 1, n)
    f = d.expramp(n, 110, 330)
    bz = d.lp(d.saw(f, n) + d.square(f * 2.0, n) * 0.3, 1500, 1) * np.linspace(0.2, 1, n) * 0.5
    wh = d.sine(d.expramp(n, 1800, 4200), n) * np.linspace(0, 1, n) ** 2 * 0.2
    return d.sat(d.mix(cr, bz, wh, length=n), 1.5) * d.adsr(n, 0.03, 0.05, 1.0, 0.05)


@snd("zapper-bolt", "", "gameplay", note="hard electric crack + falling FM zap + 100 Hz buzz that decays + crackle")
def _():
    n = n_(0.7)
    z = s.zap(3800, 300, 0.25, 1.7, 4.0)
    bz = d.lp(d.saw(100, n) + d.saw(200.7, n) * 0.5, 2500, 1) * expdec(n, 0.25) * 0.6
    cr = s.crackle(0.6, 350, 2500, 0.9, decay=0.25)
    return d.sat(d.mix((s.click(3, 1.0, hpf=1500), 0, 1.0), (z, 0, 1.0), (bz, 0, 0.8), (cr, 0, 0.8), length=n), 1.6)


@snd("aerosol-rattle", "", "gameplay", note="ball-bearing rattle that quickens and rises, then a hissing spurt")
def _():
    n = n_(0.65)
    rt = np.zeros(n)
    t, gap = 0.0, 0.07
    while t < 0.4:
        rt = d.mix(rt, (s.bell(float(2400 + 800 * (t / 0.4)), 0.06, 0.3, 0.012) * 0.6, t, 1.0), length=n)
        t += gap
        gap = max(0.025, gap * 0.85)
    hs = s.hiss(0.25, 3000, 10000, 0.01, 0.15) * 0.6
    return d.mix(rt, (hs, 0.4, 1.0), length=n)


@snd("aerosol-blast", "", "boss", note="flash bang: short explosion + fire 'fwoomp' (falling low-passed noise) + shrapnel tings")
def _():
    n = n_(1.0)
    ex = s.explosion(0.7, 85, 4500, True, 0.2, 2.2)
    fw = d.sweep(noise(n_(0.6)), 3000, 200, "lowpass", q=0.8) * expdec(n_(0.6), 0.2) * 3
    sh = np.zeros(n)
    for k, tm in enumerate([0.15, 0.24, 0.31, 0.42]):
        sh = d.mix(sh, (s.bell(float(2800 + 400 * k), 0.12, 1.0, 0.03) * 0.35, tm, 1.0), length=n)
    return d.mix((ex, 0, 1.0), (fw, 0, 0.8), sh, length=n)


@snd("bait-ooze", "", "obstacle", note="gloopy bubbles, a wet slither and a toxic fizz")
def _():
    n = n_(0.95)
    bu = s.bubbles(0.9, 14, 30, 180, 800, 1.2)
    sl = d.bp(noise(n), 300, 1800, 1) * env(n, [(0, 0), (0.2, 0.8), (0.9, 0)]) * 1.5
    fz = s.crackle(0.8, 260, 3500, 0.5, decay=0.5)
    return d.mix((bu, 0, 1.0), (sl, 0, 0.6), (fz, 0.1, 0.7), length=n)


@snd("glue-squelch", "", "obstacle", note="pack slime squish + a sticky smack and a stretching squeak")
def _():
    n = n_(0.6)
    sl = pk(K_ + "sci-fi-sounds/Audio/slime_000", 0.5)
    sm = d.bp(noise(n_(0.05)), 600, 3500, 1) * expdec(n_(0.05), 0.01) * 3
    sq = d.sine(d.expramp(n_(0.25), 500, 1500), n_(0.25)) * expdec(n_(0.25), 0.1) * 0.3
    return d.mix((sl, 0, 0.9), (sm, 0, 0.8), (sq, 0.15, 1.0), length=n)


@snd("bleach-drip", "", "obstacle", note="water-drop plink, then a sizzling splash (falling band noise + crackle)")
def _():
    n = n_(0.65)
    dr = d.mix((s.bell(1900, 0.15, 0.1, 0.03), 0, 0.5), (d.sine(d.expramp(n_(0.1), 1300, 2400), n_(0.1)) * expdec(n_(0.1), 0.03), 0, 0.6), length=n_(0.16))
    sp = d.sweep(noise(n_(0.4)), 7000, 1500, "bandpass", q=1.2) * expdec(n_(0.4), 0.1) * 3
    fz = s.crackle(0.45, 200, 3500, 0.6, decay=0.25)
    return d.mix((dr, 0, 1.0), (sp, 0.16, 0.9), (fz, 0.17, 0.7), length=n)


@snd("frog-croak", "", "gameplay", note="'rib-bit': two voiced pulses (formant-filtered saw, AM) that fall in pitch")
def _():
    n = n_(0.8)
    out = np.zeros(n)
    for tm, f0, du in [(0.0, 150, 0.22), (0.3, 120, 0.4)]:
        m = n_(du)
        v = d.saw(d.expramp(m, f0 * 1.2, f0 * 0.8), m)
        v = d.formant(v, [320, 900, 2200], [5, 6, 8], [1.0, 0.7, 0.3])
        v = v * (0.7 + 0.3 * np.sin(2 * np.pi * 60 * np.arange(m) / SR)) * d.adsr(m, 0.02, 0.05, 0.8, 0.08)
        out = d.mix(out, (v, tm, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.8)


@snd("frog-tongue", "", "gameplay", note="wet 'thwip': rising band whoosh + sticky smack click")
def _():
    n = n_(0.3)
    w = s.whoosh(0.2, 800, 5500, peak=0.35, q=1.2, shape=1.5)
    sm = d.bp(noise(n_(0.04)), 800, 4000, 1) * expdec(n_(0.04), 0.008) * 3
    sp = s.splat(0.12, 2500, 800) * 0.4
    return d.mix((w, 0, 1.0), (sm, 0.16, 1.0), (sp, 0.16, 0.7), length=n)


@snd("repeller-hum", "", "obstacle", note="ultrasonic power-up: warbling 4-5 kHz pulse whine with rising chirps")
def _():
    n = n_(0.8)
    f = np.linspace(3800, 5200, n) * (1 + 0.03 * np.sin(2 * np.pi * 9 * np.arange(n) / SR))
    w = d.square(f, n, 0.25) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * np.arange(n) / SR)) * env(n, [(0, 0), (0.1, 1), (0.6, 1), (0.8, 0)])
    lo = d.sine(d.expramp(n, 200, 600), n) * env(n, [(0, 0), (0.1, 0.6), (0.8, 0)]) * 0.3
    ch = np.zeros(n)
    for tm in [0.25, 0.45, 0.62]:
        ch = d.mix(ch, (d.sine(d.expramp(n_(0.1), 2500, 6000), n_(0.1)) * expdec(n_(0.1), 0.04) * 0.4, tm, 1.0), length=n)
    return d.mix(w, lo, ch, length=n)


@snd("repeller-ring", "", "obstacle", note="a sonar ping: short sine chirp falling 2.6 to 1.8 kHz with a soft echo")
def _():
    m = n_(0.12)
    ch = d.sine(d.expramp(m, 2600, 1800), m) * expdec(m, 0.04) * np.minimum(1, np.arange(m) / 60)
    return d.echo(ch, 0.09, 0.4, 0.4, 2)


@snd("spraywall-puff", "", "gameplay", note="can shake rattle, then a big 'phwoomp' puff: low thump + broad dense hiss")
def _():
    n = n_(0.95)
    rt = np.zeros(n)
    for k in range(7):
        rt = d.mix(rt, (s.bell(float(2300 + 120 * (k % 3)), 0.06, 0.3, 0.012) * 0.5, 0.04 * k, 1.0), length=n)
    th = s.thump(0.25, 130, 55, tau=0.05) * 0.8
    hs = d.bp(noise(n_(0.6)), 700, 7000, 1) * env(n_(0.6), [(0, 0), (0.02, 1), (0.15, 0.7), (0.6, 0)]) * 3
    return d.mix((rt, 0, 0.8), (th, 0.3, 1.0), (hs, 0.3, 1.0), length=n)


@snd("gull-screech", "", "gameplay", note="gull call: two FM glides (rising then long falling) with vibrato and a formant")
def _():
    n = n_(0.85)
    out = np.zeros(n)
    for tm, du, pts in [(0.0, 0.3, [(0, 1700), (0.4, 3100), (1.0, 2400)]), (0.34, 0.5, [(0, 2800), (0.25, 3300), (1.0, 1400)])]:
        m = n_(du)
        f = np.interp(np.linspace(0, 1, m), [p[0] for p in pts], [p[1] for p in pts]) * (1 + 0.03 * np.sin(2 * np.pi * 30 * np.arange(m) / SR))
        v = d.fm(f, 1.0, 2.5, m)
        v = d.formant(v, [1800, 3600], [4, 6], [1.0, 0.6]) * d.adsr(m, 0.02, 0.06, 0.8, 0.12)
        out = d.mix(out, (v, tm, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.5)


@snd("hen-cluck", "", "gameplay", note="'bok-bok-bokaaak': three short formant squawks, the last longer and rising")
def _():
    n = n_(0.7)
    out = np.zeros(n)
    for tm, du, f0, f1 in [(0.0, 0.07, 500, 420), (0.12, 0.07, 520, 440), (0.26, 0.3, 480, 780)]:
        m = n_(du)
        v = d.saw(d.expramp(m, f0, f1), m)
        v = d.formant(v, [700, 1500, 2600], [5, 6, 8], [1.0, 0.6, 0.3]) * d.adsr(m, 0.005, 0.02, 0.7, 0.03)
        out = d.mix(out, (v, tm, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.6)


@snd("hen-peck", "", "gameplay", note="sharp beak peck: wood tock (pack, high-passed) + click + tiny thud")
def _():
    n = n_(0.25)
    wd = d.hp(pk(K_ + "impact-sounds/Audio/impactWood_light_001", 0.2), 400, 1)
    return d.mix((wd, 0, 1.0), (s.click(2, 0.8, hpf=2000), 0, 1.0), (s.thump(0.08, 180, 90, tau=0.02), 0, 0.6), length=n)


@snd("robovac-whir", "", "obstacle", note="small motor whir rising, brush flutter, two cheerful beeps")
def _():
    n = n_(0.9)
    f = d.expramp(n, 180, 420)
    mo = d.lp(d.saw(f, n) + d.square(f * 3.01, n) * 0.2, 2500, 1) * env(n, [(0, 0), (0.2, 0.7), (0.9, 0.5)]) * 0.6
    br = d.hp(noise(n), 2000, 1) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * np.arange(n) / SR)) * 0.25
    bp = d.mix((s.blip_stack(1200, 0.08, "square") * 0.3, 0.0, 1.0), (s.blip_stack(1600, 0.1, "square") * 0.3, 0.12, 1.0), length=n_(0.3))
    return d.mix(mo, br, (bp, 0.1, 1.0), length=n)


@snd("robovac-crack", "", "gameplay", note="plastic crack (pack light tin, high-passed) + spark crackle + falling sad beep")
def _():
    n = n_(0.5)
    pl = d.hp(pk(K_ + "impact-sounds/Audio/impactTin_medium_001", 0.25), 300, 1)
    cr = s.crackle(0.3, 300, 3000, 0.7, decay=0.12)
    bp = s.blip_stack(900, 0.25, "square", glide=0.45) * d.adsr(n_(0.25), 0.003, 0.05, 0.6, 0.1) * 0.3
    return lofi(d.mix((s.click(3, 0.8, hpf=1500), 0, 1.0), (pl, 0, 0.9), (cr, 0.02, 0.7), (bp, 0.12, 1.0), length=n), 1, drive=1.3)


@snd("boots-stomp", "", "gameplay", note="heavy boot: pack concrete footstep + low thump + a dust puff")
def _():
    n = n_(0.45)
    fs = pk(K_ + "impact-sounds/Audio/footstep_concrete_001", 0.3)
    th = s.thump(0.3, 110, 45, tau=0.07, drive=2.0)
    dust = d.lp(noise(n_(0.25)), 1200, 1) * expdec(n_(0.25), 0.07) * 1.5
    return lofi(d.mix((fs, 0, 0.9), (th, 0, 1.0), (dust, 0.03, 0.6), length=n), 1, drive=1.4)


@snd("mop-slap", "", "gameplay", note="wet slap (pack soft impact + splat), a sweeping swish and a squelch")
def _():
    n = n_(0.7)
    sl = pk(K_ + "impact-sounds/Audio/impactSoft_heavy_002", 0.25)
    sp = s.splat(0.25, 2200, 400) * 0.6
    sw = s.whoosh(0.4, 500, 2500, peak=0.5, q=0.8, color="pink") * 0.7
    return d.mix((sl, 0, 0.9), (sp, 0, 0.7), (sw, 0.18, 0.9), length=n)


@snd("lamp-flicker", "", "gameplay", note="electric ticks and a short buzz: two clicks, 100 Hz arc, crackle")
def _():
    n = n_(0.4)
    ck = d.mix((s.click(2, 1.0, hpf=1800), 0, 1.0), (s.click(2, 0.8, hpf=1800), 0.09, 1.0), length=n)
    bz = d.lp(d.saw(100, n), 2000, 1) * d.mix((np.ones(n_(0.06)), 0, 1.0), (np.ones(n_(0.07)), 0.11, 0.8), length=n) * 0.5
    cr = s.crackle(0.3, 220, 3000, 0.5, decay=0.15)
    return d.mix((ck, 0, 1.0), (bz, 0, 0.6), (cr, 0, 0.6), length=n)


@snd("lamp-snap", "", "gameplay", note="bright snap on: loud click + rising electric zap + glassy ting + mains hum swell")
def _():
    n = n_(0.5)
    zp = s.zap(1200, 4200, 0.12) * 0.7
    ti = s.bell(3000, 0.4, 1.0, 0.12) * 0.4
    hm = d.lp(d.saw(100, n), 1200, 1) * env(n, [(0, 0), (0.03, 1), (0.5, 0)]) * 0.4
    return d.sat(d.mix((s.click(3, 1.0, hpf=1200), 0, 1.0), (zp, 0, 0.8), (ti, 0, 0.8), (hm, 0, 0.7), length=n), 1.4)


@snd("wasp-buzz", "", "gameplay", note="angry insect buzz: 230 Hz saw with fast FM jitter and AM, rising as it trembles")
def _():
    n = n_(0.65)
    t = np.arange(n) / SR
    f = np.linspace(210, 300, n) * (1 + 0.06 * np.sin(2 * np.pi * 26 * t))
    b = d.lp(d.saw(f, n) + d.square(f * 2.0, n) * 0.4, 3000, 1)
    b = b * (0.65 + 0.35 * np.sin(2 * np.pi * 70 * t)) * env(n, [(0, 0), (0.05, 1), (0.5, 1), (0.65, 0)])
    wh = d.bp(noise(n), 2500, 7000, 1) * 0.15
    return d.sat(b * 0.6 + wh, 1.5)


@snd("wasp-dive", "", "gameplay", note="dive: falling buzz (doppler-ish) over a swish and a sting tick at the end")
def _():
    n = n_(0.5)
    t = np.arange(n) / SR
    f = d.expramp(n, 520, 180) * (1 + 0.05 * np.sin(2 * np.pi * 30 * t))
    b = d.lp(d.saw(f, n) + d.square(f * 2.0, n) * 0.4, 3000, 1) * (0.7 + 0.3 * np.sin(2 * np.pi * 75 * t)) * env(n, [(0, 0.2), (0.1, 1), (0.4, 0.8), (0.5, 0)])
    w = s.whoosh(0.4, 3500, 700, peak=0.3, q=1.0, shape=1.4) * 0.5
    return d.sat(d.mix((b, 0, 0.8), (w, 0, 1.0), (s.click(2, 0.6, hpf=3000), 0.42, 1.0), length=n), 1.4)


@snd("vacuum-roar", "", "gameplay", note="motor roar: brown-noise rumble + a rising 70-140 Hz saw whine + sucking mid-band whoosh")
def _():
    n = n_(1.4)
    f = np.interp(np.arange(n) / SR, [0, 0.5, 1.4], [70, 135, 125])
    mo = d.lp(d.saw(f, n) + d.saw(f * 2.01, n) * 0.5 + d.square(f * 3.0, n) * 0.2, 1800, 1)
    rb = d.lp(noise(n, "brown"), 300, 2) * 4
    su = d.bp(noise(n), 500, 3500, 1) * env(n, [(0, 0), (0.4, 0.8), (1.0, 0.6), (1.4, 0)]) * 1.5
    x = d.mix((mo, 0, 0.7), (rb, 0, 0.6), (su, 0, 0.7), length=n) * env(n, [(0, 0), (0.12, 1), (1.1, 0.9), (1.4, 0)])
    return d.sat(x, 1.5)
