"""Round two: weight. Amp-style drive, double-tracked (wide) parts, sub layers, punchy layered drums, loop arcs.
Everything stays circular (see engine.py), so loops remain seamless."""
import numpy as np
from engine import d, sy, SR, n_
import instruments as I


# ---------------------------------------------------------------- tone
def amp(s, x, drive=4.0, pre_hp=110, tone=3600, presence=1700, asym=0.25):
    """Overdriven amp: high-pass, fixed-level tanh drive with a little asymmetry (even harmonics: body),
    cabinet low-pass and a presence bump. Input level does not matter: the drive is set on the part's peaks."""
    y = s.circ(lambda v: d.hp(v, pre_hp, 2), x)
    y = y / (np.percentile(np.abs(y), 99.5) + 1e-12)
    y = np.tanh(y * drive + asym * (y * drive) ** 2 / (1 + abs(drive)))
    y = s.circ(lambda v: d.hp(v, 40, 1), y)
    y = s.circ(lambda v: d.lp(v, tone, 2), y)
    y = y + 0.5 * s.circ(lambda v: d.bp(v, presence * 0.7, presence * 1.4, 1), y)
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-12) * 0.25


def double(s, events, fn, part, role, cents=9, haas_ms=11, proc=None, **kw):
    """Double-tracked part: two takes, the second detuned and a few ms late, hard L/R (wide but mono-safe)."""
    a = s.notes_line(events, fn, part, role, **kw)
    b = s.notes_line([(e[0], e[1], e[2] + cents / 100) + tuple(e[3:]) for e in events], fn, **kw)
    b = np.roll(b, n_(haas_ms / 1000))
    if proc:
        a, b = proc(a), proc(b)
    return np.stack([a, b])


def spread(x2, width=1.0):
    """Mid/side width on a (2, N) pair: 1 = as is (hard L/R), 0 = mono."""
    m = (x2[0] + x2[1]) / 2
    sd = (x2[0] - x2[1]) / 2 * width
    return np.stack([m + sd, m - sd])


# ---------------------------------------------------------------- voices
def subsine(f, n, rel=0.04, a=0.004):
    m = n + n_(rel)
    return d.sine(f, m) * d.adsr(m, a, 0.05, 0.9, rel)


def fatlead(f, n, a=0.006, dec=0.3, sus=0.85, rel=0.12, vib=0.006, vrate=5.3, slide=0.0, stau=0.05):
    """Raw material for amp(): saw + 30% pulse + detuned saw + octave-down square (body before the drive)."""
    m = n + n_(rel)
    ff = I._pitch(f, m, vib, vrate, 0.18, slide, stau)
    x = d.saw(ff, m) + 0.8 * d.square(ff * 1.003, m, 0.3) + 0.6 * d.saw(ff * 0.997, m) + 0.5 * d.square(ff * 0.5, m, 0.5)
    return x * d.adsr(m, a, dec, sus, rel)


def reese(f, n, rel=0.05, det=0.009):
    m = n + n_(rel)
    x = d.saw(f * (1 - det), m) + d.saw(f * (1 + det), m) + 1.2 * d.sine(f, m) + 0.8 * d.sine(f / 2, m)
    return x * d.adsr(m, 0.003, 0.1, 0.85, rel)


def hoover(f, n, rel=0.15):
    """Rave hoover: detuned saws + PWM pulse, every note dives in from above."""
    m = n + n_(rel)
    t = np.arange(m) / SR
    ff = f * 2 ** (4 / 12 * np.exp(-t / 0.05))
    pw = 0.5 + 0.35 * np.sin(2 * np.pi * 0.8 * t)
    ph = np.cumsum(ff) / SR % 1
    x = d.saw(ff * 0.993, m) + d.saw(ff * 1.007, m) + d.saw(ff * 0.5, m) * 0.7 + np.where(ph < pw, 1.0, -1.0) * 0.6
    return x * d.adsr(m, 0.01, 0.2, 0.8, rel)


_VOW = [(800, 1150), (450, 800), (400, 1700), (650, 1080), (325, 700)]


def talk(f, n, rel=0.08):
    """Talkbox-ish lead: saw + square through a vowel that opens over the note (wah)."""
    m = n + n_(rel)
    x = d.saw(f, m) + 0.6 * d.square(f, m, 0.4)
    v0, v1 = _VOW[int(f) % 5], _VOW[(int(f) + 2) % 5]
    k = min(m, n_(0.09))
    y = d.formant(x[:k], [v0[0], v0[1], 2500], [5, 7, 8], [1, 0.8, 0.3])
    z = d.formant(x, [v1[0], v1[1], 2600], [5, 7, 8], [1, 0.8, 0.3])
    w = np.ones(m)
    w[:k] = np.linspace(0, 1, k)
    z[:k] = y * (1 - w[:k]) + z[:k] * w[:k]
    return (z + 0.15 * x) * d.adsr(m, 0.005, 0.2, 0.8, rel)


