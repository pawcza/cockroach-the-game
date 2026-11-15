"""Sounds for the level skins: what a skinned enemy plays in place of its base enemy's sound (see skins.py).

Each sound is the same length class as the base sound it replaces and has its hit, toot or swing at the same moment of
it, because the game triggers it from the same animation. Every sound is synthesis, most layered with a CC0 pack
sample (glass, wood, rock, paper, squelch and creature samples), like the rest of the set. Ids and files are
`<skin>-<base key>`; install.py puts them in public/audio/skins/ and writes the manifest the game reads.
"""
import numpy as np
from lib import dsp as d
from lib import synth as s
from lib.dsp import SR, n_, expdec, noise
from lib.registry import group, snd
from sounds_core import K
from sounds_enemies import pk, env, gate
import skins

R = "oga-80-creature/"
O1 = "oga-100-cc0-sfx/"
O2 = "oga-100-cc0-sfx-2/sfx100v2_"
MW = "oga-100-metal-wood/"
BH = "oga-75-breaking-hit/bfh1_"
KI = K + "impact-sounds/Audio/"
KR = K + "rpg-audio/Audio/"
SQ = "oga-squish/oga-squish__"


def sk(skin, key, cat="gameplay", lufs=None, note=""):
    meta = skins.SKINS[skin]
    assert key in meta["made"], (skin, key)
    sid = skins.sound_id(skin, key)
    group(sid, f"Skins: level {meta['level']}", f"Level {meta['level']} skin, {meta['what']}: replaces {key}",
          [(f"audio/{key}.ogg", f"the {meta['base']}'s sound it replaces")])
    return snd(sid, "", cat, note=note, lufs=lufs)


# ------------------------------------------------------------------------------------------------ building blocks
def P(path, dur=None, start=0.0, gain=1.0, ext=".ogg"):
    """A pack sample (path under _packs/ without extension unless it has one), trimmed, peak-normalised, cut."""
    x = d.trim(d.load(path if path.endswith((".ogg", ".mp3", ".wav", ".flac")) else path + ext))
    x = x[n_(start):]
    if dur:
        x = x[:n_(dur)]
    return x / (np.abs(x).max() + 1e-9) * gain


def ragged(n, hz=25.0):
    """A smoothed random 0..1 envelope: rustle, flutter, crumble."""
    m = d.lp(np.abs(noise(n)), hz, 1)
    return m / (m.max() + 1e-9)


def band(dur, lo, hi, color="white", order=1):
    return d.bp(noise(n_(dur), color), lo, hi, order)


def glass(f, dur=0.3, tau=0.08, level=1.0):
    """A glass ting: inharmonic partials, each dying faster than the one below."""
    n = n_(dur)
    x = d.additive(f, n, [(1.0, 1.0, tau), (2.32, 0.55, tau * 0.7), (4.25, 0.35, tau * 0.5), (6.63, 0.2, tau * 0.35)])
    x[:n_(0.001)] *= 0.3
    return x * 0.5 * level


def knock(f, dur=0.15, tau=0.03, level=1.0):
    """A wooden or hollow knock: a sine falling from 1.5 f to f."""
    n = n_(dur)
    return d.sine(d.expramp(n, f * 1.5, f), n) * expdec(n, tau) * level


def vox(f, dur, formants, qs=None, gains=None, wave="saw", am=None, noise_amt=0.0, jit=0.0, a=0.008, r=0.03, hold=0.8):
    """One voiced pulse: f is a pitch curve [(t_frac, hz), ...] or (hz0, hz1); formant filtered, optional AM / rasp."""
    m = n_(dur)
    u = np.linspace(0, 1, m)
    f = [(0, f[0]), (1, f[1])] if isinstance(f[0], (int, float)) else f
    fr = np.interp(u, [p[0] for p in f], [p[1] for p in f])
    if jit:
        fr = fr * (1 + jit * np.sin(2 * np.pi * 31 * np.arange(m) / SR))
    src = d.saw(fr, m) if wave == "saw" else d.square(fr, m, 0.4)
    if noise_amt:
        src = src + noise_amt * noise(m) * 3
    v = d.formant(src, formants, qs, gains)
    if am:
        v = v * (1 - am[1] + am[1] * np.sin(2 * np.pi * am[0] * np.arange(m) / SR))
    return v * d.adsr(m, a, dur * 0.2, hold, r)


def whistle(f, dur, idx=1.5, vib=0.0, rate=30.0, a=0.01, r=0.04):
    """A thin FM whistle on a pitch curve [(t_frac, hz), ...]."""
    m = n_(dur)
    u = np.linspace(0, 1, m)
    fr = np.interp(u, [p[0] for p in f], [p[1] for p in f]) * (1 + vib * np.sin(2 * np.pi * rate * np.arange(m) / SR))
    return d.fm(fr, 1.0, idx, m) * d.adsr(m, a, dur * 0.2, 0.85, r)


def drip(f0, f1, dur, tau, level=1.0):
    n = n_(dur)
    return d.sine(d.expramp(n, f0, f1), n) * expdec(n, tau) * np.minimum(1, np.arange(n) / 40) * level


def pat(x_fn, times, length, gains=None):
    """Repeat a sound-making function at the given times."""
    g = gains or [1.0] * len(times)
    return d.mix(*[(x_fn(i), t, g[i]) for i, t in enumerate(times)], length=length)


def fat(x, drive=2.2):
    """Peak-normalise and round the peaks off: a swat's loudness over its spiky hit (build.py sets the loudness)."""
    return d.sat(x / (np.abs(x).max() + 1e-9) * drive, 1.0) if drive else x


def vib_(f, rate, depth, n):
    return f * (1 + depth * np.sin(2 * np.pi * rate * np.arange(n) / SR))


# ================================================================================================ LEVEL 2: stairwell
@sk("lv2-fern", "onion", "obstacle", note="fern fronds brushed: rustling pink noise (ragged flutter), soft low 'shff', a few dry twig ticks")
def _():
    n = n_(1.0)
    leaf = d.bp(noise(n, "pink"), 2500, 8500, 2) * ragged(n, 40) ** 1.4 * env(n, [(0, 0), (0.05, 1), (0.5, 0.8), (1.0, 0)]) * 3
    low = d.bp(noise(n, "pink"), 500, 2000, 1) * env(n, [(0, 0), (0.08, 1), (0.6, 0.4), (1.0, 0)]) * 1.4 * ragged(n, 15)
    tw = s.crackle(0.9, 22, 2000, 0.5, decay=0.5)
    return d.mix(leaf, low, (tw, 0.05, 1.0), length=n)


@sk("lv2-pipe", "bleach-drip", "obstacle", note="drop into a rusty pipe: plink with a short hollow metal ring, small water splash, trickle (no fizz)")
def _():
    n = n_(0.65)
    dr = d.mix((drip(1700, 900, 0.1, 0.03, 0.6), 0, 1.0), (s.bell(620, 0.5, 0.4, 0.16) * 0.5, 0, 1.0), (s.bell(1480, 0.3, 0.3, 0.05) * 0.25, 0, 1.0), length=n)
    sp = d.sweep(noise(n_(0.3)), 5000, 1200, "bandpass", q=1.1) * expdec(n_(0.3), 0.07) * 2.5
    tr = s.bubbles(0.4, 28, 8, 600, 1800, 0.35)
    return d.mix((dr, 0, 1.0), (sp, 0.16, 0.8), (tr, 0.22, 1.0), length=n)


# ================================================================================================ LEVEL 3: market hall
@sk("lv3-tomato", "glue-squelch", "obstacle", note="pack squish + wet splat + seeds (fine clicks) + a few bubbles and a pack plop: pulp, no sticky squeak")
def _():
    n = n_(0.5)
    sq = P(SQ + "squish_03.mp3", 0.4)
    sp = s.splat(0.3, 1800, 250) * 0.8
    sd = s.crackle(0.3, 70, 1500, 0.5, decay=0.12)
    bu = s.bubbles(0.3, 45, 10, 300, 900, 0.5)
    pl = P(O1 + "plop_02", 0.2, gain=0.6)
    return d.mix((sq, 0, 0.9), (sp, 0, 0.7), (sd, 0.05, 0.7), (bu, 0.15, 0.8), (pl, 0.12, 0.7), length=n)


@sk("lv3-flyswatter", "flipper", lufs=-14.7, note="plastic swatter: short airy swish, then a thin plastic thwack at the base's moment, mesh rattle and a little ring")
def _():
    n = n_(0.47)
    sw = s.whoosh(0.085, 3000, 9000, peak=0.75, q=1.2, shape=1.2) * 0.8
    tap = d.bp(noise(n_(0.06)), 1200, 5500, 1) * expdec(n_(0.06), 0.012) * 4
    pl = P(O1 + "hit_01", 0.2, gain=0.6)
    me = s.crackle(0.38, 170, 3000, 0.5, decay=0.1)
    rg = s.bell(1800, 0.38, 0.3, 0.07) * 0.3
    return fat(d.mix((sw, 0, 0.9), (s.click(2, 1.0, hpf=2500), 0.08, 1.0), (tap, 0.08, 1.0), (pl, 0.08, 0.8), (me, 0.09, 0.8), (rg, 0.08, 1.0), length=n), 2.4)


