"""Loop-music engine for the boss soundtracks, built on lib/dsp.py and lib/synth.py.

Everything renders at dsp.SR (44.1 kHz) and is *circular*: a song is exactly N samples, every note or effect tail
that runs past N is folded back onto the start, filters run over two copies and keep the second, reverb is an FFT
circular convolution. So each stem loops with no seam, and the three stems (same N, same grid) stay in sync.
The output is resampled to 24 kHz stereo (the rate of the existing music), also circularly.
"""
import os, re, sys, zlib
import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib import dsp as d  # noqa: E402
from lib import synth as sy  # noqa: E402

SR = d.SR
OUT_SR = 24000
UP, DOWN = 80, 147          # 44100 * 80 / 147 = 24000
n_ = d.n_
STEMS = ("fg", "bg", "amb")

# ---------------------------------------------------------------- pitch / notation
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(s):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", s)
    if not m:
        raise ValueError(s)
    return 12 * (int(m[3]) + 1) + _PC[m[1]] + (1 if m[2] == "#" else -1 if m[2] == "b" else 0)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def _dur(s):
    """'1', '.5', '1.5', '2t' (= 2/3 beat, triplets)."""
    return float(s[:-1]) / 3 if s.endswith("t") else float(s)


def phrase(s, start=0.0, vel=1.0):
    """'A4/1 C5/.5 r/.5 E5/2t' -> [(beat, dur, midi, vel)]. A '!' after the note accents it."""
    out, t = [], start
    for tok in s.split():
        nm, du = tok.split("/")
        du = _dur(du)
        acc = nm.endswith("!")
        nm = nm.rstrip("!")
        if nm != "r":
            out.append((t, du, midi(nm), vel * (1.25 if acc else 1.0)))
        t += du
    return out


def bars(song, *rows, vel=1.0):
    """One phrase string per bar, concatenated on the bar grid (each string must fill its bar)."""
    ev = []
    for i, r in enumerate(rows):
        p = phrase(r, i * song.meter, vel)
        total = sum(_dur(tok.split("/")[1]) for tok in r.split())
        assert abs(total - song.meter) < 1e-6, (song.sid, i, r, total)
        ev += p
    return ev


_Q = {"": (0, 4, 7), "m": (0, 3, 7), "7": (0, 4, 7, 10), "m7": (0, 3, 7, 10), "dim": (0, 3, 6), "5": (0, 7),
      "sus4": (0, 5, 7), "maj7": (0, 4, 7, 11), "m7b5": (0, 3, 6, 10)}


def chord(name):
    """'F#m' -> (root pitch class, intervals)."""
    m = re.fullmatch(r"([A-G])([#b]?)(.*)", name)
    pc = (_PC[m[1]] + (1 if m[2] == "#" else -1 if m[2] == "b" else 0)) % 12
    return pc, _Q[m[3]]


def root(name, octave):
    return 12 * (octave + 1) + chord(name)[0]


def voicing(name, center=62, n=3):
    """Close voicing of the chord's first n tones nearest to `center`."""
    pc, iv = chord(name)
    pcs = [(pc + i) % 12 for i in iv][:n]
    out = []
    for p in pcs:
        cands = [p + 12 * k for k in range(1, 9)]
        out.append(min(cands, key=lambda c: abs(c - center)))
    return sorted(out)


SCALES = {"minor": (0, 2, 3, 5, 7, 8, 10), "harm": (0, 2, 3, 5, 7, 8, 10, 11), "major": (0, 2, 4, 5, 7, 9, 11),
          "phryg": (0, 1, 3, 5, 7, 8, 10), "minor+": (0, 2, 3, 5, 7, 8, 9, 10, 11)}


