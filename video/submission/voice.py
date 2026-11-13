"""Generate the per-beat voiceover with ElevenLabs and record each duration.

Reads ELEVENLABS_API_KEY from the environment (never prints it), writes one MP3 per
beat into `audio/vo/`, and a `build/vo.json` manifest the timeline builder reads.
"""

import json
import os
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "audio" / "vo"
BUILD = ROOT / "build"
VOICE = "onwK4e9ZLuTAKqWW03F9"  # Daniel - Steady Broadcaster
MODEL = "eleven_multilingual_v2"
FFMPEG = ROOT.parent.parent / "node_modules" / "ffmpeg-static" / "ffmpeg"

BEATS = [
    ("b1", "This is a letter about you. Your health. Your money. Your business. And right now, to read it, someone else has to hold it."),
    ("b2", "Ask a person, and your privacy is gone. Ask a typical AI, and your privacy is gone too. Two billion people live with a vision impairment. They deserve a third option."),
    ("b3", "So here it is. Photograph the letter. It gets explained, privately, inside a sealed hardware enclave on NEAR AI Cloud."),
    ("b4", "Before a single byte leaves your device, your browser checks the hardware itself. A fresh session nonce. A signed Intel TDX quote. The enclave's own key. If a check fails, nothing is sent."),
    ("b5", "Inside that sealed memory, an AI reads every page and explains it. A summary. The key facts. What you may need to do. Warnings. In a fixed order a screen reader can follow."),
    ("b6", "Every fact points back to the line it came from. Ask a question in your own words, and the answer arrives with its quote. If the letter doesn't say it, Sightline says so. It does not guess."),
    ("b7", "Each answer is signed by the enclave that produced it, and the receipt shows which checks ran, and which could not. Proof, not promises."),
    ("b8", "Then press Forget. The pages vanish from memory. Nothing is stored, and no account is holding your documents. Sightline. Built on NEAR. Verify, don't trust."),
]


def duration(path: Path) -> float:
    out = subprocess.run([str(FFMPEG), "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"no duration for {path}")


def main() -> None:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("ELEVENLABS_API_KEY missing")
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)

    manifest = {"voice": VOICE, "model": MODEL, "beats": []}
    total_chars = 0
    for beat, text in BEATS:
        body = json.dumps({
            "text": text,
            "model_id": MODEL,
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.78, "style": 0.0, "use_speaker_boost": True},
        }).encode()
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128",
            data=body,
            headers={"xi-api-key": key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as r:
            audio = r.read()
        path = OUT / f"{beat}.mp3"
        path.write_bytes(audio)
        d = duration(path)
        total_chars += len(text)
        manifest["beats"].append({"id": beat, "text": text, "file": str(path.relative_to(ROOT)), "duration": round(d, 3)})
        print(f"{beat}: {d:6.2f}s  {len(audio) // 1024:5d} KiB  {text[:48]}...")

    manifest["chars"] = total_chars
    (BUILD / "vo.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"total speech {sum(b['duration'] for b in manifest['beats']):.2f}s, {total_chars} chars")


if __name__ == "__main__":
    main()