@sk("lv3-barrel", "bleach-drip", "obstacle", note="drop into a barrel: hollow wood plop and knock, brine plink, small splash, drips")
def _():
    n = n_(0.63)
    plop = drip(330, 140, 0.15, 0.05, 0.9)
    wd = P(KI + "impactWood_light_001", 0.25, gain=0.7)
    pl = drip(1500, 1100, 0.08, 0.02, 0.3)
    sp = d.sweep(noise(n_(0.3)), 3500, 900, "bandpass", q=1.0) * expdec(n_(0.3), 0.07) * 2
    tr = s.bubbles(0.35, 30, 6, 500, 1400, 0.4)
    return d.mix((plop, 0, 1.0), (wd, 0, 0.7), (pl, 0, 1.0), (sp, 0.15, 0.7), (tr, 0.22, 1.0), length=n)


# ================================================================================================ LEVEL 4: forest
@sk("lv4-toadstool", "onion", "obstacle", note="two spongy squeak-boings (soft sine glides), a puff of spores, damp little pops")
def _():
    n = n_(1.0)
    b1 = d.sine(d.expramp(n_(0.2), 330, 650), n_(0.2)) * expdec(n_(0.2), 0.09) * np.minimum(1, np.arange(n_(0.2)) / 400) * 1.3
    b2 = d.sine(d.expramp(n_(0.3), 300, 760), n_(0.3)) * expdec(n_(0.3), 0.12) * np.minimum(1, np.arange(n_(0.3)) / 400)
    pf = d.lp(noise(n_(0.6), "pink"), 2500, 1) * env(n_(0.6), [(0, 0), (0.03, 1), (0.6, 0)]) * 2.2
    bu = s.bubbles(0.6, 14, 5, 400, 900, 0.5)
    return d.mix((b1, 0, 0.9), (b2, 0.26, 1.0), (pf, 0.1, 0.8), (bu, 0.35, 0.7), length=n)


@sk("lv4-branch", "flipper", lufs=-14.7, note="pine branch: swish through needles, then a pack wood thwack at the base's moment, needle rustle, twig snap")
def _():
    n = n_(0.47)
    sw = s.whoosh(0.09, 500, 4500, peak=0.75, q=0.9, color="pink") * 0.8
    wd = P(MW + "wood_hit_03", 0.3)
    nd = s.crackle(0.38, 200, 2500, 0.6, decay=0.16)
    return fat(d.mix((sw, 0, 1.0), (wd, 0.085, 1.0), (s.click(2, 0.8, hpf=2500), 0.085, 1.0), (nd, 0.09, 0.8), length=n), 2.4)


@sk("lv4-resin-stub", "bleach-drip", "obstacle", note="thick resin drip: slow low bloop, heavy squelch, a sticky pop (no fizz, no sizzle)")
def _():
    n = n_(0.63)
    bl = d.mix((drip(520, 190, 0.2, 0.07, 1.0), 0, 1.0), (drip(150, 260, 0.1, 0.05, 0.4), 0, 1.0), length=n_(0.22))
    sp = s.splat(0.3, 900, 150, wet=1.2) * 0.6
    po = P(SQ + "squishpop.mp3", 0.25, gain=0.5)
    gl = s.bubbles(0.3, 12, 4, 150, 400, 0.5)
    return d.mix((bl, 0, 1.0), (sp, 0.15, 0.8), (po, 0.3, 0.8), (gl, 0.3, 0.8), (drip(380, 150, 0.15, 0.06, 0.3), 0.45, 1.0), length=n)


@sk("lv4-puffball", "spray", "obstacle", note="spore puffs: three soft low-passed 'ff' bursts over a fine powder hush, tiny high sparkle ticks")
def _():
    n = n_(1.0)
    out = np.zeros(n)
    for t, g in [(0.0, 0.9), (0.22, 1.0), (0.5, 0.7)]:
        m = n_(0.45)
        pf = d.bp(noise(m, "pink"), 250, 3500, 1) * env(m, [(0, 0), (0.012, 1), (0.06, 0.5), (0.45, 0)]) * 3
        out = d.mix(out, (pf, t, g), length=n)
    pw = d.bp(noise(n), 1500, 6500, 1) * env(n, [(0, 0), (0.2, 0.5), (0.8, 0.5), (1.0, 0)]) * 0.9
    sp = s.crackle(0.8, 26, 5000, 0.25)
    return d.mix(out, pw, (sp, 0.1, 1.0), length=n)


@sk("lv4-frond", "newspaper", lufs=-16.0, note="fern frond: leafy pink swish, soft pack slap with cloth, rustle tail")
def _():
    n = n_(1.2)
    sw = s.whoosh(0.4, 700, 4500, peak=0.45, q=0.8, color="pink") * 0.9
    sl = d.lp(P(KI + "impactSoft_medium_002", 0.25), 2500, 1)
    cl = P(KR + "cloth4", 0.35, gain=0.6)
    ru = d.bp(noise(n_(0.9), "pink"), 2000, 7000, 1) * ragged(n_(0.9), 35) * env(n_(0.9), [(0, 0), (0.05, 1), (0.9, 0)]) * 1.6
    cr = s.crackle(0.9, 70, 2500, 0.3, decay=0.4)
    return fat(d.mix((sw, 0, 1.0), (sl, 0.18, 1.0), (cl, 0.17, 0.8), (ru, 0.22, 0.7), (cr, 0.25, 0.8), length=n), 3.0)


@sk("lv4-flashlight", "lamp-flicker", note="battery torch flicker: three dull switch-contact ticks (pack switch clicks) and a weak, gated buzz; no mains arc")
def _():
    n = n_(0.31)
    ck = d.lp(d.mix((s.click(2, 1.0, hpf=900), 0, 1.0), (s.click(2, 0.7, hpf=900), 0.08, 1.0), (s.click(2, 0.5, hpf=900), 0.13, 1.0), length=n), 3500, 1)
    sw = d.mix((P(O1 + "switch_01", 0.13, gain=0.7), 0, 1.0), (P(O1 + "switch_02", 0.2, gain=0.3), 0.11, 1.0), length=n)
    bz = d.lp(d.saw(90, n), 800, 1) * d.mix((np.ones(n_(0.05)), 0.01, 1.0), (np.ones(n_(0.04)), 0.14, 0.7), length=n) * 0.07
    return d.mix(ck, sw, bz, length=n)


@sk("lv4-flashlight", "lamp-snap", note="torch switched on: plastic click-clack (pack switch) + knock + battery tinks + a dim filament ping")
def _():
    n = n_(0.53)
    sw = P(O1 + "switch_02", 0.2)
    kn = s.thump(0.12, 180, 90, tau=0.03)
    bt = d.mix((s.bell(2800, 0.1, 0.4, 0.02) * 0.4, 0.05, 1.0), (s.bell(3400, 0.08, 0.4, 0.015) * 0.3, 0.09, 1.0), length=n)
    pn = s.bell(1500, 0.5, 0.5, 0.2) * 0.35
    gw = d.sine(d.expramp(n_(0.4), 700, 900), n_(0.4)) * env(n_(0.4), [(0, 0), (0.05, 1), (0.4, 0)]) * 0.12
    return d.mix((s.click(3, 1.0, hpf=1200), 0, 1.0), (sw, 0, 1.0), (kn, 0, 0.8), bt, (pn, 0.01, 0.8), (gw, 0.05, 1.0), length=n)


@sk("lv4-rake", "mop-slap", note="rake head thud (pack wood) then tines dragging: gated rasp at the tine rate, dirt and twig ticks, a swish")
def _():
    n = n_(0.58)
    th = d.mix(d.lp(P(KI + "impactWood_medium_002", 0.3), 1500, 1), (s.thump(0.15, 120, 60, tau=0.04), 0, 0.5), length=n_(0.3))
    sc = gate(d.bp(noise(n_(0.5), "pink"), 1200, 6000, 1), 55, 0.5, 0.3) * env(n_(0.5), [(0, 0.2), (0.1, 1), (0.5, 0)]) * 2
    cr = s.crackle(0.5, 160, 1500, 0.5, decay=0.3)
    sw = s.whoosh(0.4, 500, 2500, peak=0.5, q=0.8, color="pink") * 0.5
    return d.mix((th, 0, 1.0), (sc, 0.08, 0.8), (cr, 0.1, 0.7), (sw, 0.15, 0.7), length=n)


@sk("lv4-molehole", "vacuum-roar", note="earth sucked in: brown rumble, gritty band noise sweeping up, dense soil crackle, a low gulp at the end")
def _():
    n = n_(1.4)
    rb = d.lp(noise(n, "brown"), 260, 2) * 4
    su = d.sweep(noise(n), 400, 2200, "bandpass", q=0.9) * env(n, [(0, 0), (0.4, 0.8), (1.0, 0.7), (1.4, 0)]) * (0.6 + 0.4 * ragged(n, 20)) * 1.6
    so = s.crackle(1.2, 160, 600, 0.6)
    gu = d.sine(d.expramp(n_(0.25), 190, 75), n_(0.25)) * expdec(n_(0.25), 0.08) * 0.9
    x = d.mix((rb, 0, 0.7), (su, 0, 0.7), (so, 0.05, 0.7), (gu, 1.08, 1.0), (s.thump(0.2, 100, 45, tau=0.05), 1.1, 0.8), length=n) * env(n, [(0, 0), (0.12, 1), (1.1, 0.95), (1.4, 0)])
    return d.sat(x, 1.4)


# ================================================================================================ LEVEL 5: Christmas Eve
@sk("lv5-bauble", "onion", "obstacle", note="glass bauble: a bright glass strike, then a cascade of glassy tings at falling levels")
def _():
    n = n_(1.0)
    out = d.mix((glass(3200, 0.5, 0.12), 0, 1.0), (P(KI + "impactGlass_light_001", 0.3, gain=0.4), 0, 1.0), length=n)
    for k, (t, f) in enumerate([(0.12, 4100), (0.2, 3500), (0.34, 5200), (0.46, 2900), (0.6, 4700), (0.75, 3900)]):
        out = d.mix(out, (glass(f, 0.3, 0.07, 0.65 - 0.07 * k), t, 1.0), length=n)
    return out


