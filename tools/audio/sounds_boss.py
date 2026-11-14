"""Boss fight sounds: shared VS screen / gun / reward, then Lodzia, DJ Bigos, Zlewiatan, Eksterminator."""
import numpy as np
from lib import dsp as d
from lib import synth as s
from lib.dsp import SR, n_, expdec, noise
from lib.registry import group, snd
from sounds_core import lofi, notes, K, J, drop
from sounds_milestones import fanfare, V

BO = "Bosses: shared"
K_ = K
group("boss-gun", BO, "Gun shot (pistol; boss shots + VS screen)", [("boss/pistol.ogg", "current boss-pistol")])
group("shell-casing", BO, "Shell casing drops (new)")
group("bullet-hit", BO, "Bullet hits the boss", [("boss/hurt-1.ogg", "current hurt (CC0 creature, keep?)"), ("audio/flipper.ogg", "current stand-in")])
group("bullet-ricochet", BO, "Bullet ricochets off armour", [("audio/floor-switch.ogg", "current stand-in")])
group("shot-down", BO, "Boss projectile shot down", [("boss/explosion.ogg", "current stand-in")])
group("vs-whoosh", BO, "VS screen: panel whoosh (new)")
group("vs-slam-1", BO, "VS screen: first portrait slams in", [("audio/floor-switch.ogg", "current")])
group("vs-slam-2", BO, "VS screen: second portrait slams in", [("audio/floor-switch.ogg", "current")])
group("vs-burst", BO, "VS screen: VS burst", [("boss/pistol.ogg", "current (versus shot)")])
group("vs-name", BO, "VS screen: boss name slam", [("boss/explosion.ogg", "current")])
group("ability-reward", BO, "Ability reward fanfare (icon lands + title slam)", [("audio/dash-ready.ogg", "current icon"), ("boss/explosion.ogg", "current title slam")])
group("moult-pop", BO, "Moult pop (shell crack + whoosh)", [("audio/cockroach-hiss.ogg", "current")])
group("boss-defeat", BO, "Boss defeat: explosion series", [("boss/explosion.ogg", "current")])
group("victory", BO, "Victory jingle", [("boss/victory.ogg", "current")])


@snd("boss-gun", "a", "gameplay", note="synth pistol: crack + body + short room tail")
def _():
    x = s.gun(0.32, 1.0, 190, 1.0, 0.16)
    return d.reverb(lofi(x, 1, drive=1.3), 0.18, 0.12)


@snd("boss-gun", "b", "gameplay", note="pack .22 pistol (kurt, CC0) trimmed + synth sub thump")
def _():
    g = d.load("oga-gunshots/oga-gunshots__22 Pistol.wav")
    g = d.trim(g)[:n_(0.4)]
    g = d.hp(g, 90, 1)
    th = s.thump(0.2, 130, 55, tau=0.045, drive=1.8) * 0.9
    return lofi(d.mix(g, (th, 0, 0.8)), 1, drive=1.5)


@snd("shell-casing", "", "pickup", note="three decaying metal tinks, falling interval")
def _():
    out = np.zeros(n_(0.45))
    for t, f, g in [(0.0, 5200, 1.0), (0.11, 4300, 0.6), (0.18, 5600, 0.35)]:
        out = d.mix(out, (s.bell(f, 0.2, bright=0.3, tau=0.03) * g, t, 1.0), length=n_(0.45))
    tk = d.load(K_ + "impact-sounds/Audio/impactMetal_light_004.ogg")[:n_(0.15)]
    return d.mix((out, 0, 1.0), (d.hp(tk, 2000, 1), 0.0, 0.5), length=n_(0.45))


@snd("bullet-hit", "", "boss", note="pack punch + wet thwack + metal ting")
def _():
    pu = d.load(K_ + "impact-sounds/Audio/impactPunch_medium_001.ogg")[:n_(0.35)]
    sp = s.splat(0.2, 2000, 400) * 0.5
    mt = s.bell(1500, 0.2, tau=0.05) * 0.4
    return lofi(d.mix(pu, (sp, 0, 0.8), (mt, 0, 0.6)), 1, drive=1.5)


@snd("bullet-ricochet", "", "boss", note="metal ping + falling doppler zing (FM) + hissy scrape")
def _():
    n = n_(0.5)
    f = d.expramp(n, 4200, 1400) * (1 + 0.02 * np.sin(2 * np.pi * 40 * np.arange(n) / SR))
    z = d.fm(f, 1.41, 1.2, n) * expdec(n, 0.12) * 0.6
    mt = d.load(K_ + "impact-sounds/Audio/impactMetal_light_001.ogg")[:n_(0.4)]
    sc = s.whoosh(0.12, 3000, 9000, peak=0.2, q=1.5) * 0.5
    return lofi(d.mix((z, 0.01, 1.0), (mt, 0, 0.8), (sc, 0, 0.8), length=n), 1, drive=1.3)


@snd("shot-down", "", "boss", note="small bright pop-burst: crack + sparkle fragments + low pop")
def _():
    n = n_(0.4)
    c = s.click(5, 1.0, hpf=900)
    fr = s.crackle(0.3, 260, 3000, 0.7, decay=0.07)
    z = s.zap(2400, 300, 0.12) * 0.6
    th = s.thump(0.2, 200, 70, tau=0.05)
    x = d.mix((c, 0, 1.0), (fr, 0.01, 1.0), (z, 0, 0.7), (th, 0, 0.9), length=n)
    return d.reverb(lofi(x, 1, drive=1.6), 0.2, 0.12)


