"""Mix the ElevenLabs voiceover over the synthesized bed, ducking the bed under speech.

VO is placed at the timeline's beat starts, so the narration and the picture share one grid.
Output: `build/mix.wav` (48 kHz stereo, loudness-normalised for social).
"""

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
FFMPEG = ROOT.parent.parent / "node_modules" / "ffmpeg-static" / "ffmpeg"

TL = json.loads((BUILD / "timeline.json").read_text())
VO = json.loads((BUILD / "vo.json").read_text())


def run(args: list[str]) -> None:
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f"ffmpeg failed\n{p.stderr[-3000:]}")


def main() -> None:
    inputs = ["-i", str(BUILD / "bed.wav")]
    filters = []
    labels = []
    for i, beat in enumerate(VO["beats"]):
        path = ROOT / beat["file"]
        delay = int(round(TL["beats"][i] * 1000))
        inputs += ["-i", str(path)]
        filters.append(
            f"[{i + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={delay}|{delay},volume=1.0[v{i}]"
        )
        labels.append(f"[v{i}]")

    chain = f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0,"
    chain += f"alimiter=limit=0.95,apad=whole_dur={TL['duration']},asplit=2[voA][voB]"
    filters.append(chain)
    # Bed sits under the voice: sidechain the music bus by the voice bus.
    filters.append("[0:a][voB]sidechaincompress=threshold=0.04:ratio=5:attack=8:release=420[bedduck]")
    filters.append("[bedduck][voA]amix=inputs=2:normalize=0:dropout_transition=0,"
                   "loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[aout]")

    args = [str(FFMPEG), "-y", "-hide_banner", *inputs,
            "-filter_complex", ";".join(filters),
            "-map", "[aout]", "-t", str(TL["duration"]), "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
            str(BUILD / "mix.wav")]
    run(args)

    probe = subprocess.run([str(FFMPEG), "-hide_banner", "-i", str(BUILD / "mix.wav"),
                            "-af", "ebur128=peak=true", "-f", "null", "-"],
                           capture_output=True, text=True)
    tail = probe.stderr.strip().splitlines()[-12:]
    print("\n".join(tail))
    size = (BUILD / "mix.wav").stat().st_size / 1048576
    print(f"mix.wav {size:.1f} MiB")


if __name__ == "__main__":
    main()