@sk("lv5-candle", "bleach-drip", "obstacle", note="wax drop: a soft tick, a fluttering flame (low-passed noise with 11 Hz flutter), faint sizzle")
def _():
    n = n_(0.65)
    tk = d.mix(d.bp(noise(n_(0.05)), 1200, 3500, 1) * expdec(n_(0.05), 0.01) * 3, drip(900, 650, 0.06, 0.02, 0.6), length=n_(0.06))
    fl = d.lp(noise(n_(0.45), "pink"), 900, 1) * (0.55 + 0.45 * np.sin(2 * np.pi * 11 * np.arange(n_(0.45)) / SR)) * env(n_(0.45), [(0, 0), (0.05, 1), (0.45, 0)]) * 1.5
    sz = s.crackle(0.45, 40, 2000, 0.4, decay=0.2)
    return d.mix((tk, 0, 1.0), (fl, 0.1, 0.6), (sz, 0.12, 0.8), length=n)


def trumpet(f, dur, vib=0.0, a=0.025, r=0.07):
    m = n_(dur)
    fr = vib_(f, 5.6, vib, m)
    x = d.saw(fr, m) + 0.5 * d.saw(fr * 1.003, m)
    x = d.formant(x, [f * 1.8, f * 3.4, f * 5.2], [3, 4, 5], [1.0, 0.8, 0.4]) + 0.4 * d.lp(x, f * 3, 1)
    return d.sat(x * d.adsr(m, a, 0.06, 0.85, r), 1.5)


@sk("lv5-angel", "bird", lufs=-15.5, note="tiny trumpet fanfare: three short rising brassy notes then a long vibrato note, wing-flutter tinkles on top")
def _():
    n = n_(2.4)
    out = np.zeros(n)
    for t, f, du, vb in [(0.0, 784, 0.17, 0), (0.22, 784, 0.17, 0), (0.44, 1047, 0.28, 0), (0.78, 1319, 1.5, 0.008)]:
        out = d.mix(out, (trumpet(f, du, vb), t, 1.0), length=n)
    r = d.rng()
    tw = np.zeros(n)
    for t in np.sort(r.uniform(0.1, 2.1, 9)):
        tw = d.mix(tw, (s.bell(float(r.uniform(3000, 5200)), 0.2, 0.6, 0.05) * 0.18, float(t), 1.0), length=n)
    return d.mix(out, tw, length=n)


@sk("lv5-goose", "hen-cluck", note="'hok-hok-HONK': two short and one long nasal honk (formant-filtered saw with rasp), the last rising then falling")
def _():
    n = n_(0.6)
    kw = dict(formants=[900, 1700, 2700], qs=[3, 4, 5], gains=[1.0, 0.8, 0.4], noise_amt=0.1, am=(80, 0.3), jit=0.01)
    out = d.mix((vox((420, 330), 0.1, **kw), 0.0, 0.6), (vox((430, 340), 0.1, **kw), 0.14, 0.65),
                (vox([(0, 330), (0.35, 520), (1, 400)], 0.3, **kw), 0.28, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.6)


@sk("lv5-carp", "frog-croak", note="gulp-and-gurgle: a wet 'blup' (falling sine over bubbles), then a longer gurgle with a low gulp, all low-passed")
def _():
    n = n_(0.7)
    b1 = d.mix((drip(450, 180, 0.15, 0.06, 1.0), 0, 1.0), (s.bubbles(0.2, 40, 20, 300, 800, 0.6), 0, 1.0), length=n_(0.22))
    b2 = d.mix((s.bubbles(0.4, 30, 55, 200, 700, 1.0), 0, 1.0), (drip(250, 120, 0.2, 0.08, 0.8), 0, 1.0),
               (d.lp(noise(n_(0.3)), 1200, 1) * expdec(n_(0.3), 0.1), 0, 0.5), length=n_(0.42))
    return d.lp(d.mix((b1, 0, 1.0), (b2, 0.3, 1.0), length=n), 2800, 1)


@sk("lv5-carp", "frog-tongue", note="wet lunge: rising swish, pack splash cut short, wet pack plop at the base's smack, low thump")
def _():
    n = n_(0.29)
    w = s.whoosh(0.18, 600, 3500, peak=0.45, q=0.9) * 0.8
    sp = d.fade(P(O1 + "splash_01", 0.17), 0, 30)
    pl = P(O1 + "plop_01", 0.15, gain=0.7)
    return d.mix((w, 0, 1.0), (sp, 0.11, 0.9), (pl, 0.16, 1.0), (s.thump(0.1, 150, 70, tau=0.03), 0.16, 0.6), length=n)


# ================================================================================================ LEVEL 6: fire-station disco
@sk("lv6-mug", "flipper", lufs=-14.7, note="heavy mug slam: low swish, pack wood table thud + glass clunk (low-passed) + low thump, beer slosh")
def _():
    n = n_(0.47)
    sw = s.whoosh(0.075, 250, 1200, peak=0.7, q=0.9, color="pink") * 0.6
    wd = d.hp(P(KI + "impactWood_medium_002", 0.3), 120, 1)
    gl = d.lp(P(KI + "impactGlass_heavy_002", 0.3), 3500, 1)
    th = s.thump(0.25, 190, 85, tau=0.07, drive=2.0)
    sl = s.bubbles(0.25, 40, 10, 500, 1500, 0.4)
    sp = s.splat(0.2, 2500, 600) * 0.3
    return fat(d.mix((sw, 0, 1.0), (wd, 0.075, 1.0), (gl, 0.075, 0.8), (th, 0.075, 1.0), (sl, 0.15, 0.8), (sp, 0.12, 0.8), length=n), 2.4)


@sk("lv6-extinguisher", "spray", "obstacle", note="extinguisher blast: a lever click and chuff, then a loud broadband 'pshhh' over a low gas rumble with turbulence")
def _():
    n = n_(1.0)
    hs = d.bp(noise(n), 400, 7000, 1) * env(n, [(0, 0), (0.07, 1), (0.9, 0.8), (1.0, 0)]) * (0.75 + 0.25 * ragged(n, 30)) * 2.2
    lo = d.lp(noise(n, "pink"), 900, 2) * env(n, [(0, 0), (0.1, 1), (0.9, 0.7), (1.0, 0)]) * 1.5
    return d.mix((s.click(3, 0.9, hpf=1500), 0, 1.0), (s.thump(0.2, 120, 60, tau=0.05), 0, 0.6), hs, (lo, 0, 0.7), length=n)


@sk("lv6-vinyl", "newspaper", lufs=-16.0, note="record sleeve: stiff cardboard swish, pack book slap + paper, vinyl crackle and a disc hiss in the tail")
def _():
    n = n_(1.2)
    sw = s.whoosh(0.3, 500, 3200, peak=0.5, q=1.0) * 0.8
    sl = P(KR + "bookPlace2", 0.25)
    pa = P(O1 + "paper_01", 0.3, gain=0.5)
    vc = s.crackle(0.8, 90, 1500, 0.5, decay=0.45)
    hs = d.bp(noise(n_(0.5)), 3000, 9000, 1) * expdec(n_(0.5), 0.2) * 0.8
    return fat(d.mix((sw, 0, 1.0), (sl, 0.2, 1.0), (pa, 0.2, 0.8), (s.thump(0.2, 140, 70, tau=0.05), 0.2, 0.6), (vc, 0.25, 0.8), (hs, 0.25, 0.7), length=n), 2.2)


@sk("lv6-coaster", "bird", lufs=-15.5, note="spinning cardboard disc: fluttering whirr (band noise, AM slowing 34 to 22 Hz) with a doppler pass, a thin wind whistle")
def _():
    n = n_(2.4)
    n1, n2 = n_(1.0), n - n_(1.0)
    wz = np.concatenate([d.sweep(noise(n1), 1100, 2400, "bandpass", q=3), d.sweep(noise(n2), 2400, 1300, "bandpass", q=3)])
    rate = np.interp(np.arange(n) / SR, [0, 2.4], [34, 22])
    am = 0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(rate) / SR)
    pas = env(n, [(0, 0.15), (1.0, 1), (2.4, 0.1)])
    ws = d.sine(np.interp(np.arange(n) / SR, [0, 1.0, 2.4], [900, 1500, 800]), n) * 0.12
    return d.mix(wz * am * pas * 3, ws * pas, length=n)


def growl(f, dur, a=0.05, r=0.15, am=(28, 0.6)):
    return vox(f, dur, [400, 900, 2000], [4, 5, 6], [1.0, 0.7, 0.4], am=am, noise_amt=0.12, jit=0.02, a=a, r=r)


@sk("lv6-dog", "cat", lufs=-15.1, note="grr-WOOF-WOOF: a rising synth growl (AM saw through vowel formants) with two pack dog barks, a growl tail")
def _():
    n = n_(0.91)
    b1 = P(R + "barking_01", 0.3)
    b2 = d.pitch(P(R + "barking_02", 0.3), 0.9)
    return fat(d.mix((growl((85, 125), 0.5), 0, 0.7), (b1, 0.12, 1.0), (b2, 0.46, 0.9), (growl((110, 85), 0.25, 0.02, 0.1), 0.66, 0.6), length=n), 2.2)