@snd("vs-whoosh", "", "boss", note="wide rising-then-falling whoosh with low body")
def _():
    w = s.whoosh(0.55, 250, 5500, peak=0.5, q=0.9, shape=1.6)
    lo = s.whoosh(0.55, 90, 700, peak=0.5, q=1.0, color="pink") * 0.7
    return d.sat(d.mix(w, lo), 1.5)


def slam(f0, bump=1.0, metal="impactMetal_heavy_001", rum=0.7, sec=0.7):
    n = n_(sec)
    th = s.thump(0.6, f0, f0 * 0.38, tau=0.14, drive=2.2)
    mt = d.load(K_ + f"impact-sounds/Audio/{metal}.ogg")[:n_(0.6)]
    rb = s.rumble(0.6, f0 * 0.5, 0.01, 0.4) * rum
    c = s.click(4, 0.8, hpf=800)
    return d.reverb(d.mix((th, 0, 1.0), (mt, 0, 0.8 * bump), (rb, 0, 0.6), (c, 0, 0.8), length=n), 0.35, 0.18)


@snd("vs-slam-1", "", "big", note="heavy thump + pack heavy metal hit + rumble")
def _():
    return slam(110, 1.0, "impactMetal_heavy_001")


@snd("vs-slam-2", "", "big", note="same family, lower and plate-heavy so the second slam sounds distinct")
def _():
    return slam(85, 0.8, "impactPlate_heavy_002", 0.9)


@snd("vs-burst", "", "big", note="reverse-crash riser into a flash boom, bright sparkle")
def _():
    n = n_(0.8)
    rs = d.rev(s.crash(0.45, 4500))
    boom = s.explosion(0.6, 85, 5000, True, 0.3, 2.0)
    sp = np.zeros(n)
    for i, m in enumerate([96, 103, 108]):
        sp = d.mix(sp, (s.bell(float(s.mtof(m)), 0.3, tau=0.1), 0.45 + 0.04 * i, 0.3), length=n)
    return d.mix((rs, 0, 0.8), (boom, 0.44, 1.0), (sp, 0, 1.0), length=n)


@snd("vs-name", "", "big", note="big impact + explosion tail + metallic bell hit")
def _():
    ex = s.explosion(0.9, 70, 4500, True, 0.5, 2.5)
    sl = slam(95, 0.6, "impactMetal_heavy_003", 0.5)
    b = s.bell(float(s.mtof(55)), 0.8, tau=0.4) * 0.5
    return d.mix((ex, 0, 1.0), (sl, 0, 0.8), (b, 0, 0.6), length=n_(1.1))


@snd("ability-reward", "", "stinger", lufs=-15.5, note="chip fanfare: run, big chord, bass kick, crash, sparkle (reuses the milestone fanfare builder)")
def _():
    return fanfare(1.3, [72, 76, 79, 84, 88], 0.06, [79, 84, 88, 91], chord_t=0.3, hold=0.85, bass=43, kick=True,
                   crash=0.6, sparkle=6, saw=True, verb=0.3)


@snd("moult-pop", "", "boss", note="pack glass crack + crunch + upward whoosh + pop")
def _():
    gl = d.load(K_ + "impact-sounds/Audio/impactGlass_light_004.ogg")[:n_(0.3)]
    cr = s.crackle(0.25, 300, 2000, 0.8, decay=0.06)
    w = s.whoosh(0.35, 400, 5000, peak=0.35, q=1.0) * 0.8
    pop = s.thump(0.1, 300, 100, tau=0.02, drive=1.5)
    return lofi(d.mix((gl, 0, 0.9), (cr, 0, 0.8), (w, 0.08, 0.7), (pop, 0.05, 0.8), length=n_(0.55)), 1)


@snd("boss-defeat", "", "big", note="series of 5 explosions (descending pitch, spacing grows), last one huge with sub + debris")
def _():
    n = n_(2.4)
    layers = []
    for i, (t, g, lo, br) in enumerate([(0.0, 0.7, 110, 5000), (0.28, 0.75, 95, 4500), (0.58, 0.85, 85, 4200), (0.95, 0.9, 75, 3800)]):
        layers.append((s.explosion(0.7, lo, br, True, 0.0, 2.2), t, g))
    big = s.explosion(1.4, 55, 3500, True, 0.7, 2.8)
    layers.append((big, 1.4, 1.2))
    cr = s.crackle(1.6, 120, 1500, 0.4, decay=0.6)
    layers.append((cr, 1.45, 1.0))
    return d.mix(*layers, length=n)