# ---------------------------------------------------------------- song
class Song:
    def __init__(self, sid, bpm, nbars, meter=4, sub=2):
        self.sid, self.bpm, self.bars, self.meter = sid, bpm, nbars, meter
        self.beats = nbars * meter
        sec = self.beats * 60.0 / bpm
        self.N24 = int(round(sec * OUT_SR / UP)) * UP
        self.N = self.N24 * DOWN // UP
        self.spb = self.N / self.beats
        self.L = self.N + n_(8.0)
        self.sub = sub
        d.REC.reset(sid)
        self.rng = np.random.default_rng(zlib.crc32(sid.encode()))
        self.stems = {k: {"dry": np.zeros((2, self.N)), "rev": np.zeros((2, self.N)), "dly": np.zeros((2, self.N))}
                      for k in STEMS}
        self.fx = {k: dict(rt60=1.2, damp=5000, rev=0.9, dly_beats=0.75, fb=0.35, dly_lp=3500) for k in STEMS}
        self.notes = []          # (part, role, beat, dur, midi) for the theory checks
        self.harmony = []        # (beat, dur, chord name)
        self.sections = []       # (beat, scale root pc, scale name)
        self.parts = []          # (stem, part name, lufs) for the balance printout
        self._cache = {}

    # grid
    def at(self, beat):
        return int(round(beat * self.spb))

    def sec(self, beats):
        return beats * self.spb / SR

    def ns(self, beats):
        return int(round(beats * self.spb))

    # buffers
    def line(self):
        return np.zeros(self.L)

    def fold(self, x):
        y = x[:self.N].copy()
        k = self.N
        while k < len(x):
            seg = x[k:k + self.N]
            y[:len(seg)] += seg
            k += self.N
        return y

    def circ(self, fn, x):
        """Run a (causal) process over two copies of the loop, keep the second: steady-state, seamless."""
        return fn(np.concatenate([x, x]))[self.N:2 * self.N]

    def put(self, buf, sig, beat, gain=1.0, offset_s=0.0):
        i = (self.at(beat) + n_(offset_s)) % self.N
        sig = sig[:self.L - i]
        buf[i:i + len(sig)] += sig * gain

    # notes
    def render(self, fn, f, n, kw):
        key = (fn.__name__, round(float(f), 4), n, tuple(sorted(kw.items())))
        if key not in self._cache:
            self._cache[key] = fn(f, n, **kw)
        return self._cache[key]

    def notes_line(self, events, fn, part=None, role=None, legato=1.0, **kw):
        buf = self.line()
        for e in events:
            beat, du, m = e[0], e[1], e[2]
            v = e[3] if len(e) > 3 else 1.0
            sig = self.render(fn, hz(m), max(n_(0.02), int(self.ns(du) * legato)), kw)
            self.put(buf, sig, beat, v)
            if part:
                self.notes.append((part, role, beat, du, m))
        return self.fold(buf)

    def hits_line(self, hits, sig_for):
        """hits: [(beat, gain[, variant])]; sig_for(variant) -> mono hit."""
        buf = self.line()
        for h in hits:
            self.put(buf, sig_for(h[2] if len(h) > 2 else 0), h[0], h[1])
        return self.fold(buf)

    def chords(self, prog, beats_each=None):
        """prog: list of (beat, dur, name); also recorded for the checks."""
        self.harmony += prog
        return prog

    def section(self, beat, tonic, scale):
        self.sections.append((beat, chord(tonic)[0], scale))

    # mixing
    def send(self, stem, x, gain=1.0, pan=0.0, rev=0.0, dly=0.0, name=""):
        st = self.stems[stem]
        if x.ndim == 1:
            a = (pan + 1) * np.pi / 4
            x2 = np.stack([x * np.cos(a), x * np.sin(a)]) * np.sqrt(2)
        else:
            x2 = x
        x2 = x2 * gain
        st["dry"] += x2
        if rev:
            st["rev"] += x2 * rev
        if dly:
            st["dly"] += x2 * dly
        if name:
            self.parts.append((stem, name, round(lufs_gated(x2), 1)))

    def stereo(self, xl, xr):
        return np.stack([xl, xr])

    # periodic helpers
    def lfo(self, cycles, phase=0.0):
        return sy.periodic_lfo(self.N, cycles, phase)

    def pump(self, depth=0.5, rec=0.22, every=1.0, offset=0.0):
        """Sidechain-style duck on a beat grid (periodic, so loop safe)."""
        i = np.arange(self.N)
        per = self.spb * every
        ph = ((i - offset * self.spb) % per) / SR
        return 1 - depth * np.clip(1 - ph / rec, 0, 1) ** 2

    def noise(self, lo, hi, slope=0.0):
        """Periodic band-limited noise covering the whole loop."""
        w = self.rng.standard_normal(self.N)
        sp = np.fft.rfft(w)
        fr = np.fft.rfftfreq(self.N, 1 / SR)
        shape = ((fr > lo) & (fr < hi)).astype(float)
        if slope:
            shape *= (np.maximum(fr, 30) / 1000.0) ** slope
        k = np.hanning(201)
        shape = np.convolve(shape, k / k.sum(), "same")
        x = np.fft.irfft(sp * shape, self.N)
        return x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * 0.25

    # final
    def ir(self, rt60, damp, seed):
        r = np.random.default_rng(seed)
        ln = n_(rt60 * 1.3)
        e = np.exp(-6.9 * np.arange(ln) / (rt60 * SR))
        ir = r.standard_normal(ln) * e
        ir = signal.sosfilt(signal.butter(1, damp / (SR / 2), "lowpass", output="sos"), ir)
        ir[:n_(0.012)] *= np.linspace(0, 1, n_(0.012))
        ir = np.concatenate([np.zeros(n_(0.015)), ir])
        return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-12)

    def cconv(self, x, ir):
        h = np.zeros(self.N)
        h[:len(ir)] = ir
        return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(h), self.N)

    def finish_stem(self, stem):
        st, fx = self.stems[stem], self.fx[stem]
        out = st["dry"].copy()
        seed = zlib.crc32((self.sid + stem).encode())
        if np.any(st["rev"]):
            send = np.stack([self.circ(lambda v: d.hp(v, 180, 1), c) for c in st["rev"]])
            for c in range(2):
                out[c] += self.cconv(send[c], self.ir(fx["rt60"], fx["damp"], seed + c)) * fx["rev"]
        if np.any(st["dly"]):
            m = self.circ(lambda v: d.lp(d.hp(v, 250, 1), fx["dly_lp"], 1), st["dly"].mean(0))
            dn = self.ns(fx["dly_beats"])
            for k in range(1, 7):
                out[(k + 1) % 2] += np.roll(m, dn * k) * fx["fb"] ** (k - 1) * 0.8
        out = np.stack([self.circ(lambda v: d.hp(v, 28, 2), c) for c in out])
        return out - out.mean(axis=1, keepdims=True)

    def to_out(self, x2):
        """44.1 kHz circular -> 24 kHz circular."""
        y = signal.resample_poly(np.tile(x2, (1, 3)), UP, DOWN, axis=1)
        return y[:, self.N24:2 * self.N24]