@sk("lv6-blower", "frog-croak", note="party blower: a short reedy toot, then a longer toot that rises as the paper unrolls; buzzy square through kazoo formants")
def _():
    n = n_(0.7)
    kw = dict(formants=[1100, 2400, 3800], qs=[4, 5, 6], gains=[1.0, 0.8, 0.4], wave="square", am=(60, 0.25), noise_amt=0.05, jit=0.006)
    out = d.mix((vox((520, 600), 0.2, **kw), 0.0, 1.0), (vox([(0, 480), (1, 760)], 0.4, **kw), 0.3, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.5)


@sk("lv6-blower", "frog-tongue", note="paper unrolling: rising swish, a fast 'brrt' flutter, then a crisp snap (click + pack page flip) as it springs out")
def _():
    n = n_(0.29)
    w = s.whoosh(0.16, 1500, 6000, peak=0.8, q=1.0) * 0.8
    fl = gate(d.bp(noise(n_(0.16)), 2500, 8000, 1), 70, 0.5, 0.3) * 1.2
    return d.mix((w, 0, 1.0), (fl, 0, 0.5), (s.click(2, 1.0, hpf=3000), 0.15, 1.0), (P(KR + "bookFlip3", 0.13, gain=0.7), 0.15, 1.0), length=n)


@sk("lv6-speaker", "vacuum-roar", note="bass speaker: sub swell, kick thumps coming faster and louder, an inhaling falling band-noise sweep, mains buzz")
def _():
    n = n_(1.4)
    t = np.arange(n) / SR
    sub = d.sat(d.sine(np.interp(t, [0, 1.1, 1.4], [55, 80, 70]), n) * 2.0, 2.5) * env(n, [(0, 0), (0.15, 1), (1.1, 1), (1.4, 0)]) * 0.9
    th = np.zeros(n)
    for k, tm in enumerate([0.05, 0.3, 0.5, 0.66, 0.8, 0.92, 1.02, 1.12]):
        th = d.mix(th, (s.thump(0.3, 150, 50, tau=0.08, drive=2.5), tm, 0.6 + 0.05 * k), length=n)
    su = d.sweep(noise(n), 3500, 400, "bandpass", q=1.2) * env(n, [(0, 0), (0.2, 0.5), (1.1, 1), (1.4, 0)]) * 1.0
    bz = d.lp(d.saw(60, n), 500, 1) * env(n, [(0, 0), (0.2, 0.5), (1.2, 0.5), (1.4, 0)]) * 0.3
    return d.sat(d.mix((sub, 0, 0.8), (th, 0, 1.0), (su, 0, 0.7), (bz, 0, 0.8), length=n), 1.4)


# ================================================================================================ LEVEL 7: Baltic beach
@sk("lv7-windbreak", "newspaper", lufs=-16.0, note="windbreak: low cloth swish, canvas thwack (pack cloth) with a pack wood pole clack, then three fading flaps")
def _():
    n = n_(1.2)
    sw = s.whoosh(0.35, 200, 1800, peak=0.5, q=0.8, color="pink") * 0.9
    cl = P(KR + "cloth2", 0.38)
    cv = d.lp(P(KR + "cloth4", 0.3), 3000, 1)
    pl = P(MW + "wood_hit_01", 0.23, gain=0.8)
    fl = np.zeros(n)
    for k, (t, g) in enumerate([(0.34, 0.4), (0.5, 0.3), (0.66, 0.22), (0.82, 0.15), (0.97, 0.1)]):
        m = n_(0.25)
        fl = d.mix(fl, (d.bp(noise(m, "pink"), 100, 1500, 1) * expdec(m, 0.05) * 3, t, g), length=n)
    return fat(d.mix((sw, 0, 1.0), (cl, 0.0, 0.5), (cv, 0.2, 1.0), (pl, 0.19, 0.8), fl, length=n), 2.2)


@sk("lv7-cormorant", "hen-cluck", note="'krr-krr-KRAAAH': two short and one long hoarse croak (low saw, strong rasp and AM, vowel formants), the last falling")
def _():
    n = n_(0.6)
    kw = dict(formants=[450, 1000, 2200], qs=[4, 5, 6], gains=[1.0, 0.8, 0.4], noise_amt=0.3, am=(70, 0.5), jit=0.02)
    out = d.mix((vox((150, 120), 0.1, **kw), 0.0, 0.6), (vox((155, 125), 0.1, **kw), 0.14, 0.65), (vox((170, 100), 0.3, **kw), 0.27, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.8)


@sk("lv7-crab", "cat", lufs=-15.1, note="claw clicks: a scuttle (gated high noise), a flurry of tiny castanet clicks speeding up, two big claw snaps (click + pack tin tink)")
def _():
    n = n_(0.91)
    r = d.rng()
    sc = gate(d.bp(noise(n_(0.9)), 2500, 8000, 1), 38, 0.35, 0.25) * env(n_(0.9), [(0, 0.2), (0.3, 1), (0.9, 0)]) * 1.8
    cl = np.zeros(n)
    t = 0.04
    while t < 0.8:
        f = float(r.uniform(2200, 5000))
        m = n_(0.02)
        cl = d.mix(cl, (d.bp(noise(m), f * 0.7, f * 1.3, 1) * expdec(m, 0.004) * 6 * float(r.uniform(0.4, 1.0)) * (1.0 if t < 0.55 else 0.5), t, 1.0), length=n)
        t += max(0.02, 0.07 - 0.07 * (t / 0.7) * 0.7) * float(r.uniform(0.6, 1.3))
    sn = np.zeros(n)
    for tm, g in [(0.32, 1.0), (0.46, 0.8), (0.7, 0.4)]:
        sn = d.mix(sn, (s.click(3, 1.0, hpf=1800), tm, g), (P(KI + "impactTin_medium_003", 0.15, gain=0.5), tm, g), (knock(700, 0.1, 0.02, 0.6), tm, g), length=n)
    return fat(d.mix((sc, 0, 0.7), (cl, 0, 1.0), sn, length=n), 2.2)


@sk("lv7-octopus", "frog-croak", note="wet blubs: one small bubble, then a longer pack burble pitched down and low-passed with bubbles under it")
def _():
    n = n_(0.7)
    b1 = d.mix((drip(300, 140, 0.12, 0.05, 1.0), 0, 1.0), (s.bubbles(0.15, 40, 20, 200, 600, 0.5), 0, 1.0), length=n_(0.2))
    bu = d.lp(d.pitch(P(R + "burble_02"), 0.85)[:n_(0.42)], 3000, 1)
    return d.mix((b1, 0, 1.0), (bu, 0.28, 1.0), (s.bubbles(0.4, 25, 20, 150, 500, 0.6), 0.3, 0.8), length=n)


@sk("lv7-octopus", "frog-tongue", note="tentacle whip: a fast high swish, a sharp crack, a wet pack squish-pop and a rising sucker 'schlp'")
def _():
    n = n_(0.29)
    w = s.whoosh(0.16, 1200, 7000, peak=0.85, q=1.0, shape=1.2) * 0.9
    sc = drip(300, 900, 0.1, 0.03, 0.6)
    return d.mix((w, 0, 1.0), (s.click(2, 1.0, hpf=2500), 0.14, 1.0), (P(SQ + "squishpop.mp3", 0.15, gain=0.8), 0.15, 1.0), (sc, 0.17, 1.0), length=n)


@sk("lv7-shrimp", "centipede-rear", note="snapping shrimp: a burst of dense tiny clicks and one low 'pop' snap, then fast leg patter (gated high noise) and a second pop")
def _():
    n = n_(0.81)
    cb = s.crackle(0.35, 400, 2800, 0.9, decay=0.15)
    po = d.mix((drip(1400, 300, 0.1, 0.02, 1.0), 0.0, 1.0), (s.click(2, 0.9, hpf=2500), 0.0, 1.0), length=n_(0.12))
    pt = gate(d.bp(noise(n_(0.5)), 2000, 7000, 1), 48, 0.3, 0.25) * env(n_(0.5), [(0, 0.2), (0.15, 1), (0.5, 0)]) * 2.0
    return fat(d.mix((cb, 0, 0.8), (po, 0.04, 1.0), (pt, 0.3, 0.9), (po, 0.33, 0.6), length=n), 2.0)


@sk("lv7-sandals", "boots-stomp", note="sandal in sand: a soft low thump, granular sand crunch, a pack soft slap of the sole (low-passed)")
def _():
    n = n_(0.34)
    th = s.thump(0.25, 150, 75, tau=0.06, drive=1.6)
    cr = d.lp(s.crackle(0.3, 600, 1200, 0.7, decay=0.1), 5000, 1) + d.bp(noise(n_(0.3), "pink"), 700, 3500, 1) * ragged(n_(0.3), 60) * expdec(n_(0.3), 0.1) * 2
    fl = d.lp(P(KI + "impactSoft_medium_003", 0.2), 2500, 1)
    return d.mix((th, 0, 1.0), (cr, 0.01, 0.9), (fl, 0, 0.9), length=n)


# ================================================================================================ LEVEL 8: the Moon
@sk("lv8-moonrock", "aerosol-rattle", note="pebbles shifting inside the rock: stony ticks that quicken, then a crack and a small crumble where the spurt was")
def _():
    n = n_(0.66)
    r = d.rng()
    rt = np.zeros(n)
    t, gap = 0.0, 0.075
    while t < 0.4:
        f = float(r.uniform(900, 3200))
        m = n_(0.03)
        rt = d.mix(rt, (d.bp(noise(m), f * 0.6, f * 1.4, 1) * expdec(m, 0.006) * 6 * float(r.uniform(0.5, 1.0)) + d.sine(f * 0.7, m) * expdec(m, 0.004) * 0.3, t, 1.0), length=n)
        t += gap
        gap = max(0.025, gap * 0.85)
    ck = d.mix((P(BH + "rock_hit_01", 0.07), 0, 1.0), (s.click(2, 0.8, hpf=1500), 0, 1.0), (s.crackle(0.22, 90, 500, 0.7, decay=0.1), 0.02, 0.8), length=n_(0.25))
    return fat(d.mix(rt, (ck, 0.42, 1.0), length=n), 2.0)


@sk("lv8-moonrock", "aerosol-blast", "boss", note="rock bursting: low thump, pack rock breaking + falling rubble + stones, coarse crumble crackle, a puff of dust")
def _():
    n = n_(0.77)
    th = s.thump(0.3, 170, 70, tau=0.09, drive=2.0)
    rb = P(BH + "rock_breaking_01", 0.5)
    rf = P(BH + "rock_falling_03", 0.6, gain=0.6)
    st = P(O2 + "stones_01", 0.4, gain=0.5)
    cr = s.crackle(0.6, 140, 400, 0.6, decay=0.3)
    du = d.lp(noise(n_(0.35)), 1500, 1) * expdec(n_(0.35), 0.1) * 1.2
    return d.mix((th, 0, 1.0), (rb, 0, 1.0), (rf, 0.12, 0.8), (st, 0.3, 0.8), (cr, 0.05, 0.8), (du, 0.02, 0.6), length=n)


@sk("lv8-thurible", "spray", "obstacle", note="incense burner: a swinging run of chain clinks (clicks + small bells at random pitch), soft smoke puffs, ember crackle")
def _():
    n = n_(1.0)
    r = d.rng()
    ch = np.zeros(n)
    for k, t in enumerate([0.0, 0.09, 0.17, 0.24, 0.31, 0.4, 0.52, 0.66]):
        f = float(r.uniform(2600, 4400))
        ch = d.mix(ch, (s.bell(f, 0.12, 1.2, 0.025) * 0.5, t, 1.0), (s.click(2, 0.5, hpf=3000), t, 1.0), length=n)
    pf = d.lp(noise(n_(0.7), "pink"), 1800, 1) * env(n_(0.7), [(0, 0), (0.15, 1), (0.7, 0)]) * 1.6
    em = s.crackle(0.9, 50, 3000, 0.25)
    return d.mix((ch, 0, 0.9), (pf, 0.05, 0.9), (em, 0.1, 0.8), length=n)


@sk("lv8-scroll", "newspaper", lufs=-16.0, note="parchment: pack paper unroll crinkle, narrow dry swish, a hollow knock of the rod, dry crackle and flutter in the tail")
def _():
    n = n_(1.2)
    sw = d.bp(noise(n_(0.35), "pink"), 1500, 6000, 1) * env(n_(0.35), [(0, 0), (0.45, 1), (1.0, 0)]) * 2
    p1 = P(O1 + "paper_03", 0.55)
    p2 = P(O1 + "paper_04", 0.5, gain=0.7)
    kn = P(KI + "impactWood_light_003", 0.2) * 0.9
    cr = s.crackle(0.85, 220, 3000, 0.4, decay=0.45)
    return fat(d.mix((p1, 0, 0.7), (sw, 0, 0.8), (kn, 0.18, 1.0), (p2, 0.3, 0.7), (P(O1 + "paper_01", 0.4, gain=0.4), 0.7, 0.8), (cr, 0.25, 0.8), length=n), 2.2)


def hen_clucks(f_scale, formants):
    out = np.zeros(n_(0.6))
    for tm, du, f0, f1 in [(0.0, 0.07, 500, 420), (0.12, 0.07, 520, 440), (0.26, 0.3, 480, 780)]:
        out = d.mix(out, (vox((f0 * f_scale, f1 * f_scale), du, formants, [5, 6, 8], [1.0, 0.6, 0.3], a=0.005, r=0.03, hold=0.7), tm, 1.0), length=len(out))
    return out


@sk("lv8-spacehen", "hen-cluck", note="cluck from inside a helmet: the hen's wind-up pitched down, low-passed to 1.6 kHz, tight metallic cavity echoes, radio click and breath hiss")
def _():
    x = d.lp(hen_clucks(0.85, [600, 1300, 2300]), 1600, 2)
    x = d.echo(x, 0.004, 0.55, 0.6, 5, tail=False)
    n = len(x)
    br = d.bp(noise(n, "pink"), 300, 2000, 1) * 0.1
    return d.sat(d.mix(x / (np.abs(x).max() + 1e-9), br, (s.click(2, 0.4, hpf=2000), 0, 1.0), length=n), 1.4)


@sk("lv8-spacehen", "hen-peck", note="beak on the helmet glass: a short glass tink, a click and a small hollow thump")
def _():
    n = n_(0.085)
    return d.mix((glass(3000, 0.085, 0.018), 0, 1.0), (s.click(2, 0.8, hpf=2500), 0, 1.0), (s.thump(0.06, 200, 100, tau=0.015), 0, 0.2), length=n)


@sk("lv8-alien", "cat", lufs=-15.1, note="small alien: three FM chirps (rising, falling, long warble with fast vibrato) over a pack alien voice")
def _():
    n = n_(0.91)
    out = np.zeros(n)
    for t, du, pts in [(0.0, 0.2, [(0, 1200), (1, 2800)]), (0.22, 0.18, [(0, 2600), (1, 1500)]), (0.42, 0.45, [(0, 1700), (0.5, 3300), (1, 2000)])]:
        out = d.mix(out, (whistle(pts, du, idx=2.0, vib=0.05, rate=18), t, 1.0), length=n)
    al = P(R + "alien_03", 0.7, gain=0.6)
    return d.mix((out, 0, 0.7), (al, 0.1, 0.8), length=n)


@sk("lv8-blob", "frog-croak", note="gel burble: a FM 'bloop' then a longer pack burble low-passed with a falling sweep and a wobbling jelly undertone")
def _():
    n = n_(0.7)
    bl = d.fm(d.expramp(n_(0.2), 220, 110), 1.0, 3.0 * np.linspace(1, 0, n_(0.2)), n_(0.2)) * expdec(n_(0.2), 0.08)
    bu = d.sweep(P(R + "burble_01", 0.4), 4000, 600, "lowpass", q=1.0)
    jl = d.sine(140, n_(0.4)) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * np.arange(n_(0.4)) / SR)) * env(n_(0.4), [(0, 0), (0.05, 1), (0.4, 0)]) * 0.35
    return d.mix((bl, 0, 1.0), (bu, 0.3, 1.0), (jl, 0.3, 1.0), length=n)