@snd("victory", "", "stinger", lufs=-15.0, note="original ~3 s major jingle: melody over bass, snare fills, crash, sparkle (not any known tune)")
def _():
    n = n_(3.0)
    mel = [(72, 0.0, 0.14), (76, 0.15, 0.14), (79, 0.3, 0.14), (84, 0.45, 0.30), (79, 0.8, 0.14), (84, 0.95, 0.55),
           (81, 1.6, 0.14), (84, 1.75, 0.14), (88, 1.9, 0.14), (91, 2.05, 0.8)]
    layers = [(V(m, du * 1.2, 0.25, sus=0.6, rel=0.1), t, 0.8) for m, t, du in mel]
    layers += [(V(m + 12, du, 0.5, sub=0.1), t, 0.25) for m, t, du in mel]
    for t, m in [(0.0, 48), (0.45, 53), (0.95, 55), (1.6, 53), (2.05, 48)]:
        layers.append((s.pulse_voice(float(s.mtof(m)), 0.4 if t < 2 else 0.9, 0.5, 0.002, 0.08, 0.7, 0.15, sub=0.8), t, 0.6))
        layers.append((s.kick(0.22, 150, 48), t, 0.8))
    for t in [0.3, 0.75, 1.45, 1.9]:
        layers.append((s.snare(0.14), t, 0.6))
    layers.append((s.crash(1.0), 2.05, 0.5))
    for i, m in enumerate([100, 103, 108, 103, 100, 96]):
        layers.append((s.bell(float(s.mtof(m)), 0.4, tau=0.15), 2.1 + 0.07 * i, 0.22))
    x = d.crush(d.sat(d.mix(*layers, length=n), 1.4), 2)
    return d.reverb(d.lp(x, 8500, 1), 0.3, 0.14, tail=0.1)[:n]


# =========================================================================== LODZIA
LO = "Boss: Lodzia"
group("lodzia-whoosh", LO, "Slipper whoosh (the wind-up)", [("audio/newspaper.ogg", "current stand-in")])
group("lodzia-slap", LO, "Slipper slap on the floor/player", [("audio/flipper.ogg", "current stand-in")])
group("lodzia-shockwave", LO, "Lane shockwave rumble", [("audio/bison.ogg", "current stand-in (stamp)")])
group("lodzia-pocket", LO, "Rummages in her pocket", [("audio/huh.ogg", "current stand-in")])
group("lodzia-spin", LO, "Thrown slipper spinning past", [("audio/newspaper.ogg", "current stand-in (throw)")])
group("lodzia-boomerang", LO, "Slipper ricochets back like a boomerang", [("audio/floor-switch.ogg", "current stand-in")])
group("lodzia-smack", LO, "Slipper smacks her in the face", [("audio/flipper.ogg", "current stand-in")])
group("lodzia-stomp", LO, "Stomp", [("audio/bison.ogg", "current stand-in")])
group("lodzia-curler", LO, "Hair curler bounces (new)")


@snd("lodzia-whoosh", "", "boss", note="mid whoosh with cloth flutter")
def _():
    w = s.whoosh(0.4, 600, 4200, peak=0.55, q=0.8)
    cl = d.load(K_ + "rpg-audio/Audio/cloth3.ogg")[:n_(0.3)]
    return d.mix(w, (cl, 0.05, 0.4))


@snd("lodzia-slap", "", "boss", note="rubbery slap: noise snap + pack soft-heavy impact + thump")
def _():
    sn = d.bp(noise(n_(0.1)), 1200, 6000, 1) * expdec(n_(0.1), 0.02) * 3
    sf = d.load(K_ + "impact-sounds/Audio/impactSoft_heavy_001.ogg")[:n_(0.3)]
    th = s.thump(0.18, 160, 70, tau=0.04) * 0.8
    return lofi(d.mix((sn, 0, 1.0), (sf, 0, 0.9), (th, 0, 1.0), length=n_(0.3)), 1, drive=1.5)


@snd("lodzia-shockwave", "", "boss", note="low rumble with a wobbling crack and rolling debris")
def _():
    r = s.rumble(1.1, 48, 0.03, 0.5, wob=0.04)
    cr = s.crackle(1.0, 90, 600, 0.5, decay=0.4)
    t = s.thump(0.4, 80, 32, tau=0.12)
    return d.sat(d.mix(r, (cr, 0.05, 0.7), (t, 0, 1.0), length=n_(1.1)), 1.5)


@snd("lodzia-pocket", "", "obstacle", note="pack leather/cloth rustle + keys jingle")
def _():
    a = d.load(K_ + "rpg-audio/Audio/handleSmallLeather.ogg")[:n_(0.5)]
    b = d.load(K_ + "rpg-audio/Audio/cloth1.ogg")[:n_(0.4)]
    k = d.load("oga-100-metal-wood/keys_03.ogg")[:n_(0.4)]
    return d.mix((a, 0, 1.0), (b, 0.25, 0.8), (k, 0.35, 0.6))


@snd("lodzia-spin", "", "boss", note="fluttering rotor whoosh: AM sweeping 13-19 Hz with a doppler pass (rising then falling band)")
def _():
    from scipy import signal
    n = n_(0.8)
    z = noise(n)
    f = np.interp(np.linspace(0, 1, n), [0, 0.5, 1], [900, 3800, 800])
    out = np.zeros(n)
    blk = 128
    for i in range(0, n, blk):
        fc = float(f[i])
        sos = signal.butter(2, [fc * 0.6 / (SR / 2), min(fc * 1.5, 20000) / (SR / 2)], "bandpass", output="sos")
        out[i:i + blk] = signal.sosfilt(sos, z[i:i + blk])
    d.REC.log("block bandpass sweep 900->3800->800")
    am = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(np.linspace(13, 19, n)) / SR)
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out * am ** 1.5 * env * 6


