"""Small numpy/scipy DSP kit for the sound set. Everything is float64 mono at 44.1 kHz.

Every helper that changes a sound appends a short note to REC (the "processing chain" that ends up in the
manifest). build.py resets REC per sound.
"""
import os, subprocess, zlib
import numpy as np
from scipy import signal

SR = 44100
PACKS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_packs")


class Rec:
    def __init__(self):
        self.reset()

    def reset(self, sid=""):
        self.chain = []
        self.sources = []
        self.synth = False
        self.sid = sid
        self.rng = np.random.default_rng(zlib.crc32(sid.encode()))

    def log(self, s):
        self.chain.append(s)

    def src(self, s):
        if s not in self.sources:
            self.sources.append(s)


REC = Rec()


def rng():
    REC.synth = True
    return REC.rng


def n_(sec):
    return int(round(sec * SR))


def tt(sec):
    return np.arange(n_(sec)) / SR


# ---------------------------------------------------------------- loading
_cache = {}


def load(rel, start=0.0, dur=None):
    """Load a pack file (path relative to _packs/) as mono float at SR via ffmpeg. Source is recorded."""
    path = os.path.join(PACKS, rel)
    key = path
    if key not in _cache:
        cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
        raw = subprocess.run(cmd, capture_output=True, check=True).stdout
        _cache[key] = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    x = _cache[key].copy()
    REC.src(rel)
    REC.log(f"load {os.path.basename(rel)}")
    a = n_(start)
    b = len(x) if dur is None else a + n_(dur)
    if start or dur:
        REC.log(f"cut {start:.2f}+{dur if dur else 'end'}")
    return x[a:b]


# ---------------------------------------------------------------- envelopes
def expdec(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def adsr(n, a, d, s, r):
    """a,d,r in seconds, s level 0..1; sustains until the last r seconds."""
    na, nd, nr = n_(a), n_(d), n_(r)
    ns = max(0, n - na - nd - nr)
    e = np.concatenate([
        np.linspace(0, 1, na, endpoint=False) if na else np.zeros(0),
        np.linspace(1, s, nd, endpoint=False) if nd else np.zeros(0),
        np.full(ns, s),
        np.linspace(s, 0, nr) if nr else np.zeros(0)])
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]


def ramp(n, a, b, curve=1.0):
    r = np.linspace(0, 1, n) ** curve
    return a + (b - a) * r


def expramp(n, a, b):
    return a * (b / a) ** np.linspace(0, 1, n)


# ---------------------------------------------------------------- oscillators
def _phase(freq, n):
    REC.synth = True
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    return np.cumsum(f) / SR


def sine(freq, n):
    return np.sin(2 * np.pi * _phase(freq, n))


def square(freq, n, duty=0.5):
    p = _phase(freq, n) % 1.0
    return np.where(p < duty, 1.0, -1.0)


def saw(freq, n):
    p = _phase(freq, n) % 1.0
    return 2 * p - 1


def tri(freq, n):
    p = _phase(freq, n) % 1.0
    return 4 * np.abs(p - 0.5) - 1


def noise(n, color="white"):
    REC.synth = True
    w = rng().standard_normal(n)
    if color == "white":
        return w / 3
    if color == "pink":
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        p = signal.lfilter(b, a, w)
        return p / (np.abs(p).max() + 1e-9) * 0.9
    if color == "brown":
        p = np.cumsum(w)
        p -= signal.lfilter([1], [1, -0.999], p) * 0  # keep plain
        p = signal.sosfilt(signal.butter(1, 20 / (SR / 2), "highpass", output="sos"), p)
        return p / (np.abs(p).max() + 1e-9) * 0.9
    raise ValueError(color)


def fm(fc, ratio, index, n):
    """2-op FM. fc scalar/array, index scalar/array (modulation depth in radians)."""
    f = np.full(n, float(fc)) if np.isscalar(fc) else np.asarray(fc, float)
    ph_m = np.cumsum(f * ratio) / SR
    ph_c = np.cumsum(f) / SR
    return np.sin(2 * np.pi * ph_c + index * np.sin(2 * np.pi * ph_m))


