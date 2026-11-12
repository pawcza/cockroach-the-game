#!/usr/bin/env python3
"""Contact sheet of waveform + spectrogram per sound - a way to look at the set when you cannot listen.
    python3 tools/audio/spectro.py OUT.png id1 id2 ...   (ids from out/)"""
import os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import dsp

def sheet(ids, path, cols=3):
    rows = (len(ids) + cols - 1) // cols
    fig, axs = plt.subplots(rows * 2, cols, figsize=(5.2 * cols, 2.6 * rows), gridspec_kw={"height_ratios": [1, 2] * rows}, squeeze=False)
    for k, sid in enumerate(ids):
        r, c = divmod(k, cols)
        x = dsp.decode_ogg(os.path.join(HERE, "out", sid + ".ogg"))
        t = np.arange(len(x)) / dsp.SR
        a = axs[r * 2][c]; a.plot(t, x, lw=0.4, color="#4a90d9"); a.set_ylim(-1, 1); a.set_xlim(0, t[-1]); a.set_title(sid, fontsize=8, pad=2)
        a.tick_params(labelsize=5); a.set_xticks([])
        b = axs[r * 2 + 1][c]; b.specgram(x, NFFT=512, Fs=dsp.SR, noverlap=384, cmap="magma", vmin=-110, vmax=-20)
        b.set_ylim(0, 12000); b.tick_params(labelsize=5)
    for k in range(len(ids), rows * cols):
        r, c = divmod(k, cols); axs[r * 2][c].axis("off"); axs[r * 2 + 1][c].axis("off")
    plt.tight_layout(); plt.savefig(path, dpi=80); plt.close()

if __name__ == "__main__":
    sheet(sys.argv[2:], sys.argv[1])