def acid(f, n, rel=0.03, c0=2600, c1=300, q=5.0, accent=1.0):
    """303-ish: saw through a resonant low-pass that snaps shut every note."""
    m = n + n_(rel)
    x = d.saw(f, m)
    y = d.sweep(x, c0 * accent, c1, "lowpass", q=q, block=32)
    return y * d.adsr(m, 0.002, 0.1, 0.8, rel)


def chug(f, n, rel=0.02):
    """Palm-muted power-chord chug (root + fifth + octave), short and dark: goes into amp()."""
    m = n + n_(rel)
    x = d.saw(f, m) + d.saw(f * 1.4983, m) * 0.8 + d.saw(f * 2, m) * 0.5 + d.square(f * 0.5, m) * 0.4
    return x * d.adsr(m, 0.002, 0.06, 0.5, rel) * np.exp(-np.arange(m) / (0.18 * SR))


def power(f, n, rel=0.2):
    """Open power chord (root + fifth + octave), sustained: goes into amp()."""
    m = n + n_(rel)
    x = d.saw(f, m) + d.saw(f * 1.4983, m) * 0.85 + d.saw(f * 2.003, m) * 0.6 + d.square(f * 0.5, m, 0.5) * 0.3
    return x * d.adsr(m, 0.004, 0.4, 0.75, rel)


# ---------------------------------------------------------------- drums
def big_kick(tau=0.12, f0=170, f1=46, drive=3.2):
    n = n_(0.55)
    k = sy.kick(0.55, f0, f1, drive, 0.8, tau)
    t = np.arange(n) / SR
    sub = d.sine(f1 * (1 + 0.3 * np.exp(-t / 0.02)), n) * np.exp(-t / (tau * 2.2)) * 0.6
    sub[:n_(0.004)] *= np.linspace(0, 1, n_(0.004))
    return np.tanh((k[:n] + sub) * 1.6) * 0.9


def big_snare(tone=185, tail=0.18):
    n = n_(0.5)
    sn = np.pad(I.snare(tone, 0.3, 1.0, 2.4), (0, n))[:n]
    cl = np.pad(I.clap(), (0, n))[:n] * 0.5
    t = d.hp(d.noise(n), 1600, 2) * np.exp(-np.arange(n) / (tail * SR)) * 0.8
    return np.tanh((sn + cl + t) * 1.5)


def stomp():
    """A slipper-stomp on old floorboards: low thud + wooden knock + the kick underneath."""
    n = n_(0.45)
    t = np.arange(n) / SR
    thud = d.lp(d.noise(n, "brown"), 300, 2) * np.exp(-t / 0.05) * 4
    knock = d.formant(np.pad(sy.click(4, 1.0, hpf=200), (0, n))[:n], [180, 420, 900], [8, 10, 10], [1, 0.7, 0.4]) * 6
    k = big_kick(0.09, 150, 50, 2.6)[:n]
    return np.tanh((k + thud * 0.5 + knock * 0.6) * 1.3)


def clank_snare():
    """Industrial snare: snare + metal clank + a crushed noise burst."""
    n = n_(0.45)
    sn = np.pad(I.snare(210, 0.25, 1.0, 2.5), (0, n))[:n]
    mt = np.pad(I.metal(740, 0.4, 0.07), (0, n))[:n]
    z = d.crush(d.bp(d.noise(n), 800, 6000, 1) * np.exp(-np.arange(n) / (0.06 * SR)), hold=4, bits=5)
    return np.tanh((sn + 0.6 * mt + 0.5 * z) * 1.6)


def drum_bus(s, x, drive=2.0, mix=0.45, thresh=-14):
    """Parallel drive + compression: drums that hit and stay dense."""
    y = s.circ(lambda v: d.comp(v, thresh, 4.0, 0.002, 0.08, makeup=False), x)
    return x + mix * np.tanh(y * drive * 2) * 0.5


# ---------------------------------------------------------------- arc
def arc(s, pts):
    """Periodic piecewise-linear gain over the loop: pts = [(beat, gain), ...] (wraps to the first point)."""
    b = np.array([p[0] for p in pts] + [pts[0][0] + s.beats], float)
    g = np.array([p[1] for p in pts] + [pts[0][1]], float)
    x = np.arange(s.N) / s.spb
    return np.interp(x, b, g)


def build(s, start_beat, beats, roll_sig=None, gain=0.5, riser=True, stem="bg"):
    """A build into the next downbeat: 16th snare roll (crescendo) + noise riser."""
    if roll_sig is not None:
        k = int(beats * 4)
        roll = [(start_beat + i * 0.25, 0.25 + 0.75 * (i / max(1, k - 1)) ** 1.5) for i in range(k)]
        s.send(stem, s.hits_line(roll, lambda v: roll_sig), gain * 0.5, rev=0.2, name="build roll")
    if riser:
        rs = I.riser(s.sec(beats), 300, 7000)
        s.send("amb", s.hits_line([(start_beat, 1.0)], lambda v: rs), 0.5, rev=0.5, name="build riser")