@sk("lv8-blob", "frog-tongue", note="gel stretch: a rising FM 'sproing' then a pack squish and splat at the base's smack")
def _():
    n = n_(0.29)
    sp = d.fm(d.expramp(n_(0.16), 200, 1800), 1.0, 2.5, n_(0.16)) * d.adsr(n_(0.16), 0.01, 0.05, 0.7, 0.05) * 0.5
    return d.mix((sp, 0, 1.0), (P(SQ + "squish_05.mp3", 0.2), 0.14, 1.0), (s.splat(0.15, 2000, 500) * 0.4, 0.15, 1.0), length=n)


@sk("lv8-satellite", "jellyfish", lufs=-15.1, note="telemetry beeps in a pattern (square blips through a soft low-pass) over a rising sine sweep, a low carrier and radio static; echo")
def _():
    n = n_(1.5)
    bp = np.zeros(n)
    for t, f, du in [(0.0, 1320, 0.08), (0.14, 1320, 0.08), (0.28, 1760, 0.18), (0.62, 990, 0.08), (0.76, 1320, 0.08), (0.9, 1760, 0.08), (1.04, 1980, 0.26)]:
        m = n_(du)
        bp = d.mix(bp, (d.lp(s.blip_stack(f, du, "square"), 4000, 1) * d.adsr(m, 0.003, 0.02, 0.8, 0.03) * 0.5, t, 1.0), length=n)
    sw = d.sine(d.expramp(n_(0.6), 400, 900), n_(0.6)) * env(n_(0.6), [(0, 0), (0.1, 1), (0.6, 0)]) * 0.15
    ca = d.tri(220, n) * env(n, [(0, 0), (0.1, 1), (1.3, 0.8), (1.5, 0)]) * 0.12
    st = d.bp(noise(n), 2000, 6000, 1) * (0.5 + 0.5 * ragged(n, 40)) * env(n, [(0, 0.3), (0.1, 1), (1.3, 0.8), (1.5, 0)]) * 0.35
    return d.echo(d.mix(bp, (sw, 0, 1.0), ca, st, length=n), 0.17, 0.35, 0.3, 3, tail=False)


@sk("lv8-meteor", "gull-screech", note="meteor dive: a fast-rising roar (noise through a falling low-pass), rumble, fire crackle and a doppler pass sweep")
def _():
    n = n_(0.88)
    ro = d.sweep(noise(n), 5000, 400, "lowpass", q=0.7) * env(n, [(0, 0), (0.03, 1), (0.5, 0.9), (0.88, 0)]) * 2.5
    rb = d.lp(noise(n, "brown"), 150, 2) * 4 * env(n, [(0, 0), (0.05, 1), (0.5, 0.8), (0.88, 0)])
    cr = s.crackle(0.8, 200, 700, 0.6, decay=0.5)
    ps = d.sweep(noise(n), 3000, 300, "bandpass", q=1.0) * env(n, [(0, 0), (0.1, 1), (0.88, 0)]) * 1.5
    return d.sat(d.mix((ro, 0, 0.8), (rb, 0, 0.5), (cr, 0.03, 0.7), (ps, 0, 0.6), length=n), 1.4)


