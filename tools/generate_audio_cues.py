"""Generate the small, deterministic Adventure one-shot cue pack.

The game keeps HeroSfxBus' procedural path as a safe fallback. These PCM WAVs
are intentionally compact, authored-style cues that can be replaced by a
recorded mix later without changing the AudioFeedback cue IDs.
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


MIX_RATE = 22_050
OUT_DIR = Path(__file__).resolve().parents[1] / "client-godot" / "assets" / "audio" / "cues"

# cue_id: duration, start frequency, end frequency, harmonic recipe, noise
CUES = {
    "guard": (0.24, 118.0, 82.0, (1.0, 0.42, 0.18), 0.015),
    "slash": (0.16, 720.0, 150.0, (1.0, 0.28, 0.08), 0.045),
    "punch": (0.16, 560.0, 105.0, (1.0, 0.38, 0.16), 0.11),
    "hit": (0.16, 620.0, 120.0, (1.0, 0.32, 0.10), 0.08),
    "bow": (0.16, 1_200.0, 380.0, (1.0, 0.22, 0.04), 0.01),
    "magic": (0.18, 280.0, 920.0, (1.0, 0.35, 0.12), 0.01),
    "frost": (0.18, 340.0, 1_080.0, (1.0, 0.38, 0.18), 0.015),
    "chime": (0.18, 780.0, 780.0, (1.0, 0.55, 0.22), 0.005),
    "hammer": (0.24, 180.0, 55.0, (1.0, 0.72, 0.28), 0.13),
    "charge": (0.24, 90.0, 330.0, (1.0, 0.30, 0.08), 0.015),
    "defeat": (0.24, 210.0, 52.0, (1.0, 0.44, 0.12), 0.01),
}


def _envelope(progress: float) -> float:
    attack = min(1.0, progress / 0.035)
    release = max(0.0, 1.0 - progress)
    return attack * release**2.25


def _render(cue_id: str, duration: float, start: float, end: float, harmonics: tuple[float, ...], noise: float) -> bytes:
    samples = max(1, round(MIX_RATE * duration))
    rng = random.Random(cue_id)
    pcm = bytearray()
    phase = 0.0
    for index in range(samples):
        progress = index / float(samples - 1) if samples > 1 else 0.0
        frequency = start + (end - start) * progress
        phase += 2.0 * math.pi * frequency / MIX_RATE
        value = sum(weight * math.sin(phase * (harmonic + 1)) for harmonic, weight in enumerate(harmonics))
        value += noise * (rng.random() * 2.0 - 1.0)
        value *= _envelope(progress)
        value = max(-1.0, min(1.0, value * 0.36))
        pcm.extend(struct.pack("<h", round(value * 32_767.0)))
    return bytes(pcm)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for cue_id, spec in CUES.items():
        duration, start, end, harmonics, noise = spec
        with wave.open(str(OUT_DIR / f"{cue_id}-v1.wav"), "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(MIX_RATE)
            stream.writeframes(_render(cue_id, duration, start, end, harmonics, noise))
    print(f"Generated {len(CUES)} cues in {OUT_DIR}")


if __name__ == "__main__":
    main()
