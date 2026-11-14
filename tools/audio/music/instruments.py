"""Instruments for the boss loops. Note voices take (freq, gate_samples, **kw) and return gate + release samples;
drums and noises return one mono hit. Built on lib/dsp.py and lib/synth.py."""
import numpy as np
from engine import d, sy, SR, n_

pi2 = 2 * np.pi


def _t(m):
    return np.arange(m) / SR


def _pitch(f, m, vib=0.0, vrate=5.5, vdelay=0.12, slide=0.0, stau=0.03, wob=0.0):
    t = _t(m)
    ff = np.full(m, float(f))
    if slide:
        ff *= 2 ** (slide / 12 * np.exp(-t / stau))
    if vib:
        ff *= 1 + vib * np.sin(pi2 * vrate * t) * np.clip((t - vdelay) / 0.15, 0, 1)
    if wob:  # slow, seasick
        ff *= 1 + wob * np.sin(pi2 * 1.7 * t + 1.0)
    return ff


# ---------------------------------------------------------------- note voices
def pulse(f, n, duty=0.25, a=0.003, dec=0.15, sus=0.6, rel=0.08, vib=0.0, vrate=5.5, slide=0.0, stau=0.03,
          sub=0.0, wob=0.0):
    m = n + n_(rel)
    ff = _pitch(f, m, vib, vrate, 0.12, slide, stau, wob)
    x = d.square(ff, m, duty) + sub * d.square(ff * 0.5, m, 0.5)
    return x * d.adsr(m, a, dec, sus, rel)


def tri(f, n, a=0.004, dec=0.1, sus=0.7, rel=0.06, vib=0.0, slide=0.0):
    m = n + n_(rel)
    return d.tri(_pitch(f, m, vib, 5.5, 0.12, slide), m) * d.adsr(m, a, dec, sus, rel)


def supersaw(f, n, det=0.006, a=0.01, dec=0.25, sus=0.7, rel=0.15, vib=0.004, slide=0.0):
    m = n + n_(rel)
    ff = _pitch(f, m, vib, 5.2, 0.18, slide, 0.04)
    x = d.saw(ff * (1 - det), m) + d.saw(ff, m) * 0.9 + d.saw(ff * (1 + det), m) + d.square(ff * 0.5, m) * 0.3
    return x * d.adsr(m, a, dec, sus, rel) * 0.4


def accordion(f, n, a=0.012, rel=0.06, vib=0.0):
    """Musette: two reeds detuned +-7 cents (the beating is the accordion), a third reed an octave down."""
    m = n + n_(rel)
    ff = _pitch(f, m, vib, 5.0, 0.2)
    x = (d.square(ff * 2 ** (7 / 1200), m, 0.30) + d.square(ff * 2 ** (-7 / 1200), m, 0.22)
         + 0.45 * d.square(ff * 0.5, m, 0.4))
    return x * d.adsr(m, a, 0.08, 0.8, rel) * 0.5


def fmv(f, n, ratio=1.0, idx=2.0, idx_end=0.6, itau=0.08, rise=0.0, a=0.004, dec=0.2, sus=0.6, rel=0.08,
        vib=0.0, slide=0.0, stau=0.04, sub=0.0):
    """2-op FM: decaying index = pluck/bass, rising index (rise>0) = brass."""
    m = n + n_(rel)
    ff = _pitch(f, m, vib, 5.0, 0.15, slide, stau)
    t = _t(m)
    if rise:
        index = idx_end + (idx - idx_end) * (1 - np.exp(-t / rise))
    else:
        index = idx_end + (idx - idx_end) * np.exp(-t / itau)
    x = d.fm(ff, ratio, index, m) + sub * d.sine(ff * 0.5, m)
    return x * d.adsr(m, a, dec, sus, rel)


def organ(f, n, a=0.004, r=0.07, drawbars=(0.6, 0.0, 1.0, 0.7, 0.4, 0.3, 0.0, 0.15)):
    return sy.organ(f, (n + n_(r)) / SR, a, r, vib=0.002, drawbars=drawbars, chorus=True)


def bellv(f, n, tau=0.5, bright=1.0):
    return sy.bell(f, max(n / SR, 0.3) + tau, bright, tau)


def pluck(f, n, duty=0.125, tau=0.09, rel=0.03):
    m = n + n_(rel)
    return d.square(f, m, duty) * d.expdec(m, tau) * d.adsr(m, 0.001, 0, 1, rel)