@sk("lv8-ufo", "wasp-buzz", note="UFO hum: a wobbling FM sine around 300-360 Hz with a detuned twin (beating), 9 Hz tremolo and a faint high shimmer")
def _():
    n = n_(0.66)
    t = np.arange(n) / SR
    f = np.linspace(300, 360, n)
    h = d.fm(f, 1.5, 1.5, n) + 0.5 * d.sine(f * 1.013, n)
    h = h * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t))
    sh = d.sine(vib_(1800.0, 6, 0.02, n), n) * 0.1
    return d.mix(h * 0.6, sh, length=n) * env(n, [(0, 0), (0.05, 1), (0.55, 1), (0.66, 0)])


@sk("lv8-ufo", "wasp-dive", note="UFO dive: an FM zip falling 1500 to 200 Hz over a swish, ending in a low buzzy bzzt")
def _():
    n = n_(0.5)
    z = d.fm(d.expramp(n, 1500, 200), 1.5, 2.0, n) * env(n, [(0, 0.2), (0.1, 1), (0.4, 0.8), (0.5, 0)]) * 0.6
    w = s.whoosh(0.4, 4000, 700, peak=0.3, q=1.0, shape=1.4) * 0.4
    bz = d.lp(d.saw(120, n_(0.09)), 900, 1) * expdec(n_(0.09), 0.05) * 0.7
    return d.sat(d.mix((z, 0, 1.0), (w, 0, 1.0), (bz, 0.4, 1.0), (s.click(2, 0.4, hpf=2500), 0.42, 1.0), length=n), 1.3)


@sk("lv8-rover", "robovac-whir", "obstacle", note="old rover motor: a rising servo whine with slow wobble, gear-ratchet ticks, a dusty crunch, one low telemetry blip; no cheerful beeps")
def _():
    n = n_(0.91)
    t = np.arange(n) / SR
    f = d.expramp(n, 150, 330) * (1 + 0.02 * np.sin(2 * np.pi * 14 * t))
    mo = d.lp(d.tri(f, n) + d.saw(f * 2.0, n) * 0.25, 1800, 1) * env(n, [(0, 0), (0.2, 0.7), (0.9, 0.5)]) * 0.7
    ra = gate(d.bp(noise(n), 1500, 5000, 1), 26, 0.25) * 0.4
    cr = d.lp(noise(n, "pink"), 1500, 1) * ragged(n, 50) * 0.25
    bl = d.tri(640, n_(0.1)) * d.adsr(n_(0.1), 0.005, 0.02, 0.7, 0.03) * 0.3
    return d.mix(mo, ra, cr, (bl, 0.05, 1.0), length=n)


@sk("lv8-rover", "robovac-crack", note="rover breaking: pack metal clank + a crack, motor whine winding down 500 to 60 Hz, sparks and debris tinks")
def _():
    n = n_(0.38)
    cl = P(KI + "impactMetal_medium_002", 0.25)
    wd = d.lp(d.saw(d.expramp(n_(0.3), 500, 60), n_(0.3)), 1500, 1) * expdec(n_(0.3), 0.12) * 0.5
    sp = s.crackle(0.2, 200, 3000, 0.6, decay=0.1)
    tk = d.mix((s.bell(2200, 0.1, 0.8, 0.02) * 0.4, 0.15, 1.0), (s.bell(1700, 0.1, 0.8, 0.02) * 0.3, 0.22, 1.0), length=n)
    return d.mix((s.click(3, 0.8, hpf=1500), 0, 1.0), (cl, 0, 0.9), (wd, 0.04, 1.0), (sp, 0.02, 0.7), tk, length=n)


# ================================================================================================ LEVEL 9: Zubrowka dimension
@sk("lv9-vodka", "aerosol-rattle", note="bottle jostling: glass clinks that quicken (random glass tings), then a liquid slosh and glug")
def _():
    n = n_(0.66)
    r = d.rng()
    rt = np.zeros(n)
    t, gap = 0.0, 0.08
    while t < 0.4:
        rt = d.mix(rt, (glass(float(r.uniform(1800, 3600)), 0.1, 0.02, float(r.uniform(0.5, 1.0))), t, 1.0), length=n)
        t += gap
        gap = max(0.03, gap * 0.86)
    sl = d.mix((s.bubbles(0.22, 50, 20, 200, 600, 0.6), 0, 1.0), (d.lp(noise(n_(0.2)), 1500, 1) * env(n_(0.2), [(0, 0), (0.05, 1), (0.2, 0)]) * 0.8, 0, 1.0), length=n_(0.24))
    return d.mix(rt, (sl, 0.4, 1.0), length=n)


@sk("lv9-vodka", "aerosol-blast", "boss", note="bottle shattering: pack glass breaking + heavy glass hit, liquid splash, a low thump, a cascade of shard tings")
def _():
    n = n_(0.77)
    r = d.rng()
    gb = P(BH + "glass_breaking_03", 0.62)
    gh = d.hp(P(KI + "impactGlass_heavy_000", 0.5), 1500, 1)
    sp = s.splat(0.3, 3500, 600) * 0.6
    th = s.thump(0.25, 110, 50, tau=0.07, drive=1.8)
    sh = np.zeros(n)
    for k in range(8):
        sh = d.mix(sh, (glass(float(r.uniform(2000, 6000)), 0.15, 0.03, 0.5 - 0.04 * k), 0.1 + 0.07 * k, 1.0), length=n)
    return d.mix((gb, 0, 1.0), (gh, 0, 0.8), (sp, 0.03, 0.8), (th, 0, 0.9), sh, length=n)


@sk("lv9-bottle", "flipper", lufs=-14.7, note="bottle swing: a swish with a hollow bottle-neck 'whoo' resonance, then a pack glass hit + a ringing glass tone and a thump")
def _():
    n = n_(0.47)
    sw = s.whoosh(0.085, 900, 4000, peak=0.75, q=1.0) * 0.6
    ne = d.sweep(noise(n_(0.1)), 900, 450, "bandpass", q=8) * env(n_(0.1), [(0, 0), (0.07, 1), (0.1, 0)]) * 1.5
    gl = d.hp(P(O2 + "glass_02", 0.38), 600, 1)
    rg = glass(1250, 0.4, 0.1) * 0.5
    return fat(d.mix((sw, 0, 1.0), (ne, 0, 0.8), (gl, 0.085, 1.0), (rg, 0.085, 1.0), (s.thump(0.15, 140, 70, tau=0.04), 0.085, 0.7), length=n), 2.4)


@sk("lv9-lynx", "cat", lufs=-15.1, note="snarl: a hiss-spit, then a long growl (saw through vowel formants, strong 28 Hz AM and rasp) with a second short snarl burst")
def _():
    n = n_(0.91)
    hs = d.bp(noise(n_(0.14)), 3000, 9000, 1) * expdec(n_(0.14), 0.06) * 1.0
    g1 = vox([(0, 95), (0.5, 140), (1, 110)], 0.75, [350, 800, 1900], [4, 5, 6], [1.0, 0.8, 0.4], am=(28, 0.7), noise_amt=0.25, jit=0.02, a=0.1, r=0.2)
    g2 = vox((190, 120), 0.2, [500, 1200, 2400], [4, 5, 6], [1.0, 0.8, 0.4], am=(45, 0.6), noise_amt=0.3, jit=0.03, a=0.01, r=0.08)
    return fat(d.sat(d.mix((hs, 0, 1.0), (g1, 0.1, 1.0), (g2, 0.5, 0.7), length=n) * 1.0, 1.5), 2.0)


@sk("lv9-shotglass", "jellyfish", lufs=-15.1, note="glass-harmonica shimmer: inharmonic glass partials with 5 Hz tremolo and a woozy vibrato, glass tings, quiet slosh")
def _():
    n = n_(1.5)
    t = np.arange(n) / SR
    f = vib_(1760.0, 3, 0.012, n)
    sh = d.additive(f, n, [(1.0, 1.0), (2.32, 0.4), (4.25, 0.2)]) * (0.65 + 0.35 * np.sin(2 * np.pi * 5.3 * t)) * env(n, [(0, 0), (0.06, 1), (1.1, 0.9), (1.5, 0)]) * 0.5
    tg = np.zeros(n)
    for tm, ff, g in [(0.0, 2200, 1.0), (0.3, 3000, 0.6), (0.7, 2600, 0.5), (1.0, 3400, 0.4)]:
        tg = d.mix(tg, (glass(ff, 0.4, 0.15, g), tm, 1.0), length=n)
    sl = s.bubbles(1.2, 8, 14, 300, 900, 0.25)
    return d.mix(sh, tg, (sl, 0.1, 1.0), length=n)


@sk("lv9-eagle", "gull-screech", note="eagle cry: one long falling piercing FM whistle, then three short ones, breathy noise and a high formant")
def _():
    n = n_(0.88)
    out = np.zeros(n)
    for t, du, pts in [(0.0, 0.38, [(0, 3600), (1, 2000)]), (0.46, 0.12, [(0, 3800), (1, 3000)]), (0.61, 0.12, [(0, 3800), (1, 3000)]), (0.76, 0.12, [(0, 3700), (1, 2900)])]:
        m = n_(du)
        v = whistle(pts, du, idx=1.8, vib=0.02 if du > 0.2 else 0.0, rate=40, a=0.008, r=0.03)
        v = d.formant(v, [3000, 5500], [4, 6], [1.0, 0.5]) + d.hp(noise(m), 3000, 1) * 0.1 * d.adsr(m, 0.01, 0.05, 0.6, 0.05)
        out = d.mix(out, (v, t, 1.0), length=n)
    return d.sat(out / (np.abs(out).max() + 1e-9), 1.4)