@snd("lodzia-boomerang", "", "boss", note="ping then rising boing-back + whoosh in reverse direction")
def _():
    n = n_(0.7)
    mt = d.load(K_ + "impact-sounds/Audio/impactMetal_light_003.ogg")[:n_(0.3)]
    f = np.concatenate([d.expramp(n_(0.12), 900, 400), d.expramp(n - n_(0.12), 400, 1600)])
    bo = d.fm(f, 1.0, 2.0, n) * d.adsr(n, 0.002, 0.1, 0.4, 0.3) * 0.5
    w = s.whoosh(0.5, 400, 4500, peak=0.7, q=0.9) * 0.6
    return lofi(d.mix((mt, 0, 0.9), (bo, 0.02, 0.8), (w, 0.15, 0.7), length=n), 1, drive=1.3)


@snd("lodzia-smack", "", "big", note="meaty face smack: pack punch + slap + cartoon boing + star ping")
def _():
    pu = d.load(K_ + "impact-sounds/Audio/impactPunch_heavy_001.ogg")[:n_(0.4)]
    sn = d.bp(noise(n_(0.1)), 1500, 7000, 1) * expdec(n_(0.1), 0.02) * 3
    n = n_(0.35)
    bo = d.sine(d.expramp(n, 500, 180) * (1 + 0.05 * np.sin(2 * np.pi * 18 * np.arange(n) / SR)), n) * expdec(n, 0.12) * 0.5
    st = s.bell(float(s.mtof(96)), 0.3, tau=0.12) * 0.3
    return lofi(d.mix((pu, 0, 1.0), (sn, 0, 0.9), (bo, 0.05, 0.8), (st, 0.12, 1.0), length=n_(0.5)), 1, drive=1.5)


@snd("lodzia-stomp", "", "big", note="plate-heavy pack impact + deep thump + floor rumble")
def _():
    pl = d.load(K_ + "impact-sounds/Audio/impactPlate_heavy_003.ogg")[:n_(0.5)]
    th = s.thump(0.5, 80, 32, tau=0.12, drive=2.4)
    rb = s.rumble(0.6, 45, 0.01, 0.4) * 0.6
    return d.sat(d.mix((pl, 0, 0.7), (th, 0, 1.0), (rb, 0.03, 0.6), length=n_(0.65)), 1.3)


@snd("lodzia-curler", "", "pickup", note="hollow plastic bounces: two clacks with pitch drop + plink")
def _():
    layers = []
    for t, f, g in [(0.0, 900, 1.0), (0.14, 780, 0.7), (0.24, 660, 0.45), (0.31, 580, 0.25)]:
        n = n_(0.08)
        layers.append((d.sine(d.expramp(n, f * 1.4, f), n) * expdec(n, 0.02), t, g))
        layers.append((s.click(2, 0.5, hpf=1800), t, g))
    pk = d.load(K_ + "casino-audio/Audio/die-throw-2.ogg")[:n_(0.2)]
    return lofi(d.mix(*layers, (d.pitch(pk, 1.3), 0, 0.5), length=n_(0.45)), 1)


# =========================================================================== DJ BIGOS
BI = "Boss: DJ Bigos"
group("bigos-thump", BI, "Speaker thump (kick)", [("audio/flipper.ogg", "current stand-in (bonk)")])
group("bigos-charge", BI, "Charge-up before the blast (new)")
group("bigos-blast", BI, "Bass blast", [("boss/bomb-shot.ogg", "current stand-in")])
group("bigos-beam", BI, "Light beam hum (loops)", [("audio/disco.ogg", "current stand-in")])
group("bigos-wreck", BI, "Speaker wreck", [("boss/explosion.ogg", "current stand-in")])
group("bigos-scratch", BI, "Record scratch (new)")


@snd("bigos-thump", "", "boss", note="speaker-cone kick: fast pitch drop sine + paper-cone slap")
def _():
    k = s.kick(0.3, 100, 38, 2.6, 0.4, 0.09)
    sl = d.bp(noise(n_(0.05)), 300, 1800, 1) * expdec(n_(0.05), 0.01) * 2
    return d.mix(k, (sl, 0, 0.5))


@snd("bigos-charge", "", "boss", note="rising saw/FM whine with accelerating tremolo + noise swell")
def _():
    n = n_(0.95)
    f = d.expramp(n, 90, 1500)
    x = (d.saw(f, n) * 0.5 + d.fm(f, 2.0, 2.0, n) * 0.4)
    x = d.sweep(x, 300, 6000, "lowpass", q=2.0)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(6, 34, n)) / SR)
    x = x * lfo * np.linspace(0.2, 1, n) ** 1.3
    nz = d.hp(noise(n), 2500, 1) * np.linspace(0, 1, n) ** 2 * 0.3
    return d.sat(x + nz, 1.4) * d.adsr(n, 0.02, 0.05, 1.0, 0.03)


@snd("bigos-blast", "", "big", note="sub drop + folded square + falling sweep + noise burst")
def _():
    n = n_(0.9)
    sub = d.sine(d.expramp(n, 120, 28), n) * expdec(n, 0.35)
    fz = d.fold(d.square(d.expramp(n, 400, 40), n) * 0.5 * expdec(n, 0.18), 2.5)
    nz = d.lp(noise(n), 3000, 1) * expdec(n, 0.12)
    c = s.click(4, 0.8, hpf=600)
    x = sub * 1.2 + fz * 0.5 + nz * 0.8
    x[:len(c)] += c[:n]
    return d.reverb(d.sat(x, 2.0), 0.4, 0.15)