def sawbass(f, n, a=0.003, dec=0.12, sus=0.7, rel=0.05, slide=0.0, stau=0.05, drop=0.0):
    m = n + n_(rel)
    ff = _pitch(f, m, 0, 5, 0.1, slide, stau)
    if drop:  # pitch sags down at the end of the note (comic, wet)
        t = _t(m)
        ff *= 2 ** (-drop / 12 * np.clip((t - n / SR * 0.6) / (n / SR * 0.4 + 1e-3), 0, 1) ** 2)
    x = d.saw(ff, m) * 0.7 + d.square(ff * 0.5, m) * 0.4 + d.sine(ff * 0.5, m) * 0.5
    return x * d.adsr(m, a, dec, sus, rel)


def pad(f, n, a=0.25, rel=0.4, det=0.005):
    m = n + n_(rel)
    x = d.saw(f * (1 - det), m) + d.saw(f * (1 + det), m) + 0.5 * d.square(f, m, 0.5)
    return x * d.adsr(m, a, 0.2, 0.85, rel) * 0.35


# ---------------------------------------------------------------- drums
def kick(kind="disco"):
    if kind == "disco":
        return sy.kick(0.30, 150, 50, 2.0, 0.35, 0.075)
    if kind == "deep":
        return sy.kick(0.55, 110, 38, 2.6, 0.25, 0.14)
    if kind == "hard":
        return sy.kick(0.32, 190, 48, 3.2, 0.6, 0.06)
    if kind == "march":
        return sy.thump(0.45, 120, 52, 1.6, 0.11, 0.35)
    raise ValueError(kind)


def snare(tone=190, dur=0.22, noise_amt=0.8, drive=1.6):
    return sy.snare(dur, tone, noise_amt, drive)


def clap():
    n = n_(0.26)
    z = d.noise(n)
    env = np.zeros(n)
    for k, o in enumerate((0.0, 0.008, 0.017)):
        i = n_(o)
        env[i:] += np.exp(-np.arange(n - i) / (0.0035 * SR)) * (0.9 if k < 2 else 0.0)
    i = n_(0.024)
    env[i:] += np.exp(-np.arange(n - i) / (0.06 * SR)) * 0.8
    return d.bp(z, 850, 3800, 2) * env * 3


def hat(open_=False, dur=0.05):
    return sy.hat(dur, open_)


def shaker():
    n = n_(0.07)
    e = np.minimum(1, np.arange(n) / n_(0.012)) * d.expdec(n, 0.02)
    return d.bp(d.noise(n), 4500, 11000, 2) * e * 2


def tamb():
    n = n_(0.16)
    z = d.bp(d.noise(n), 6000, 11000, 2)
    jing = 0.6 + 0.4 * np.sin(pi2 * 48 * _t(n))
    return z * d.expdec(n, 0.05) * jing * 2.2


def rim():
    n = n_(0.06)
    x = d.square(1650, n, 0.5) * d.expdec(n, 0.006) * 0.5 + d.bp(d.noise(n), 2000, 6000, 1) * d.expdec(n, 0.004) * 2
    return x


def tom(f=110, dur=0.4):
    n = n_(dur)
    ff = f * (1 + 0.6 * np.exp(-_t(n) / 0.03))
    x = d.sine(ff, n) * d.expdec(n, dur * 0.35) + d.lp(d.noise(n), 1500, 1) * d.expdec(n, 0.03) * 0.6
    return d.sat(x, 1.5)


def timpani(f=65, dur=1.3):
    n = n_(dur)
    x = d.additive(f, n, [(1, 1.0, dur * 0.5), (1.5, 0.5, dur * 0.35), (1.98, 0.35, dur * 0.3), (2.44, 0.2, dur * 0.2)])
    x[:n_(0.01)] *= np.linspace(0, 1, n_(0.01))
    x += d.lp(d.noise(n), 900, 1) * d.expdec(n, 0.04) * 0.5
    return x


def metal(f=420, dur=0.6, tau=0.18):
    """Clank: inharmonic partials (pipe, tank, anvil)."""
    n = n_(dur)
    x = d.additive(f, n, [(1, 1.0, tau), (2.32, 0.7, tau * 0.7), (4.25, 0.45, tau * 0.5), (6.63, 0.3, tau * 0.35)])
    x[:n_(0.002)] *= np.linspace(0, 1, n_(0.002))
    c = sy.click(2, 0.4, hpf=1500)[:n]
    x[:len(c)] += c
    return x


def crash(dur=1.6):
    return sy.crash(dur, 6000)