def additive(freq, n, partials):
    """partials: list of (ratio, amp[, decay_tau_s])."""
    REC.synth = True
    out = np.zeros(n)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    ph = np.cumsum(f) / SR
    for p in partials:
        r, a = p[0], p[1]
        s = np.sin(2 * np.pi * ph * r + rng().uniform(0, 6.28))
        if len(p) > 2:
            s = s * expdec(n, p[2])
        out += a * s
    return out


# ---------------------------------------------------------------- filters
def _sos(kind, fc, order=2):
    fc = np.clip(fc, 20, SR / 2 * 0.95)
    return signal.butter(order, fc / (SR / 2) if np.isscalar(fc) else fc / (SR / 2), kind, output="sos")


def lp(x, fc, order=2):
    REC.log(f"lp{int(fc)}")
    return signal.sosfilt(_sos("lowpass", fc, order), x)


def hp(x, fc, order=2):
    REC.log(f"hp{int(fc)}")
    return signal.sosfilt(_sos("highpass", fc, order), x)


def bp(x, lo, hi, order=2):
    REC.log(f"bp{int(lo)}-{int(hi)}")
    return signal.sosfilt(_sos("bandpass", np.array([lo, hi]), order), x)


def sweep(x, f0, f1, kind="lowpass", q=0.8, block=64, expo=True):
    """Time-varying resonant biquad (RBJ) filter, cutoff glides f0 -> f1 across the clip."""
    n = len(x)
    REC.log(f"{kind[:2]}sweep {int(f0)}->{int(f1)} q{q}")
    out = np.zeros(n)
    zi = np.zeros(2)
    nb = (n + block - 1) // block
    fcs = expramp(nb, f0, f1) if expo else np.linspace(f0, f1, nb)
    for i in range(nb):
        fc = float(np.clip(fcs[i], 30, SR * 0.45))
        w0 = 2 * np.pi * fc / SR
        al = np.sin(w0) / (2 * q)
        cw = np.cos(w0)
        if kind == "lowpass":
            b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        elif kind == "highpass":
            b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        else:  # bandpass, constant 0 dB peak
            b = [al, 0, -al]
        a = [1 + al, -2 * cw, 1 - al]
        b = np.array(b) / a[0]
        a = np.array(a) / a[0]
        seg, zi = signal.lfilter(b, a, x[i * block:(i + 1) * block], zi=zi)
        out[i * block:(i + 1) * block] = seg
    return out


def formant(x, freqs, qs=None, gains=None):
    """Sum of band-pass resonators, e.g. for a belch or growl."""
    qs = qs or [6] * len(freqs)
    gains = gains or [1] * len(freqs)
    out = np.zeros_like(x)
    for f, q, g in zip(freqs, qs, gains):
        b, a = signal.iirpeak(f / (SR / 2), q)
        out += g * signal.lfilter(b, a, x)
    REC.log("formant " + "/".join(str(int(f)) for f in freqs))
    return out


# ---------------------------------------------------------------- nonlinear / lo-fi
def sat(x, drive=2.0):
    REC.log(f"sat{drive:g}")
    return np.tanh(x * drive) / np.tanh(drive)


def fold(x, amount=2.0):
    REC.log(f"fold{amount:g}")
    y = x * amount
    return np.sin(y * np.pi / 2) if amount > 1 else y