# ---------------------------------------------------------------- loudness (BS.1770 gated, circular)
def _kw(x, sr):
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, x)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    a = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return signal.lfilter([1, -2, 1], a, y)


def lufs_gated(x2, sr=SR):
    """Integrated loudness of a loop (stereo: channel powers summed, as BS.1770 / ffmpeg ebur128)."""
    x2 = np.atleast_2d(x2)
    n = x2.shape[1]
    p = np.zeros(n)
    for c in x2:
        k = _kw(np.concatenate([c, c]), sr)[n:]
        p += k ** 2
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    cs = np.concatenate([[0.0], np.cumsum(np.concatenate([p, p[:blk]]))])
    st = np.arange(0, n, hop)
    z = (cs[st + blk] - cs[st]) / blk
    lz = -0.691 + 10 * np.log10(z + 1e-15)
    z = z[lz > -70]
    if not len(z):
        return -70.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def true_peak_db(x2):
    """4x oversampled peak of a 24 kHz loop (circular)."""
    x2 = np.atleast_2d(x2)
    n = x2.shape[1]
    up = signal.resample_poly(np.tile(x2, (1, 3)), 4, 1, axis=1)[:, 4 * n:8 * n]
    return float(20 * np.log10(np.abs(up).max() + 1e-12))


def centroid_hz(x2, sr=OUT_SR):
    """Amplitude-weighted spectral centroid of the mid signal (as lib/dsp.py analyse)."""
    m = np.atleast_2d(x2).mean(0)
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m))))
    fr = np.fft.rfftfreq(len(m), 1 / sr)
    return int((sp * fr).sum() / (sp.sum() + 1e-12))