# ---------------------------------------------------------------- textures
def drip(f=900):
    """Water drop: a short resonant plink whose pitch shoots up (bubble resonance), tiny click first."""
    n = n_(0.16)
    ff = d.expramp(n, f, f * 2.4)
    ff[n_(0.03):] = ff[n_(0.03)]
    x = d.sine(ff, n) * d.expdec(n, 0.025) * np.minimum(1, np.arange(n) / 30)
    return x + np.pad(sy.click(1, 0.15, hpf=3000), (0, n))[:n]


def gurgle(r, dur=1.4, lo=140, hi=650, dens=22):
    """Drain gurgle: a burst of bubbles (dense in the middle) over a low sucking swell."""
    n = n_(dur)
    out = np.zeros(n)
    t = 0.0
    while t < dur - 0.09:
        k = np.sin(np.pi * t / dur) ** 1.5
        w = n_(r.uniform(0.03, 0.09))
        f = r.uniform(lo, hi)
        b = d.sine(d.expramp(w, f, f * r.uniform(1.3, 2.1)), w) * d.expdec(w, w / SR * 0.4) * np.minimum(1, np.arange(w) / 40)
        p = n_(t)
        out[p:p + w] += b * r.uniform(0.3, 1.0) * (0.3 + 0.7 * k)
        t += r.exponential(1.0 / (dens * (0.3 + k)))
    swell = d.lp(d.noise(n, "brown"), 260, 2) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2 * 1.2
    return out + swell


def breath(dur, inhale=True):
    """Breathing through a gas mask: filtered noise through the mask's cavity (comb) and resonances."""
    n = n_(dur)
    z = d.noise(n, "pink")
    t = np.linspace(0, 1, n)
    if inhale:
        x = d.bp(z, 900, 4200, 2)
        x = d.formant(x, [700, 1300, 2600], [5, 6, 7], [1, 0.8, 0.5])
        env = np.sin(np.pi * t) ** 1.2 * (0.6 + 0.4 * t)
    else:
        x = d.bp(z, 250, 2000, 2)
        x = d.formant(x, [320, 850, 1700], [4, 6, 6], [1, 0.9, 0.4])
        env = np.sin(np.pi * t ** 0.7) ** 1.0
        flap = np.zeros(n)
        for o in (0.0, 0.035):
            i = n_(o)
            k = min(n - i, n_(0.02))
            flap[i:i + k] += d.sine(130, k) * d.expdec(k, 0.004) * 1.5
        x = x + flap * (np.std(x) * 6)
    k = n_(0.0026)
    x = x + 0.55 * np.concatenate([np.zeros(k), x[:-k]])
    return x * env


def steam(dur=0.5, lo=2500, a=0.008, tau=None):
    n = n_(dur)
    z = d.hp(d.noise(n), lo, 2) + d.bp(d.noise(n), 900, 2500, 1) * 0.3
    env = np.minimum(1, np.arange(n) / n_(a)) * (d.expdec(n, tau) if tau else d.adsr(n, a, 0.05, 0.8, dur * 0.4))
    return z * env * 2


def riser(dur, f0=300, f1=5000):
    n = n_(dur)
    z = d.sweep(d.noise(n), f0, f1, "bandpass", q=1.2)
    t = np.linspace(0, 1, n)
    return d.fade(z * t ** 2.2 * 2.5, 0, 12)


def rev_crash(dur=1.0):
    return d.fade(d.rev(sy.crash(dur, 6000)), 0, 10)


def creak(f=90, dur=1.2, rate0=22, rate1=40):
    """Pipe groan: a slowing/speeding train of micro-clicks through metal resonances."""
    n = n_(dur)
    rate = np.linspace(rate0, rate1, n)
    ph = np.cumsum(rate) / SR
    tr = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    tr *= 0.6 + 0.4 * np.sin(pi2 * 3 * np.linspace(0, 1, n)) ** 2
    x = d.formant(tr, [f, f * 2.31, f * 3.9], [30, 25, 20], [1, 0.6, 0.35])
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * 0.3
    return x * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.8