@snd("bigos-beam", "", "loop", loop=True, note="seamless 1.0 s hum: 100 Hz harmonic stack + wavering 400 Hz + shimmer, all integer-cycle")
def _():
    n = n_(1.0)
    t = np.arange(n) / n
    x = np.zeros(n)
    for h, a in [(100, 1.0), (200, 0.7), (300, 0.5), (400, 0.4), (600, 0.2)]:
        x += a * np.sin(2 * np.pi * (h * t + 0.02 * np.sin(2 * np.pi * 3 * t)))
    x += 0.35 * np.sin(2 * np.pi * (1204 * t + 3.0 * np.sin(2 * np.pi * 4 * t)))
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 8 * t)
    x = np.tanh(x * 1.2)
    x += s.circular_noise(1.0, 1500, 6000) * 0.1
    d.REC.log("integer-cycle loop (no crossfade)")
    return x


@snd("bigos-wreck", "", "big", note="metal crash + explosion + falling power-down sweep + rattle")
def _():
    mt = d.load(K_ + "impact-sounds/Audio/impactMetal_heavy_002.ogg")[:n_(0.8)]
    ex = s.explosion(1.0, 65, 3800, True, 0.4, 2.2)
    n = n_(1.1)
    pd = d.saw(d.expramp(n, 500, 40), n) * np.linspace(1, 0, n) ** 1.5 * 0.4
    pd = d.lp(pd, 1200, 1)
    ra = np.zeros(n)
    for k in range(7):
        ra = d.mix(ra, (s.bell(float(220 + 90 * k), 0.12, bright=1.5, tau=0.04) * 0.3, 0.2 + 0.09 * k, 1.0), length=n)
    return d.mix((mt, 0, 0.8), (ex, 0, 1.0), (pd, 0.1, 0.8), (ra, 0, 0.6), length=n)


@snd("bigos-scratch", "a", "boss", note="synth scratch: record loop played back with a fast forward/back rate wobble")
def _():
    n = n_(0.6)
    src = d.mix(d.saw(110, n_(0.6)) * 0.4, d.lp(noise(n_(0.6)), 3000, 1) * 0.6, length=n_(0.6))
    src *= (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 13 * np.arange(len(src)) / SR)))
    rate = np.concatenate([np.linspace(2.5, -2.0, n_(0.14)), np.linspace(-2.0, 2.0, n_(0.1)), np.linspace(2.0, -1.5, n_(0.14)),
                           np.linspace(-1.5, 1.2, n_(0.22))])
    pos = np.abs(np.cumsum(rate) * 1.0) % (len(src) - 2)
    y = np.interp(pos, np.arange(len(src)), src)
    y = d.hp(y, 150, 1) * d.adsr(len(y), 0.004, 0.05, 0.9, 0.06)
    d.REC.log("rate-wobble playback")
    return d.sat(y * 2.0, 1.6)


@snd("bigos-scratch", "b", "boss", note="Kenney interface scratch pack sound, pitched down + thump so it reads as a record")
def _():
    sc = d.load(K_ + "interface-sounds/Audio/scratch_003.ogg")
    sc = d.trim(sc)[:n_(0.6)]
    sc = d.pitch(sc, 0.8)
    return d.sat(d.mix(sc, (s.thump(0.12, 120, 60, tau=0.03), 0, 0.5)), 1.3)


# =========================================================================== ZLEWIATAN
ZL = "Boss: Zlewiatan"
group("zl-gurgle", ZL, "Drain gurgle rises (the boss appears)")
group("zl-creak", ZL, "Pipe creak")
group("zl-slab-launch", ZL, "Concrete slab launched", [("boss/bomb-shot.ogg", "current stand-in (slab shot)")])
group("zl-slab-impact", ZL, "Concrete slab lands (new)")
group("zl-radiator", ZL, "Radiator clang")
group("zl-spit", ZL, "Sizzling, crackling spit", [("boss/creamcake-shot.ogg", "current stand-in")])
group("zl-splat", ZL, "Sour-cream splat", [("boss/creamcake-shot.ogg", "current stand-in")])
group("zl-fishbone", ZL, "Fishbone flick", [("boss/creamcake-shot.ogg", "current stand-in (carp head)")])
group("zl-bubble-blow", ZL, "Bubble blown up")
group("zl-bubble-pop", ZL, "Bubble pops")
group("zl-roar", ZL, "Rage roar + steam", [("boss/boss-cue-1.ogg", "current cue (CC0 creature)")])
group("zl-drain-away", ZL, "Drain-away (boss sinks out)")


@snd("zl-gurgle", "", "boss", note="bubbles that get denser and higher + low glug sweep + wet noise")
def _():
    n = n_(1.4)
    b = s.bubbles(1.4, 14, 60, 180, 900)
    lg = d.sweep(noise(n, "pink"), 200, 900, "lowpass", q=2.0) * np.linspace(0.1, 0.6, n)
    return d.sat(d.mix((b, 0, 1.0), (lg, 0, 0.5), length=n), 1.3)