def crush(x, hold=2, bits=None):
    """Sample-and-hold decimation (no anti-alias, on purpose) and optional bit reduction."""
    REC.log(f"crush hold{hold}" + (f" {bits}bit" if bits else ""))
    y = x
    if hold > 1:
        n = len(x)
        idx = (np.arange(n) // hold) * hold
        y = x[idx]
    if bits:
        q = 2 ** (bits - 1)
        y = np.round(y * q) / q
    return y


def ringmod(x, f):
    REC.log(f"ring{int(f)}")
    return x * sine(f, len(x))


def tremolo(x, rate, depth):
    return x * (1 - depth + depth * (0.5 + 0.5 * sine(rate, len(x))))


def comp(x, thresh_db=-18, ratio=4.0, atk=0.003, rel=0.06, makeup=True, block=32):
    """Feed-forward peak compressor (block based), for punch."""
    REC.log(f"comp {thresh_db}dB {ratio}:1")
    n = len(x)
    pad = (-n) % block
    xp = np.pad(np.abs(x), (0, pad)).reshape(-1, block).max(axis=1)
    ca = np.exp(-block / (atk * SR))
    cr = np.exp(-block / (rel * SR))
    env = np.zeros_like(xp)
    e = 0.0
    for i, v in enumerate(xp):
        e = ca * e + (1 - ca) * v if v > e else cr * e + (1 - cr) * v
        env[i] = e
    db = 20 * np.log10(env + 1e-9)
    over = np.maximum(db - thresh_db, 0)
    gain_db = -over * (1 - 1 / ratio)
    g = np.repeat(10 ** (gain_db / 20), block)[:n]
    y = x * g
    if makeup:
        y = y * 10 ** ((-thresh_db * (1 - 1 / ratio)) / 20 * 0.5)
    return y


# ---------------------------------------------------------------- space
def reverb(x, rt60=0.25, mix=0.15, predelay=0.004, damp=5000, tail=None):
    """Small-room reverb: exponentially decaying filtered-noise impulse response, convolved."""
    REC.log(f"verb rt{rt60:g} mix{mix:g}")
    ln = n_(rt60 * 1.2)
    r = np.random.default_rng(7)
    ir = r.standard_normal(ln) * np.exp(-6.9 * np.arange(ln) / (rt60 * SR))
    ir = signal.sosfilt(signal.butter(1, damp / (SR / 2), "lowpass", output="sos"), ir)
    ir = np.concatenate([np.zeros(n_(predelay)), ir])
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    extra = n_(tail) if tail is not None else len(ir)
    xp = np.pad(x, (0, extra))
    wet = signal.fftconvolve(xp, ir)[:len(xp)]
    return xp * (1 - mix * 0.5) + wet * mix * 1.6


def echo(x, delay=0.12, fb=0.4, mix=0.3, taps=4, tail=True):
    REC.log(f"echo {delay:g}s")
    d = n_(delay)
    out = np.pad(x, (0, d * taps if tail else 0)).copy()
    for k in range(1, taps + 1):
        s = d * k
        out[s:s + len(x)] += x[:len(out) - s] * (fb ** k) * mix * 2 if s < len(out) else 0
    return out


# ---------------------------------------------------------------- time / pitch
def pitch(x, ratio):
    """Resample (changes speed and pitch together)."""
    REC.log(f"pitch x{ratio:.3f}")
    n = int(len(x) / ratio)
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x)


def glide_resample(x, ratio_env):
    """Time-varying playback rate: ratio_env is an array of rates sampled at output rate."""
    pos = np.cumsum(ratio_env)
    pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)


def rev(x):
    REC.log("reverse")
    return x[::-1].copy()


def fade(x, ms_in=0, ms_out=4):
    x = x.copy()
    a, b = n_(ms_in / 1000), n_(ms_out / 1000)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def trim(x, db=-55, keep_ms=0):
    """Drop leading/trailing digital silence below db relative to peak."""
    th = np.abs(x).max() * 10 ** (db / 20)
    idx = np.where(np.abs(x) > th)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - n_(keep_ms / 1000))
    b = min(len(x), idx[-1] + 1 + n_(keep_ms / 1000))
    return x[a:b]


def mix(*layers, length=None):
    """layers: (array, offset_seconds, gain) tuples or plain arrays."""
    items = []
    for l in layers:
        if isinstance(l, tuple):
            arr = l[0]
            off = l[1] if len(l) > 1 else 0.0
            g = l[2] if len(l) > 2 else 1.0
        else:
            arr, off, g = l, 0.0, 1.0
        items.append((arr, n_(off), g))
    n = length if length else max(len(a) + o for a, o, g in items)
    out = np.zeros(n)
    for a, o, g in items:
        if o >= n:
            continue
        seg = a[:n - o]
        out[o:o + len(seg)] += seg * g
    return out


def pad_to(x, sec):
    n = n_(sec)
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def make_loop(x, xfade=0.08):
    """Make x loop seamlessly: crossfade the tail into the head, drop the overlap."""
    REC.log(f"loopfade {xfade:g}s")
    k = n_(xfade)
    head = x[:k]
    body = x[k:].copy()
    w = np.linspace(0, 1, k)
    body[-k:] = body[-k:] * (1 - w) + head * w
    return body


