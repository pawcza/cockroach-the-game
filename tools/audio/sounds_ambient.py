"""Two ambient music loops for the moments around the boss fights.

    boss-prelude    behind the versus splash: low, tense, building (12 s)
    boss-aftermath  behind the "NOWA MOC" ability screen after a boss dies: warm, relieved (16 s)

Every one is built to loop with no seam: each partial has a whole number of cycles in the loop, static filters run in the
frequency domain (circular), envelopes are periodic and every decaying tail wraps round the loop point. No reverb or
time-varying filter, whose state would not match across the seam.
"""
import numpy as np
from lib import dsp as d
from lib.dsp import SR, n_
from lib.registry import group, snd

AM = "Ambient music"
group("boss-prelude", AM, "Versus splash: tense pre-battle loop (every boss)", [("levels/soundtracks/lvN.ogg", "current: the level's music keeps playing")])
group("boss-aftermath", AM, "Ability screen after a boss: calm relieved loop", [("boss/lodzia-bgm.ogg", "current: the boss's own music keeps playing (Lodzia's here)")])


class Loop:
    """A loop of whole seconds, with periodic building blocks."""

    def __init__(self, seconds):
        self.T = seconds
        self.n = n_(seconds)
        self.t = np.arange(self.n) / SR

    def q(self, f):
        """The frequency nearest f with a whole number of cycles in the loop."""
        return max(1, round(f * self.T)) / self.T

    def sine(self, f, phase=0.0):
        return np.sin(2 * np.pi * (self.q(f) * self.t + phase))

    def saw(self, f, phase=0.0):
        return 2 * ((self.q(f) * self.t + phase) % 1.0) - 1

    def square(self, f, duty=0.5):
        return np.where((self.q(f) * self.t) % 1.0 < duty, 1.0, -1.0)

    def tri(self, f, phase=0.0):
        return 4 * np.abs(((self.q(f) * self.t + phase) % 1.0) - 0.5) - 1

    def lfo(self, cycles, phase=0.0):
        return np.sin(2 * np.pi * (cycles * self.t / self.T + phase))

    def noise(self, lo, hi, seed):
        """Band-limited noise that loops: shaped in the frequency domain."""
        w = np.random.default_rng(seed).standard_normal(self.n)
        sp = np.fft.rfft(w)
        fr = np.fft.rfftfreq(self.n, 1 / SR)
        sh = ((fr > lo) & (fr < hi)).astype(float)
        sh = np.convolve(sh, np.hanning(61) / np.hanning(61).sum(), "same")
        x = np.fft.irfft(sp * sh, self.n)
        return x / (np.abs(x).max() + 1e-9)

    def lp(self, x, fc, order=2):
        fr = np.fft.rfftfreq(self.n, 1 / SR)
        return np.fft.irfft(np.fft.rfft(x) / (1 + (fr / fc) ** (2 * order)), self.n)

    def hp(self, x, fc, order=2):
        fr = np.fft.rfftfreq(self.n, 1 / SR)
        r = (fr / fc) ** (2 * order)
        return np.fft.irfft(np.fft.rfft(x) * r / (1 + r), self.n)

    def place(self, out, sig, at):
        """Adds sig at `at` seconds, its tail wrapping round the loop point."""
        k = int(round(at * SR)) % self.n
        sig = sig[:self.n]
        idx = (np.arange(len(sig)) + k) % self.n
        np.add.at(out, idx, sig)
        return out

    def swell(self, start, rise, fall, power=2.0):
        """Periodic envelope: 0 until start, rises over `rise`, falls to 0 over `fall` (all in seconds, wrapping)."""
        e = np.zeros(self.n)
        a, b = int(start * SR), int((start + rise) * SR)
        idx = np.arange(self.n)
        e = np.where((idx >= a) & (idx < b), np.clip((idx - a) / max(1, b - a), 0, 1) ** power, e)
        c = int((start + rise + fall) * SR)
        up = (idx >= b) & (idx < c)
        e = np.where(up, np.cos(0.5 * np.pi * (idx - b) / max(1, c - b)) ** 2, e)
        return e


def hit(n, f0, f1, tau):
    """A decaying pitch-dropping sine thump of n samples."""
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)


def pluck(n, f, tau, bright=0.4):
    """A soft bell-ish pluck with a few partials."""
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + bright * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t / (tau * 0.5)) \
        + 0.15 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t / (tau * 0.3))
    return x * np.exp(-t / tau) * np.minimum(1, t / 0.004)


