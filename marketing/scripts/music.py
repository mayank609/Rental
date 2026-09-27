"""
Procedural, royalty-free music bed for the RentNest promo.

Warm 96 BPM pop groove (Cmaj7 - Am7 - Fmaj7 - G6): soft pad + pluck arp +
sub bass, drums enter on the first reveal, whooshes on every scene cut and
a chime on the end card. Generated from scratch, so it is safe for ads.

  python3 music.py <duration_s> <out.wav> <cut1,cut2,...> <drop_s> <endcard_s>
"""
import sys, wave
import numpy as np

SR = 44100
dur = float(sys.argv[1]); out = sys.argv[2]
cuts = [float(x) for x in sys.argv[3].split(",") if x]
drop = float(sys.argv[4]); endcard = float(sys.argv[5])
LOOP = len(sys.argv) > 6 and sys.argv[6] == "loop"  # seamless loop: no fades, no riser/chime
n = int(SR * dur)
t = np.arange(n) / SR
mix = np.zeros((n, 2))
rng = np.random.default_rng(7)

BPM = 96
beat = 60 / BPM
bar = 4 * beat
note = lambda m: 440.0 * 2 ** ((m - 69) / 12)
CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]  # Cmaj7 Am7 Fmaj7 G6

def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= n: return
    sig = sig[: n - i]
    l = gain * np.sqrt(0.5 * (1 - pan)); r = gain * np.sqrt(0.5 * (1 + pan))
    mix[i:i + len(sig), 0] += sig * l
    mix[i:i + len(sig), 1] += sig * r

def env_adsr(length, a, d, s, r):
    k = int(length * SR); e = np.ones(k) * s
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, max(ai, 1))[:len(e[:ai])]
    e[ai:ai + di] = np.linspace(1, s, max(di, 1))[:len(e[ai:ai + di])]
    if ri: e[-ri:] *= np.linspace(1, 0, ri)
    return e

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y

# --- Pad (detuned saws, low-passed), one chord per bar ----------------------
pos = 0.0; ci = 0
while pos < dur:
    length = bar
    tt = np.arange(int(length * SR)) / SR
    sig = np.zeros_like(tt)
    for m in CHORDS[ci % 4]:
        for det in (-0.12, 0.12):
            f = note(m + 12) * 2 ** (det / 12)
            sig += 2 * ((tt * f) % 1) - 1
    sig = lowpass(sig / 8, 1400) * env_adsr(length, 0.35, 0.3, 0.8, 0.4)
    add(sig, pos, 0.16, -0.2)
    add(sig, pos + 0.011, 0.16, 0.2)
    pos += bar; ci += 1

# --- Pluck arpeggio (8ths) ---------------------------------------------------
pos = 0.0; step = 0
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
while pos < dur:
    chord = CHORDS[int(pos // bar) % 4]
    m = chord[pattern[step % 8]] + 24
    tt = np.arange(int(0.45 * SR)) / SR
    f = note(m)
    sig = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 9)
    add(sig, pos, 0.10 if pos < drop else 0.13, 0.35 if step % 2 else -0.35)
    pos += beat / 2; step += 1

# --- Drums + bass after the drop --------------------------------------------
k = 0
pos = drop
while pos < endcard + 1.2:
    b = k % 4
    tt = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * (50 + 110 * np.exp(-tt * 28)) * tt) * np.exp(-tt * 9)
    if b in (0, 2): add(kick, pos, 0.55)
    if b in (1, 3):
        nz = rng.standard_normal(int(0.18 * SR)); tn = np.arange(len(nz)) / SR
        clap = (nz - lowpass(nz, 900)) * np.exp(-tn * 22)
        add(clap, pos, 0.16)
    for h in (0, 0.5):
        nz = rng.standard_normal(int(0.05 * SR)); tn = np.arange(len(nz)) / SR
        hat = (nz - lowpass(nz, 6000)) * np.exp(-tn * 70)
        add(hat, pos + h * beat, 0.07, 0.25)
    root = CHORDS[int(pos // bar) % 4][0] - 12
    tb = np.arange(int(beat * 0.9 * SR)) / SR
    bass = np.sin(2 * np.pi * note(root) * tb) * env_adsr(beat * 0.9, 0.01, 0.1, 0.7, 0.08)
    add(bass, pos, 0.28)
    pos += beat; k += 1

# --- Whooshes on cuts, riser into the drop, chime on end card ---------------
def whoosh(length=0.7):
    nz = rng.standard_normal(int(length * SR)); tn = np.linspace(0, 1, len(nz))
    shape = np.sin(np.pi * tn) ** 2
    return (nz - lowpass(nz, 1200)) * shape
for c in cuts: add(whoosh(), c - 0.35, 0.10)
tr = np.arange(int(1.2 * SR)) / SR
riser = np.sin(2 * np.pi * (200 + 900 * (tr / 1.2) ** 2) * tr) * (tr / 1.2) ** 2
if not LOOP: add(riser, drop - 1.2, 0.06)
for i, m in enumerate([] if LOOP else [84, 88, 91, 96]):
    tt = np.arange(int(1.8 * SR)) / SR
    add(np.sin(2 * np.pi * note(m) * tt) * np.exp(-tt * 3), endcard + i * 0.09, 0.09, -0.3 + i * 0.2)

# --- Master: gentle fades, soft clip, normalise to -1 dBFS -------------------
fade_in = np.clip(t / 0.4, 0, 1); fade_out = np.clip((dur - t) / 1.4, 0, 1)
if LOOP: fade_in = fade_out = np.ones_like(t)
mix *= (fade_in * fade_out)[:, None]
mix = np.tanh(mix * 1.2)
mix *= 0.89 / max(1e-9, np.abs(mix).max())
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", out)
