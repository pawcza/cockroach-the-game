"""Instrument recipes built on dsp.py. Each one is layered (transient + body + tail), not a bare oscillator."""
import numpy as np
from . import dsp as d
from .dsp import SR, n_, expdec, noise, rng


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


# ---------------------------------------------------------------- drums / thumps
def click(ms=3, level=1.0, color="white", hpf=1500):
    n = n_(ms / 1000) + 64
    c = noise(n, color) * np.exp(-np.arange(n) / (0.0006 * SR))
    return d.hp(c, hpf, 1) * level * 3


def kick(dur=0.28, f0=170, f1=48, drive=2.2, click_level=0.5, tau=0.07):
    n = n_(dur)
    f = f1 + (f0 - f1) * np.exp(-np.arange(n) / (0.018 * SR))
    body = d.sine(f, n) * expdec(n, tau) * 1.0
    sub = d.sine(f1 * 0.99, n) * expdec(n, tau * 1.5) * 0.4
    x = body + sub
    x[:len(click())] += click(3, click_level)[:n]
    d.REC.log("kick")
    return d.sat(x, drive)


def thump(dur=0.35, f0=95, f1=38, drive=1.8, tau=0.09, noise_amt=0.25):
    n = n_(dur)
    f = f1 + (f0 - f1) * np.exp(-np.arange(n) / (0.03 * SR))
    x = d.sine(f, n) * expdec(n, tau)
    x += d.lp(noise(n, "brown"), 400, 1) * expdec(n, tau * 0.5) * noise_amt * 2
    d.REC.log("thump")
    return d.sat(x, drive)


def snare(dur=0.22, tone=190, noise_amt=0.8, drive=1.6):
    n = n_(dur)
    t = d.sine(tone * (1 + 0.5 * np.exp(-np.arange(n) / (0.01 * SR))), n) * expdec(n, 0.04) * 0.6
    z = d.hp(noise(n), 1800, 1) * expdec(n, 0.07) * noise_amt * 2
    d.REC.log("snare")
    return d.sat(t + z, drive)


def hat(dur=0.07, open_=False):
    n = n_(dur * (3 if open_ else 1))
    z = d.hp(noise(n), 6500, 2) * expdec(n, 0.02 if not open_ else 0.08) * 2
    d.REC.log("hat")
    return z


def crash(dur=1.0, bright=5500):
    n = n_(dur)
    z = d.hp(noise(n), bright * 0.6, 2) * np.exp(-np.arange(n) / (0.28 * SR))
    z += d.bp(noise(n), 3000, 9000, 1) * np.exp(-np.arange(n) / (0.12 * SR)) * 0.8
    d.REC.log("crash")
    return z * 2


# ---------------------------------------------------------------- tonal chip voices
def pulse_voice(freq, dur, duty=0.25, a=0.002, decay=0.12, sus=0.35, rel=0.05, vib=0.0, sub=0.5, bright=1.0,
                slide=None, crunch=True):
    """Layered chip note: pulse + octave-down square + noise tick, ADSR, optional vibrato / pitch slide."""
    n = n_(dur)
    f = np.full(n, float(freq))
    if slide is not None:
        f = f * np.linspace(1, slide, n)
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR) * np.minimum(1, np.arange(n) / (0.05 * SR)))
    body = d.square(f, n, duty) * 0.6 + d.square(f * 0.5, n, 0.5) * sub * 0.5 + d.tri(f * 2, n) * 0.12 * bright
    env = d.adsr(n, a, decay, sus, rel)
    x = body * env
    t = click(2, 0.12, hpf=2500)
    x[:len(t)] += t[:n]
    return d.sat(x, 1.4) if crunch else x


def bell(freq, dur=1.2, bright=1.0, tau=0.5):
    partials = [(1.0, 1.0, tau), (2.0, 0.55, tau * 0.8), (2.76, 0.5 * bright, tau * 0.6), (5.4, 0.3 * bright, tau * 0.35),
                (8.93, 0.18 * bright, tau * 0.2)]
    n = n_(dur)
    x = d.additive(freq, n, partials)
    x[:n_(0.004)] *= np.linspace(0.2, 1, n_(0.004))
    k = min(n, n_(0.04))
    x[-k:] *= np.linspace(1, 0, k)
    return x * 0.6