def crowd(song, voices=10):
    """Party murmur: buzzy syllables through moving vowel formants, many voices, low-passed and roomy."""
    vowels = [(730, 1090), (530, 1840), (270, 2290), (570, 840), (300, 870), (660, 1700), (440, 1020)]
    r = song.rng
    buf = song.line()
    total = song.N / SR
    for _ in range(voices):
        f0 = r.uniform(100, 240)
        t = r.uniform(0, 0.6)
        while t < total:
            if r.random() < 0.15:
                t += r.uniform(0.25, 0.9)
                continue
            dur = r.uniform(0.09, 0.26)
            m = n_(dur)
            ff = f0 * (1 + r.uniform(-0.08, 0.08)) * np.linspace(1 + r.uniform(-0.05, 0.05), 1, m)
            src = d.saw(ff, m) * 0.6 + d.noise(m) * 0.25
            F1, F2 = vowels[int(r.integers(len(vowels)))]
            y = d.formant(src, [F1, F2, 2600], [5, 7, 8], [1, 0.6, 0.2])
            y *= np.sin(np.pi * np.linspace(0, 1, m)) ** 0.7
            i = n_(t)
            seg = y[:song.L - i]
            buf[i:i + len(seg)] += seg * r.uniform(0.4, 1.0)
            t += dur + r.uniform(0.0, 0.06)
    x = song.fold(buf)
    x = song.circ(lambda v: d.lp(d.hp(v, 160, 1), 2400, 2), x)
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * 0.25


def crowd_clap(r, people=14):
    n = n_(0.2)
    out = np.zeros(n + n_(0.08))
    for _ in range(people):
        o = int(abs(r.normal(0, 0.011)) * SR)
        m = n_(0.09)
        z = d.bp(d.noise(m), r.uniform(800, 1400), r.uniform(2200, 4200), 1)
        e = np.exp(-np.arange(m) / (r.uniform(0.004, 0.012) * SR))
        out[o:o + m] += z * e * r.uniform(0.4, 1.0)
    return out


def glass(r):
    """Glasses clinking at a wedding table: two short inharmonic pings."""
    f = r.uniform(2400, 3600)
    n = n_(0.5)
    x = d.additive(f, n, [(1, 1.0, 0.12), (2.71, 0.4, 0.06), (1.006, 0.6, 0.15)])
    x[:n_(0.002)] *= np.linspace(0, 1, n_(0.002))
    o = n_(r.uniform(0.04, 0.12))
    y = x.copy()
    y[o:] += x[:-o] * 0.7
    return y


def hum(song, f0, harmonics=(1.0, 0.5, 0.35, 0.2, 0.12)):
    x = np.zeros(song.N)
    t = np.arange(song.N)
    for k, a in enumerate(harmonics, 1):
        # integer number of cycles per loop so it loops perfectly
        cyc = round(f0 * k * song.N / SR)
        x += a * np.sin(pi2 * cyc * t / song.N)
    return x * (1 + 0.15 * song.lfo(3))


# ---------------------------------------------------------------- the flat (Babcia Lodzia)
def tick(f=2300, tau=0.004):
    """Wall clock: a dry escapement click with a little wooden case resonance."""
    n = n_(0.08)
    x = d.bp(d.noise(n), f * 0.7, f * 1.8, 2) * d.expdec(n, tau) * 3
    x += d.sine(f * 0.55, n) * d.expdec(n, 0.012) * 0.5
    return x


def floorboard(r):
    return creak(r.uniform(160, 320), r.uniform(0.5, 1.0), r.uniform(25, 45), r.uniform(45, 80))


def shuffle(dur=0.35):
    """Slipper dragged over the floor."""
    n = n_(dur)
    z = d.bp(d.noise(n, "pink"), 500, 4000, 1)
    return z * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5 * 1.5


def simmer(song):
    """Kettle on the stove: small bubbles over a low burner rumble, periodic so it loops."""
    b = sy.bubbles(song.N / SR, 14, 14, 500, 1600, 1.0)[:song.N]
    b = np.pad(b, (0, song.N - len(b)))
    return b * 0.5 + song.noise(60, 400, -1.0) * (0.8 + 0.2 * song.lfo(2))


def whistle(dur=2.5, f=1900):
    """Kettle whistle: breathy sine that wavers up to pitch, then dies as somebody takes it off."""
    n = n_(dur)
    t = np.linspace(0, 1, n)
    ff = f * (0.9 + 0.1 * np.minimum(1, t * 4)) * (1 + 0.004 * np.sin(pi2 * 6 * t * dur))
    x = d.sine(ff, n) + d.bp(d.noise(n), f * 0.8, f * 1.3, 2) * 0.6
    env = np.minimum(1, t * 3) ** 2 * np.clip((1 - t) * 4, 0, 1)
    return x * env


def radio(song, lo=300, hi=3200):
    """A kitchen radio left on far away: band-limited babble + static, swelling slowly."""
    v = crowd(song, 4)
    v = song.circ(lambda q: d.bp(q, lo, hi, 2), v)
    st = song.noise(1500, 7000)
    return v + st * 0.3