@snd("zl-creak", "", "boss", note="pack door creak pitched down + low metal groan (formant saw)")
def _():
    c = d.load(K_ + "rpg-audio/Audio/creak2.ogg")
    c = d.pitch(d.trim(c)[:n_(1.2)], 0.8)
    n = len(c)
    f = np.interp(np.linspace(0, 1, n), [0, 0.3, 0.7, 1], [90, 130, 100, 75])
    g = d.formant(d.saw(f, n), [300, 800, 1700], [8, 8, 9], [1, 0.6, 0.3]) * d.adsr(n, 0.1, 0.1, 0.7, 0.3) * 0.5
    return d.mix(c, (g, 0, 0.6))


@snd("zl-slab-launch", "", "boss", note="whoosh + low thud + stone grinding")
def _():
    w = s.whoosh(0.45, 200, 2500, peak=0.3, q=0.8, color="pink")
    t = s.thump(0.3, 90, 40, tau=0.08)
    g = d.lp(noise(n_(0.4), "pink"), 900, 1) * expdec(n_(0.4), 0.12) * 0.8
    return d.sat(d.mix(w, (t, 0, 1.0), (g, 0, 0.8), length=n_(0.5)), 1.4)


@snd("zl-slab-impact", "", "big", note="pack rock hit + falling debris + sub thump + dust")
def _():
    r = d.load("oga-75-breaking-hit/bfh1_rock_hit_01.ogg")[:n_(0.7)]
    fl = d.load("oga-75-breaking-hit/bfh1_rock_falling_03.ogg")[:n_(0.7)]
    th = s.thump(0.5, 70, 30, tau=0.12, drive=2.4)
    return d.reverb(d.mix((r, 0, 0.9), (fl, 0.1, 0.5), (th, 0, 1.0), length=n_(0.9)), 0.3, 0.12)


@snd("zl-radiator", "", "boss", note="heavy pack metal clang + hollow inharmonic ring at ~310 Hz")
def _():
    mt = d.load(K_ + "impact-sounds/Audio/impactMetal_heavy_004.ogg")[:n_(0.8)]
    rg = s.bell(310, 1.0, bright=1.0, tau=0.5) * 0.5
    return d.reverb(d.mix(mt, (rg, 0.0, 0.7)), 0.3, 0.15)


@snd("zl-spit", "", "boss", note="wet sizzle: dense crackle over hiss + pops")
def _():
    n = n_(0.8)
    cr = s.crackle(0.8, 420, 2500, 1.0, decay=0.3)
    h = s.hiss(0.7, 3000, 9000, 0.01, 0.4) * 0.5
    pp = s.bubbles(0.6, 30, 10, 500, 1800) * 0.4
    return d.sat(d.mix((cr, 0, 1.0), (h, 0, 1.0), (pp, 0.05, 1.0), length=n), 1.5)


@snd("zl-splat", "", "boss", note="pack squish-splat + synth splat + fat low plop")
def _():
    sq = d.load("oga-squish/oga-squish__squish_04.mp3")[:n_(0.45)]
    sp = s.splat(0.35, 2200, 280)
    return lofi(d.mix((sq, 0, 0.9), (sp, 0, 0.7), length=n_(0.5)), 1, drive=1.4)


@snd("zl-fishbone", "", "pickup", note="sharp flick: ping tick + tiny whistle whoosh")
def _():
    c = s.click(2, 0.9, hpf=3000)
    w = s.whoosh(0.1, 2000, 9000, peak=0.2, q=1.4) * 0.6
    pg = s.bell(2600, 0.2, bright=0.4, tau=0.04) * 0.4
    return d.mix((c, 0, 1.0), (w, 0, 1.0), (pg, 0.01, 1.0), length=n_(0.22))


@snd("zl-bubble-blow", "", "boss", note="inflating: slowing rising bubble blips + soft breath noise")
def _():
    n = n_(0.8)
    out = np.zeros(n)
    for k, t in enumerate(np.cumsum([0.0, 0.07, 0.09, 0.12, 0.15, 0.19])):
        w = n_(0.09)
        f = 300 + 120 * k
        out = d.mix(out, (d.sine(d.expramp(w, f, f * 1.8), w) * expdec(w, 0.04) * 0.8, float(t), 1.0), length=n)
    br = d.lp(noise(n), 1800, 1) * np.linspace(0.2, 1, n) * d.adsr(n, 0.05, 0.1, 0.9, 0.15) * 0.4
    return d.mix(out, br, length=n)


@snd("zl-bubble-pop", "", "boss", note="short click + resonant pop + wet burst")
def _():
    n = n_(0.25)
    pp = d.sine(d.expramp(n, 1500, 380), n) * expdec(n, 0.025)
    c = s.click(3, 0.8, hpf=1500)
    sp = d.bp(noise(n), 1500, 6000, 1) * expdec(n, 0.05) * 1.5
    return lofi(d.mix(pp, (c, 0, 1.0), (sp, 0.005, 0.7), length=n), 1, drive=1.4)


@snd("zl-roar", "", "big", note="pack creature roar pitched down + saw growl + steam hiss")
def _():
    r = d.load("oga-80-creature/roar_02.ogg")
    r = d.pitch(d.trim(r), 0.75)
    n = len(r)
    gr = d.formant(d.saw(np.full(n, 65.0) * (1 + 0.1 * np.sin(2 * np.pi * 9 * np.arange(n) / SR)), n),
                   [350, 700, 1500], [4, 5, 6], [1, 0.8, 0.3]) * d.adsr(n, 0.05, 0.1, 0.8, 0.3) * 0.5
    st = s.hiss(n / SR, 3500, 11000, 0.2, 0.4) * 0.5
    return d.sat(d.mix((r, 0, 1.0), (gr, 0, 0.6), (st, 0.15, 0.8)), 1.4)