def organ(freq, dur=1.0, a=0.05, r=0.15, vib=0.003, drawbars=(1, 0.2, 0.8, 0.4, 0.5, 0.3, 0.2, 0.15), chorus=True):
    n = n_(dur)
    f = freq * (1 + vib * np.sin(2 * np.pi * 5.8 * np.arange(n) / SR))
    ratios = [0.5, 1.5, 1, 2, 3, 4, 5, 6]
    x = np.zeros(n)
    for r_, a_ in zip(ratios, drawbars):
        x += a_ * d.sine(f * r_, n)
        if chorus:
            x += a_ * 0.6 * d.sine(f * r_ * 1.004, n)
    env = d.adsr(n, a, 0.05, 0.9, r)
    return d.sat(x * env * 0.35, 1.3)


# ---------------------------------------------------------------- noisy things
def whoosh(dur=0.4, f0=400, f1=3000, peak=0.4, q=1.2, color="white", shape=2.0, rise=None):
    """Band-limited noise swept through a resonant filter with a rise/fall envelope."""
    n = n_(dur)
    z = noise(n, color)
    z = d.sweep(z, f0, f1, "bandpass", q=q)
    t = np.linspace(0, 1, n)
    pk = peak
    env = np.where(t < pk, (t / pk) ** shape, ((1 - t) / (1 - pk)) ** (shape * 0.8))
    d.REC.log("whoosh")
    return z * env * 2.5


def hiss(dur=0.5, lo=3000, hi=12000, a=0.01, r=0.15, color="white"):
    n = n_(dur)
    z = d.bp(noise(n, color), lo, hi, 2)
    return z * d.adsr(n, a, 0.05, 0.8, r) * 2.5


def crackle(dur=0.5, density=120, lo=1500, level=1.0, decay=0.0):
    """Random clicks of random size - sizzle / fire / static."""
    n = n_(dur)
    out = np.zeros(n)
    r = rng()
    k = int(density * dur)
    pos = r.integers(0, n - 64, k)
    amp = r.random(k) ** 2
    for p, a in zip(pos, amp):
        w = int(r.integers(8, 40))
        out[p:p + w] += (r.standard_normal(w) * np.exp(-np.arange(w) / (w / 4))) * a
    out = d.hp(out, lo, 1)
    if decay:
        out = out * expdec(n, decay)
    d.REC.log(f"crackle {density}/s")
    return out * level * 2


def rumble(dur=1.0, f=55, a=0.05, r=0.3, wob=0.0, level=1.0):
    n = n_(dur)
    z = d.lp(noise(n, "brown"), 160, 2) * 4
    s = d.sine(f * (1 + wob * np.sin(2 * np.pi * 7 * np.arange(n) / SR)), n)
    x = (z * 0.7 + s * 0.6) * d.adsr(n, a, 0.1, 0.8, r)
    d.REC.log("rumble")
    return x * level


def zap(f0=2000, f1=200, dur=0.2, fm_ratio=1.5, fm_idx=3.0, drive=2.0):
    n = n_(dur)
    f = expramp_arr(n, f0, f1)
    x = d.fm(f, fm_ratio, fm_idx * np.linspace(1, 0.2, n), n) * 0.7 + d.saw(f * 0.5, n) * 0.25
    x = x * d.adsr(n, 0.001, dur * 0.4, 0.5, dur * 0.4)
    t = click(2, 0.15)
    x[:len(t)] += t[:n]
    return d.sat(x, drive)


def expramp_arr(n, a, b):
    return d.expramp(n, a, b)


def blip_stack(freq, dur, wave="square", glide=None, fm_idx=0.0):
    n = n_(dur)
    f = np.full(n, float(freq)) if glide is None else d.expramp(n, freq, freq * glide)
    if fm_idx:
        x = d.fm(f, 2.0, fm_idx * np.linspace(1, 0, n), n)
    elif wave == "square":
        x = d.square(f, n, 0.5)
    elif wave == "pulse":
        x = d.square(f, n, 0.25)
    elif wave == "tri":
        x = d.tri(f, n)
    else:
        x = d.saw(f, n)
    return x