@sk("lv9-mosquito", "wasp-buzz", note="huge mosquito: a thin 480-560 Hz whine with a detuned twin (beating), slow wobble and 14 Hz flutter")
def _():
    n = n_(0.66)
    t = np.arange(n) / SR
    f = vib_(np.linspace(480, 560, n), 5, 0.015, n)
    w = d.sine(f, n) + 0.5 * d.sine(f * 2, n) + 0.5 * d.sine(f * 1.03, n)
    w = w * (0.75 + 0.25 * np.sin(2 * np.pi * 14 * t)) * env(n, [(0, 0), (0.05, 1), (0.55, 1), (0.66, 0)])
    return d.sat(w * 0.5 + d.bp(noise(n), 3000, 8000, 1) * 0.04, 1.3)


@sk("lv9-mosquito", "wasp-dive", note="mosquito dive: whine falling 1300 to 330 Hz (doppler) over a swish, ending in a tiny tick")
def _():
    n = n_(0.5)
    t = np.arange(n) / SR
    f = vib_(d.expramp(n, 1300, 330), 6, 0.02, n)
    w = (d.sine(f, n) + 0.4 * d.sine(f * 2, n)) * (0.75 + 0.25 * np.sin(2 * np.pi * 16 * t)) * env(n, [(0, 0.3), (0.1, 1), (0.4, 0.7), (0.5, 0)])
    sw = s.whoosh(0.4, 4000, 800, peak=0.3, q=1.0, shape=1.4) * 0.3
    return d.mix((w, 0, 0.8), (sw, 0, 1.0), (s.click(2, 0.5, hpf=3000), 0.42, 1.0), length=n)


@sk("lv9-tree", "zapper-bolt", note="lightning strike: hard crack + falling zap, thunder rumble tail, pack wood splintering and fire-crackle")
def _():
    n = n_(0.71)
    z = s.zap(4200, 250, 0.18, 1.7, 4.0)
    th = d.mix(d.lp(noise(n, "brown"), 200, 2) * 4 * env(n, [(0, 0), (0.08, 0.6), (0.7, 0)]) * 0.6, (s.rumble(0.6, 50, 0.01, 0.4), 0, 0.3), length=n)
    wb = P(BH + "wood_breaking_03", 0.28)
    wc = P(MW + "wood_cracking_03", 0.3, gain=0.8)
    cr = s.crackle(0.6, 200, 600, 0.8, decay=0.3)
    return d.sat(d.mix((s.click(3, 1.0, hpf=1200), 0, 1.0), (z, 0, 1.0), (th, 0.02, 0.7), (wb, 0.03, 0.9), (wc, 0.06, 0.7), (cr, 0.03, 0.7), length=n), 1.5)


@sk("lv9-boar", "robovac-whir", "obstacle", note="trotting boar: four 'hnf' grunts (noisy low formant voice, two with a pack grunt) over paired hoof ticks")
def _():
    n = n_(0.91)
    out = np.zeros(n)
    kw = dict(formants=[300, 800, 1800], qs=[4, 5, 6], gains=[1.0, 0.7, 0.4], noise_amt=0.4, a=0.01, r=0.06, hold=0.7)
    for k, tm in enumerate([0.0, 0.24, 0.46, 0.66]):
        v = vox((95, 70), 0.14, **kw)
        if k in (0, 2):
            v = d.mix(v, (P(R + ("grunt_02" if k == 0 else "grunt_03"), 0.17, gain=0.6), 0, 1.0), length=len(v))
        out = d.mix(out, (v, tm, 1.0), length=n)
    for tm in [0.08, 0.16, 0.30, 0.38, 0.52, 0.60, 0.74, 0.82]:
        hf = d.mix(d.bp(noise(n_(0.03)), 600, 2500, 1) * expdec(n_(0.03), 0.008) * 3, (s.thump(0.06, 160, 90, tau=0.02), 0, 0.5), length=n_(0.06))
        out = d.mix(out, (hf, tm, 0.5), length=n)
    return d.sat(out, 1.3)


@sk("lv9-boar", "robovac-crack", note="boar squeal: a driven saw glide 800 to 1900 to 900 Hz with vibrato through high formants, a pack hurt cry, a thump on the hit")
def _():
    n = n_(0.38)
    sq = vox([(0, 800), (0.3, 1900), (1, 900)], 0.38, [1100, 2800, 4200], [4, 5, 6], [1.0, 0.7, 0.4], noise_amt=0.1, jit=0.04, a=0.005, r=0.06)
    hu = P(R + "hurt_01", 0.38, gain=0.5)
    return d.sat(d.mix((s.click(2, 0.8, hpf=1500), 0, 1.0), (s.thump(0.1, 140, 70, tau=0.03), 0, 0.7), (sq, 0.0, 1.0), (hu, 0.02, 0.8), length=n), 1.4)


@sk("lv9-mushrooms", "repeller-hum", "obstacle", note="glowing mushrooms: a soft three-voice sine chorus (330 Hz, a fifth, an octave) with a 4.5 Hz tremolo and a few small bell twinkles")
def _():
    n = n_(0.81)
    t = np.arange(n) / SR
    hm = np.zeros(n)
    for r_, g, dt in [(1.0, 1.0, 1.0), (1.5, 0.5, 1.004), (2.005, 0.3, 0.997)]:
        hm += g * d.sine(vib_(330.0 * r_ * dt, 5.5, 0.004, n), n)
    hm = hm * (0.65 + 0.35 * np.sin(2 * np.pi * 4.5 * t)) * env(n, [(0, 0), (0.15, 1), (0.7, 0.9), (0.81, 0)]) * 0.5
    r = d.rng()
    tw = np.zeros(n)
    for tm in [0.2, 0.45, 0.62]:
        tw = d.mix(tw, (s.bell(float(r.uniform(2800, 4200)), 0.25, 0.5, 0.08) * 0.2, tm, 1.0), length=n)
    br = d.lp(noise(n, "pink"), 800, 1) * 0.1 * env(n, [(0, 0), (0.15, 1), (0.8, 0)])
    return d.mix(hm, tw, br, length=n)


@sk("lv9-mushrooms", "repeller-ring", "obstacle", note="glow pulse: a soft sine bloom gliding up 520 to 880 Hz with a quiet fifth above and a trailing echo")
def _():
    m = n_(0.13)
    x = d.sine(d.expramp(m, 520, 880), m) + 0.3 * d.sine(d.expramp(m, 780, 1320), m)
    x = x * expdec(m, 0.05) * np.minimum(1, np.arange(m) / 250)
    return d.echo(x, 0.09, 0.45, 0.5, 2)

# ================================================================================================ LEVEL 10: wasteland
@sk("lv10-sign", "flipper", lufs=-14.7, note="bent street sign: a metallic swish, then a flat sheet-metal clang (pack metal sheet + click) with a wobbling inharmonic ring")
def _():
    n = n_(0.47)
    sw = s.whoosh(0.08, 1500, 6000, peak=0.75, q=1.0, shape=1.2) * 0.7
    sh = P(MW + "metal_sheet_03", 0.35)
    m = n_(0.38)
    wob = d.additive(vib_(640.0, 14, 0.04, m), m, [(1.0, 1.0, 0.16), (2.41, 0.6, 0.11), (3.87, 0.4, 0.08), (5.9, 0.2, 0.05)]) * 0.5
    return fat(d.mix((sw, 0, 1.0), (s.click(2, 1.0, hpf=2000), 0.08, 1.0), (sh, 0.08, 1.0), (wob, 0.08, 0.8), length=n), 2.4)


@sk("lv10-pipe", "newspaper", lufs=-16.0, note="pipe club: a heavy low swish, a hollow pack metal clonk with a tube ring (harmonics 1, 2, 3), a second small rolling clonk, rust flakes")
def _():
    n = n_(1.2)
    sw = s.whoosh(0.4, 200, 2500, peak=0.5, q=0.9, color="pink") * 1.0
    cl = d.lp(P(KI + "impactMetal_medium_004", 0.3), 3500, 1)
    m = n_(0.4)
    tube = d.additive(300.0, m, [(1.0, 1.0, 0.14), (2.0, 0.6, 0.1), (3.0, 0.35, 0.07)]) * 0.5
    small = d.mix((d.lp(P(KI + "impactMetal_light_001", 0.2), 3000, 1), 0, 0.5), (d.additive(310.0, n_(0.3), [(1.0, 1.0, 0.08), (2.0, 0.5, 0.05)]) * 0.3, 0, 1.0), length=n_(0.3))
    rs = s.crackle(0.9, 60, 2500, 0.3, decay=0.5)
    return fat(d.mix((sw, 0, 1.0), (cl, 0.2, 1.0), (s.thump(0.2, 130, 70, tau=0.05), 0.2, 0.7), (tube, 0.2, 0.8), (small, 0.55, 0.7), (small, 0.8, 0.35), (rs, 0.3, 0.8), length=n), 3.0)