# ---------------------------------------------------------------- loudness
def _kweight(x):
    # ITU-R BS.1770 K-weighting, coefficients for 48 kHz re-derived for 44.1 kHz via bilinear transform
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / SR)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, x)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / SR)
    a = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    b = [1, -2, 1]
    return signal.lfilter(b, a, y)


def lufs(x):
    """K-weighted loudness over the whole clip, ungated (clips are too short for BS.1770 gating)."""
    if len(x) < 8:
        return -70.0
    k = _kweight(x)
    ms = np.mean(k ** 2)
    return -0.691 + 10 * np.log10(ms + 1e-12)


def peak_db(x):
    return 20 * np.log10(np.abs(x).max() + 1e-12)


def softlimit(x, ceil_db=-1.5):
    """Transparent below the knee, tanh-rounded above; guarantees |x| <= ceiling."""
    c = 10 ** (ceil_db / 20)
    knee = 0.6 * c
    y = x.copy()
    a = np.abs(y)
    m = a > knee
    over = (a[m] - knee) / (c - knee)
    y[m] = np.sign(y[m]) * (knee + (c - knee) * np.tanh(over))
    return y


def normalize(x, target_lufs, ceil_db=-1.5):
    """Gain to the target ungated loudness, then soft-limit so the peak is under the ceiling.
    For very spiky clips the limiter takes over, so the result can end up quieter than the target."""
    x = x - np.mean(x)
    cur = lufs(x)
    g = 10 ** ((target_lufs - cur) / 20)
    y = x * g
    for _ in range(3):  # limiting lowers loudness a bit: nudge gain back up (bounded)
        y2 = softlimit(y, ceil_db)
        diff = target_lufs - lufs(y2)
        if diff < 0.5 or peak_db(y) > ceil_db + 14:
            break
        y = y * 10 ** (min(diff, 3) / 20)
    y = softlimit(y, ceil_db)
    REC.log(f"norm {target_lufs:g}LUFS peak<={ceil_db:g}")
    return y


# ---------------------------------------------------------------- analysis
def analyse(x):
    """Numbers that stand in for listening: duration, peak, loudness, spectral centroid, attack time."""
    n = len(x)
    a = np.abs(x)
    pk = a.max() + 1e-12
    env = signal.lfilter([1 - 0.995], [1, -0.995], a)  # ~4.5 ms smoothing
    # attack: time to reach 90 % of the peak of the smoothed envelope
    e_pk = env.max()
    att = np.argmax(env >= 0.9 * e_pk) / SR
    # rough "start" (first sample above 5 % of peak) to catch late starts
    onset = np.argmax(a >= 0.05 * pk) / SR
    spec = np.abs(np.fft.rfft(x * np.hanning(n)))
    fr = np.fft.rfftfreq(n, 1 / SR)
    cen = float((spec * fr).sum() / (spec.sum() + 1e-12))
    # tail: last time envelope is above -40 dB of peak
    idx = np.where(env > e_pk * 0.01)[0]
    active = (idx[-1] / SR) if len(idx) else 0
    # DC offset and clipped samples
    dc = float(np.mean(x))
    return {
        "duration_s": round(n / SR, 3),
        "peak_dbfs": round(float(20 * np.log10(pk)), 2),
        "lufs": round(float(lufs(x)), 1),
        "centroid_hz": int(cen),
        "attack_ms": round(att * 1000, 1),
        "onset_ms": round(onset * 1000, 1),
        "active_s": round(active, 3),
        "crest_db": round(float(20 * np.log10(pk / (np.sqrt(np.mean(x ** 2)) + 1e-12))), 1),
        "dc": round(dc, 5),
    }


# ---------------------------------------------------------------- encode
def encode_ogg(x, path, q=5):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
           "-c:a", "libvorbis", "-q:a", str(q), "-map_metadata", "-1", "-fflags", "+bitexact",
           "-flags:a", "+bitexact", path]
    subprocess.run(cmd, input=pcm, check=True)


def decode_ogg(path):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)