@snd("boss-prelude", "", "loop", loop=True, lufs=-21.0,
     note="12 s seamless: dark A1 drone (detuned saws, circular low-pass), a 16-step square ostinato, a heartbeat thump every 1.5 s, a minor-second dyad, a noise-and-whine riser that builds then drops away before the seam")
def _():
    L = Loop(12.0)
    drone = (L.saw(55.0) + L.saw(55.0 * 1.004) * 0.8 + L.saw(110.0 * 0.998) * 0.4) * (0.75 + 0.25 * L.lfo(1))
    drone = L.lp(drone, 260, 2) * 1.2
    # A hollow ostinato on the 16th-note grid: A A Bb A, held low
    notes = [33, 33, 34, 33]
    ost = np.zeros(L.n)
    step = L.T / 16
    for i in range(16):
        f = 440.0 * 2 ** ((notes[i % 4] + 12 - 69) / 12)
        m = int(step * SR * 0.9)
        t = np.arange(m) / SR
        v = (np.where((L.q(f) * t) % 1.0 < 0.5, 1.0, -1.0)) * np.exp(-t / 0.18) * np.minimum(1, t / 0.005)
        L.place(ost, v, i * step)
    ost = L.lp(ost, 700, 2) * 0.35
    beat = np.zeros(L.n)
    for i in range(8):
        L.place(beat, hit(n_(0.5), 90, 42, 0.12), i * 1.5)
        L.place(beat, hit(n_(0.4), 80, 40, 0.09) * 0.6, i * 1.5 + 0.28)
    dyad = (L.sine(220.0) + L.sine(233.0) * 0.9 + L.tri(110.0) * 0.5) * L.swell(2.0, 6.0, 3.5, 1.5) * 0.28
    rs = L.hp(L.lp(L.noise(300, 5000, 11), 2500, 2), 300, 1)
    riser = rs * L.swell(0.5, 10.0, 1.2, 2.5) * 0.5
    whine = L.sine(660.0 * 2) * L.swell(0.5, 10.0, 1.2, 3.0) * 0.07 * (0.6 + 0.4 * L.lfo(24))
    return d.sat(drone * 0.8 + ost + beat * 1.1 + dyad + riser + whine, 1.4)


@snd("boss-aftermath", "", "loop", loop=True, lufs=-21.5,
     note="16 s seamless: warm pad on four major chords (Fmaj7 Cmaj Dm7 Bbmaj7), three detuned triangle/sine voices each, soft overlapping swells, a slow bell arpeggio and a low root, all wrapped")
def _():
    L = Loop(16.0)
    chords = [[53, 57, 60, 64], [48, 55, 60, 64], [50, 57, 60, 65], [46, 53, 57, 62]]
    pad = np.zeros(L.n)
    for k, ch in enumerate(chords):
        start = k * 4.0 - 0.8
        env = np.zeros(L.n)
        a = int(((start) % 16.0) * SR)
        seg = np.sin(np.pi * np.arange(n_(5.6)) / n_(5.6)) ** 2
        L.place(env, seg, start % 16.0)
        voices = np.zeros(L.n)
        for m in ch:
            f = 440.0 * 2 ** ((m + 12 - 69) / 12)
            voices += L.tri(f) * 0.5 + L.sine(f * 1.003, 0.1) * 0.35 + L.sine(f * 0.997, 0.3) * 0.35
        pad += voices * env
    pad = L.lp(pad, 1800, 2) * 0.22
    bass = np.zeros(L.n)
    for k, m in enumerate([29, 24, 26, 22]):
        f = 440.0 * 2 ** ((m + 24 - 69) / 12)
        env = np.zeros(L.n)
        L.place(env, np.sin(np.pi * np.arange(n_(4.4)) / n_(4.4)) ** 1.5, (k * 4.0 - 0.2) % 16.0)
        bass += L.sine(f) * env
    bass *= 0.3
    bells = np.zeros(L.n)
    arp = [72, 76, 79, 84, 79, 76, 72, 79, 77, 81, 84, 89, 84, 81, 77, 74]
    for i, m in enumerate(arp):
        f = 440.0 * 2 ** ((m - 69) / 12)
        L.place(bells, pluck(n_(2.4), f, 0.7) * 0.1, i * 1.0 + 0.5)
    breath = L.lp(L.noise(2000, 9000, 5), 6000, 1) * (0.5 + 0.5 * L.lfo(2)) * 0.02
    return pad + bass + bells + breath