@sk("lv10-mutant", "cat", lufs=-15.1, note="wrong yowl: two voices a little apart (beating) on a rising-falling pitch with irregular gurgle AM, a low octave-down voice, bubbly gurgle, hiss")
def _():
    n = n_(0.91)
    pts = [(0, 400), (0.35, 900), (1, 480)]
    kw = dict(formants=[700, 1500, 2800], qs=[4, 5, 6], gains=[1.0, 0.8, 0.5], noise_amt=0.1, jit=0.03, a=0.08, r=0.2)
    v1 = vox(pts, 0.8, am=(22, 0.5), **kw)
    v2 = vox([(a, b * 1.06) for a, b in pts], 0.8, am=(17, 0.5), **kw)
    v3 = vox([(a, b * 0.5) for a, b in pts], 0.8, am=(11, 0.6), **kw)
    gu = d.lp(s.bubbles(0.7, 30, 20, 150, 500, 0.8), 1500, 1)
    hs = d.bp(noise(n_(0.2)), 3000, 8000, 1) * expdec(n_(0.2), 0.08) * 1.2
    return d.sat(d.mix((v1, 0.05, 1.0), (v2, 0.05, 0.8), (v3, 0.05, 0.6), (gu, 0.1, 0.7), (hs, 0.0, 0.8), length=n), 1.5)


@sk("lv10-fridge", "jellyfish", lufs=-15.1, note="floating fridge: saturated 100 Hz compressor hum with its harmonics and slow tremolo, a loose-panel rattle, two electric buzz bursts with crackle, a cold high shimmer")
def _():
    n = n_(1.5)
    t = np.arange(n) / SR
    hm = np.zeros(n)
    for r_, g in [(1.0, 1.0), (2.0, 0.6), (3.0, 0.4), (4.0, 0.25)]:
        hm += g * d.sine(vib_(100.0 * r_, 0.8, 0.003, n), n)
    hm = d.sat(hm * 1.5, 2.0) * (0.8 + 0.2 * np.sin(2 * np.pi * 3 * t)) * env(n, [(0, 0), (0.05, 1), (1.1, 0.9), (1.5, 0)]) * 0.5
    ra = d.bp(s.crackle(1.5, 14, 400, 1.0), 300, 1800, 1) * env(n, [(0, 0), (0.2, 1), (1.3, 0.8), (1.5, 0)]) * 1.5
    bz = np.zeros(n)
    for tm, du in [(0.5, 0.12), (1.0, 0.16)]:
        m = n_(du)
        bz = d.mix(bz, (d.lp(d.saw(100, m) + d.saw(200.7, m) * 0.5, 3000, 1) * d.adsr(m, 0.003, 0.02, 0.8, 0.04) * 0.6 + s.crackle(du, 400, 1500, 0.3), tm, 1.0), length=n)
    sh = d.additive(5200.0, n, [(1.0, 1.0), (1.26, 0.5), (1.52, 0.35)]) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)) * env(n, [(0, 0), (0.3, 1), (1.2, 0.8), (1.5, 0)]) * 0.08
    return d.mix(hm, ra, bz, sh, length=n)


@sk("lv10-vulture", "gull-screech", note="vulture: a hoarse hiss under a croak that falls, a second longer falling croak, a low wing rush; noisy low formant voice with rasp, no whistle")
def _():
    n = n_(0.88)
    kw = dict(formants=[500, 1100, 2400], qs=[3, 4, 5], gains=[1.0, 0.8, 0.5], noise_amt=0.5, am=(60, 0.5), jit=0.03)
    hs = d.bp(noise(n_(0.3)), 2000, 8000, 1) * env(n_(0.3), [(0, 0), (0.02, 1), (0.3, 0)]) * 1.6
    c1 = vox((200, 140), 0.3, a=0.01, r=0.06, **kw)
    c2 = vox((190, 100), 0.5, a=0.02, r=0.15, **kw)
    wr = s.whoosh(0.8, 500, 3000, peak=0.4, q=0.8, color="pink") * 0.5
    return d.sat(d.mix((hs, 0, 0.8), (c1, 0.02, 1.0), (c2, 0.34, 1.0), (wr, 0.08, 0.8), length=n) * 1.0, 1.6)


def rotor(f, n, wob=0.04, rate=7.0):
    """Four slightly detuned rotors: saws that beat, with a wobble."""
    x = np.zeros(n)
    for k in (1.0, 1.012, 0.985, 1.03):
        fr = vib_(f * k, rate, wob, n) if np.isscalar(f) else vib_(np.asarray(f) * k, rate, wob, n)
        x += d.saw(fr, n)
    return d.lp(x, 3500, 1)


@sk("lv10-drone", "wasp-buzz", note="drone rotors: four detuned saw rotors (beating) around 330-380 Hz with a 7 Hz wobble, a gated bearing rattle, a dropout flutter")
def _():
    n = n_(0.66)
    t = np.arange(n) / SR
    x = rotor(np.linspace(330, 380, n), n) * (0.75 + 0.25 * np.sin(2 * np.pi * 11 * t)) * 0.3
    br = gate(d.bp(noise(n), 1500, 5000, 1), 70, 0.3, 0.25) * 0.3
    return d.sat(d.mix(x, br, length=n) * env(n, [(0, 0), (0.05, 1), (0.55, 1), (0.66, 0)]), 1.4)


@sk("lv10-drone", "wasp-dive", note="drone dive: the rotor whine pitching up 250 to 900 Hz and falling away as it passes, a rushing swish, the bearing rattle, a loose clunk at the end")
def _():
    n = n_(0.51)
    f = np.interp(np.arange(n) / SR, [0, 0.33, 0.51], [250, 900, 600])
    x = rotor(f, n, wob=0.03, rate=9.0) * 0.3 * env(n, [(0, 0.2), (0.1, 1), (0.4, 0.9), (0.51, 0)])
    w = s.whoosh(0.4, 700, 4500, peak=0.6, q=0.9) * 0.5
    br = gate(d.bp(noise(n), 1500, 5000, 1), 70, 0.3, 0.25) * 0.25
    cl = d.mix((s.click(2, 0.6, hpf=1500), 0, 1.0), (drip(300, 150, 0.06, 0.02, 0.5), 0, 1.0), length=n_(0.07))
    return d.sat(d.mix((x, 0, 1.0), (w, 0, 1.0), (br, 0, 1.0), (cl, 0.43, 1.0), length=n), 1.4)


@sk("lv10-trolley", "bison", lufs=-16.1, note="charging trolley: a dense rattling wire-basket band with a rolling clack, three squealing wonky-wheel phrases (wobbling FM whistle), cans clattering (pack tin hits + tin tings), low rolling rumble; loud for 1.9 s then rolling off")
def _():
    n = n_(3.4)
    r = d.rng()
    en = env(n, [(0, 0), (0.04, 1), (1.9, 0.95), (3.4, 0)])
    ba = d.bp(noise(n), 1500, 6500, 1) * (0.4 + 0.6 * ragged(n, 45)) * en * 1.6
    ba = ba + s.crackle(3.4, 120, 2500, 0.6) * en
    cl = gate(d.bp(noise(n), 600, 3000, 1), 13, 0.3, 0.25) * en * 0.8
    sq = np.zeros(n)
    for t0, du, f0, f1 in [(0.2, 0.7, 1800, 2600), (1.1, 0.6, 2100, 1700), (2.1, 0.5, 2400, 1600)]:
        m = n_(du)
        v = d.fm(np.linspace(f0, f1, m) * (1 + 0.04 * np.sin(2 * np.pi * 6 * np.arange(m) / SR)), 1.0, 1.5, m) * d.adsr(m, 0.03, 0.1, 0.8, 0.1) * 0.3
        sq = d.mix(sq, (v, t0, 1.0), length=n)
    cans = np.zeros(n)
    t = 0.12
    while t < 3.0:
        g = float(r.uniform(0.4, 1.0)) * (1.0 if t < 1.9 else 0.5)
        f = float(r.uniform(1200, 2800))
        cans = d.mix(cans, (s.bell(f, 0.15, 1.2, 0.03) * 0.4 * g, t, 1.0), length=n)
        if r.random() < 0.4:
            cans = d.mix(cans, (P(KI + "impactTin_medium_00%d" % int(r.integers(1, 4)), 0.2, gain=0.5 * g), t, 1.0), length=n)
        t += float(r.uniform(0.07, 0.22)) * (1.0 if t < 1.9 else 2.0)
    rb = d.lp(noise(n, "brown"), 220, 2) * 4 * en * 0.6
    return d.mix((ba, 0, 0.8), (cl, 0, 0.8), sq, (cans, 0, 0.9), (rb, 0, 0.6), length=n)


@sk("lv10-wire", "hedgehog", note="barbed wire winding up: a springy twang (falling FM with fast vibrato) and a pack metal spring, a scraping gated rasp, metallic rustle crackle, three small barb clinks")
def _():
    n = n_(0.56)
    tw = d.fm(d.expramp(n_(0.25), 720, 440) * (1 + 0.03 * np.sin(2 * np.pi * 40 * np.arange(n_(0.25)) / SR)), 2.0, 2.0, n_(0.25)) * expdec(n_(0.25), 0.1) * 0.6
    sp = P(MW + "metal_spring_02", 0.4, gain=0.6)
    sc = gate(d.bp(noise(n_(0.4)), 1500, 7000, 1), 40, 0.4, 0.3) * expdec(n_(0.4), 0.15) * 2.0
    ru = s.crackle(0.5, 180, 2500, 0.6, decay=0.25)
    cn = np.zeros(n)
    for tm, f in [(0.1, 3200), (0.2, 4100), (0.32, 3600)]:
        cn = d.mix(cn, (s.bell(f, 0.1, 1.2, 0.02) * 0.4, tm, 1.0), length=n)
    return d.mix((tw, 0, 1.0), (sp, 0, 0.8), (sc, 0, 0.8), (ru, 0.02, 0.8), cn, length=n)


_made = sorted(skins.made_ids())
_reg = sorted(sd["id"] for sd in __import__("lib.registry", fromlist=["SOUNDS"]).SOUNDS if sd["id"].startswith("lv") and sd["id"] in set(_made))
assert _made == _reg, (set(_made) ^ set(_reg))