@snd("zl-drain-away", "", "boss", note="falling gurgle: bubbles thinning out, descending swirl, final glug")
def _():
    n = n_(1.7)
    b = s.bubbles(1.7, 55, 8, 250, 900)
    sw = d.sweep(noise(n, "pink"), 1400, 160, "bandpass", q=2.5) * np.linspace(1, 0.1, n) ** 0.7 * 2
    last = drop(260, 0.15, up=False) * 0.9
    return d.sat(d.mix((b, 0, 1.0), (sw, 0, 0.6), (last, 1.5, 1.0), length=n), 1.3)


# =========================================================================== EKSTERMINATOR
EK = "Boss: Eksterminator"
group("ex-pump", EK, "Pump stroke", [("audio/floor-switch.ogg", "current stand-in")])
group("ex-pressure", EK, "Pressure hiss", [("audio/spray.ogg", "current")])
group("ex-stream", EK, "Spray stream (loops, seamless ~1 s)", [("audio/spray.ogg", "current")])
group("ex-lob", EK, "Canister lobbed", [("audio/newspaper.ogg", "current stand-in (throw)")])
group("ex-canister-pop", EK, "Canister pops", [("boss/creamcake-shot.ogg", "current stand-in (splat)")])
group("ex-gas", EK, "Gas cloud hiss (loops, seamless)")
group("ex-tank-ping", EK, "Tank ping", [("audio/floor-switch.ogg", "current stand-in")])
group("ex-tank-vent", EK, "Tank vents", [("audio/cockroach-hiss.ogg", "current stand-in")])
group("ex-tank-burst", EK, "Tank bursts", [("boss/explosion.ogg", "current stand-in")])
group("ex-mask", EK, "Mask breath (new)")


@snd("ex-pump", "", "boss", note="pneumatic stroke: mechanical clack + short hiss + low push")
def _():
    ck = d.load(K_ + "rpg-audio/Audio/metalLatch.ogg")[:n_(0.12)]
    h = s.hiss(0.25, 2500, 9000, 0.01, 0.15) * 0.5
    t = s.thump(0.22, 120, 55, tau=0.05)
    return d.mix((ck, 0, 0.8), (h, 0.06, 1.0), (t, 0.04, 0.8), length=n_(0.35))


@snd("ex-pressure", "", "boss", note="sharp release then settling high-pressure hiss with whistle edge")
def _():
    n = n_(0.8)
    h = s.hiss(0.8, 3500, 13000, 0.003, 0.4)
    h *= 0.5 + 0.5 * expdec(n, 0.25)
    wh = d.sine(5200, n) * expdec(n, 0.2) * 0.04
    return d.mix(h, wh, length=n)


@snd("ex-stream", "", "loop", loop=True, note="seamless 1 s stream: periodic band noise 2.5-11 kHz + fluttering mid, no crossfade")
def _():
    n = n_(1.0)
    z = s.circular_noise(1.0, 2500, 11000)
    mid = s.circular_noise(1.0, 400, 3200) * (0.55 + 0.25 * s.periodic_lfo(n, 11))
    x = z * (0.75 + 0.25 * s.periodic_lfo(n, 23, 0.3)) + mid * 0.5
    d.REC.log("periodic synthesis (loops with no seam)")
    return x


@snd("ex-lob", "", "boss", note="soft upward whoosh, can rattle, arc whoosh back down")
def _():
    w = s.whoosh(0.5, 400, 2500, peak=0.4, q=0.8) * 0.8
    rt = d.load("oga-100-metal-wood/metal_spring_01.ogg")[:n_(0.3)]
    tk = d.load(K_ + "impact-sounds/Audio/impactTin_medium_001.ogg")[:n_(0.2)]
    return d.mix((w, 0, 1.0), (d.pitch(rt, 1.2), 0.0, 0.4), (tk, 0.02, 0.5), length=n_(0.55))


@snd("ex-canister-pop", "", "boss", note="tin pop + gas puff + fizz")
def _():
    tk = d.load(K_ + "impact-sounds/Audio/impactTin_medium_003.ogg")[:n_(0.25)]
    pf = s.hiss(0.3, 2000, 9000, 0.004, 0.2) * 0.6
    pop = s.thump(0.1, 350, 120, tau=0.02, drive=1.5)
    return d.mix((tk, 0, 0.7), (pf, 0.01, 1.0), (pop, 0, 0.9), length=n_(0.4))


@snd("ex-gas", "", "loop", loop=True, note="seamless 1.5 s soft low-mid hiss with slow billow + faint bubbles")
def _():
    n = n_(1.5)
    z = s.circular_noise(1.5, 700, 4500)
    x = z * (0.6 + 0.4 * s.periodic_lfo(n, 2)) * (0.8 + 0.2 * s.periodic_lfo(n, 7, 0.4))
    x += d.sweep(s.circular_noise(1.5, 150, 600), 600, 600, "lowpass") * 0.25
    return x