# ---------------------------------------------------------------- composites
def explosion(dur=1.2, low=70, bright=4000, debris=True, tail_verb=0.6, drive=2.5):
    n = n_(dur)
    body = noise(n)
    body = d.sweep(body, bright, 160, "lowpass", q=0.7)
    body *= np.exp(-np.arange(n) / (0.22 * dur * SR * 1.2))
    sub = d.sine(low + 40 * np.exp(-np.arange(n) / (0.1 * SR)), n) * np.exp(-np.arange(n) / (0.3 * dur * SR))
    x = body * 1.6 + sub * 1.1
    c = click(5, 1.0, hpf=800)
    x[:len(c)] += c[:n]
    if debris:
        cr = crackle(dur, 140, 900, 0.5, decay=dur * 0.3)
        x += np.pad(cr, (n_(0.08), 0))[:n] * 0.5
    x = d.sat(x, drive)
    d.REC.log("explosion")
    if tail_verb:
        x = d.reverb(x, tail_verb, 0.25, tail=0.3)
    return x


def splat(dur=0.35, f_hi=2200, f_lo=300, wet=1.0):
    n = n_(dur)
    z = d.sweep(noise(n), f_hi, f_lo, "bandpass", q=1.5) * np.exp(-np.arange(n) / (0.07 * SR)) * 3
    b = d.sine(expramp_arr(n, 260, 70), n) * np.exp(-np.arange(n) / (0.05 * SR))
    bubbles = crackle(dur, 90, 400, 0.6, decay=0.08)
    d.REC.log("splat")
    return d.sat(z + b * 0.8 + bubbles * wet * 0.5, 1.6)


def gun(dur=0.3, crack=1.0, body=170, boom=1.0, tail=0.18):
    n = n_(dur)
    c = d.hp(noise(n), 1200, 1) * expdec(n, 0.012) * 3 * crack
    b = d.sine(body * (0.55 + 0.45 * np.exp(-np.arange(n) / (0.012 * SR))), n) * expdec(n, 0.06) * boom
    t = d.lp(noise(n), 2500, 1) * expdec(n, tail) * 0.35
    x = c + b + t
    x[:n_(0.0007)] += 0.8
    d.REC.log("gun")
    return d.sat(x, 2.0)


def scale(root_midi, steps, mode="major_pent"):
    modes = {"major_pent": [0, 2, 4, 7, 9], "major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10]}[mode]
    out = []
    for s in steps:
        o, i = divmod(s, len(modes))
        out.append(root_midi + 12 * o + modes[i])
    return out


def circular_noise(dur, lo, hi, slope=0.0, seed_color="white"):
    """Periodic band-limited noise: shaped in the frequency domain, so the clip loops with no seam."""
    n = n_(dur)
    w = rng().standard_normal(n)
    sp = np.fft.rfft(w)
    fr = np.fft.rfftfreq(n, 1 / SR)
    shape = ((fr > lo) & (fr < hi)).astype(float)
    # soft edges
    shape = np.convolve(shape, np.hanning(41) / np.hanning(41).sum(), "same")
    if slope:
        shape *= (np.maximum(fr, 50) / 1000.0) ** slope
    x = np.fft.irfft(sp * shape, n)
    d.REC.log(f"circular noise {int(lo)}-{int(hi)}")
    return x / (np.abs(x).max() + 1e-9)


def periodic_lfo(n, cycles, phase=0.0):
    """LFO with an integer number of cycles across the clip (loop safe)."""
    return np.sin(2 * np.pi * (cycles * np.arange(n) / n + phase))


def bubbles(dur, dens0, dens1, f_lo=250, f_hi=1100, level=1.0):
    """Gloopy water bubbles, density ramps from dens0 to dens1 per second (rising/falling gurgle)."""
    n = n_(dur)
    out = np.zeros(n)
    r = rng()
    t = float(r.uniform(0, 0.02))
    while t < dur - 0.06:
        dens = dens0 + (dens1 - dens0) * (t / dur)
        w = n_(r.uniform(0.03, 0.08))
        f = r.uniform(f_lo, f_hi)
        ff = d.expramp(w, f, f * r.uniform(1.4, 2.2))
        b = d.sine(ff, w) * expdec(w, w / SR * 0.4) * np.minimum(1, np.arange(w) / 40)
        p = n_(t)
        if p + w < n:
            out[p:p + w] += b * r.uniform(0.4, 1.0)
        t += min(r.exponential(1.0 / max(dens, 1)), 2.2 / max(dens, 1))
    d.REC.log(f"bubbles {dens0:g}->{dens1:g}/s")
    return out * level