@snd("ex-tank-ping", "", "boss", note="resonant metal tank ping + hollow body")
def _():
    pg = s.bell(1250, 0.7, bright=0.8, tau=0.25)
    bd = s.bell(210, 0.5, bright=0.5, tau=0.15) * 0.6
    mt = d.load(K_ + "impact-sounds/Audio/impactMetal_medium_001.ogg")[:n_(0.4)]
    return d.reverb(d.mix(pg, (bd, 0, 1.0), (mt, 0, 0.5)), 0.3, 0.15)


@snd("ex-tank-vent", "", "boss", note="valve clunk + long steam hiss that decays + low whoosh")
def _():
    n = n_(1.0)
    ck = d.load(K_ + "rpg-audio/Audio/metalLatch.ogg")[:n_(0.12)]
    h = s.hiss(0.9, 2500, 11000, 0.02, 0.5) * np.concatenate([np.ones(n_(0.2)), expdec(n_(0.8), 0.35)])[:n_(0.9)] * 0.9
    lo = s.whoosh(0.8, 120, 500, peak=0.2, q=0.8, color="pink") * 0.4
    return d.mix((ck, 0, 0.8), (h, 0.05, 1.0), (lo, 0.05, 1.0), length=n)


@snd("ex-tank-burst", "", "big", note="metal tear + explosion + steam blast")
def _():
    mt = d.load("oga-100-metal-wood/metal_slam_01.ogg")[:n_(0.8)]
    ex = s.explosion(1.1, 60, 4200, True, 0.45, 2.3)
    st = s.hiss(1.0, 2500, 11000, 0.05, 0.6) * 0.5
    return d.mix((mt, 0, 0.8), (ex, 0.02, 1.0), (st, 0.15, 0.8), length=n_(1.3))


@snd("ex-mask", "", "pickup", note="respirator: filtered noise inhale then exhale, valve clicks, faint wheeze")
def _():
    n = n_(1.1)
    ph = np.zeros(n)
    inh = d.sweep(noise(n_(0.45)), 500, 1800, "bandpass", q=1.0) * np.sin(np.pi * np.linspace(0, 1, n_(0.45))) ** 1.2
    exh = d.sweep(noise(n_(0.5)), 1500, 500, "bandpass", q=1.0) * np.sin(np.pi * np.linspace(0, 1, n_(0.5))) ** 1.2
    v1, v2 = s.click(3, 0.5, hpf=1200), s.click(3, 0.4, hpf=900)
    wz = d.sine(np.linspace(1500, 1250, n_(0.5)), n_(0.5)) * np.sin(np.pi * np.linspace(0, 1, n_(0.5))) * 0.03
    bed = d.lp(noise(n, "pink"), 1500, 1) * 0.02
    return d.mix((inh, 0, 2.2), (exh, 0.58, 2.0), (v1, 0.0, 0.6), (v2, 0.55, 0.6), (wz, 0.58, 1.0), (bed, 0, 1.0), length=n)


# =========================================================================== pack-explosion alternates (b variants)
def pboom(name, ratio=1.0, dur=None, gain=1.0):
    x = d.load(K_ + f"sci-fi-sounds/Audio/{name}.ogg")
    x = d.pitch(x, ratio) if ratio != 1.0 else x
    return (x[:n_(dur)] if dur else x) * gain


@snd("boss-defeat", "b", "big", note="pack series: Kenney explosionCrunch hits (pitched down each time) then a big crunch + low-frequency boom")
def _():
    n = n_(2.4)
    layers = [(pboom("explosionCrunch_000", 1.05, 0.7), 0.0, 0.8), (pboom("explosionCrunch_001", 0.95, 0.8), 0.28, 0.85),
              (pboom("explosionCrunch_003", 0.9, 0.8), 0.6, 0.9), (pboom("explosionCrunch_000", 0.8, 0.8), 0.95, 0.9),
              (pboom("explosionCrunch_001", 0.72, 1.5), 1.4, 1.1), (pboom("lowFrequency_explosion_000", 1.0, 1.0), 1.4, 1.0),
              (s.crackle(1.2, 120, 1500, 0.4, decay=0.5), 1.5, 1.0)]
    return d.mix(*layers, length=n)


@snd("vs-name", "b", "big", note="pack: Kenney explosionCrunch + low-frequency boom + heavy metal hit")
def _():
    sl = d.load(K_ + "impact-sounds/Audio/impactMetal_heavy_003.ogg")[:n_(0.7)]
    return d.mix((pboom("explosionCrunch_001", 0.9, 1.1), 0, 1.0), (pboom("lowFrequency_explosion_001", 1.0, 1.0), 0, 0.9),
                 (sl, 0, 0.6), length=n_(1.15))


@snd("bigos-blast", "b", "big", note="pack: Kenney lowFrequency_explosion + synth sub drop + fold")
def _():
    n = n_(0.9)
    lf = pboom("lowFrequency_explosion_001", 1.0, 0.9)
    fz = d.fold(d.square(d.expramp(n, 400, 40), n) * 0.5 * expdec(n, 0.18), 2.5) * 0.4
    return d.sat(d.mix((lf, 0, 1.0), (fz, 0, 1.0), (s.click(4, 0.7, hpf=600), 0, 1.0), length=n), 1.5)


@snd("shot-down", "b", "boss", note="pack: Kenney explosionCrunch_000 pitched up and clipped short + zap")
def _():
    return d.mix((pboom("explosionCrunch_000", 1.5, 0.35), 0, 1.0), (s.zap(2400, 300, 0.1) * 0.5, 0, 1.0), length=n_(0.38))
