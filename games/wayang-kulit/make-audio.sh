#!/bin/bash
# Builds the narration clips for every beat in game.json, and for its "after" line, as audio/<audio>.ogg and .m4a.
# A real recording wins: put recordings/<audio>.wav (or .m4a, .mp3, .aiff) next to this script and it is used
# instead of text-to-speech. Lines without one are spoken by macOS text-to-speech from "speak" (or "story").
#   ./make-audio.sh            build everything
#   ./make-audio.sh --script   print the lines to record, one per clip
#   VOICE=Karen RATE=150 ./make-audio.sh   try another voice; `say -v '?'` lists them
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/audio"
REC="$HERE/recordings"
VOICE="${VOICE:-Daniel}"
RATE="${RATE:-155}"
lines() {
  python3 -I -c '
import json, sys
for b in json.load(open(sys.argv[1]))["content"]["beats"]:
    for line in (b, b.get("after") or {}):
        if line.get("audio"):
            print(line["audio"] + "\t" + line.get(sys.argv[2], line["story"]))
' "$HERE/game.json" "$1"
}
if [ "${1:-}" = "--script" ]; then
  lines story | sed 's/\t/  /'
  exit
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"
FX="silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5"
lines speak | while IFS=$'\t' read -r id text; do
  src=""
  for ext in wav m4a mp3 aiff; do
    if [ -f "$REC/$id.$ext" ]; then src="$REC/$id.$ext"; break; fi
  done
  if [ -z "$src" ]; then
    say -v "$VOICE" -r "$RATE" -o "$WORK/$id.aiff" "$text"
    src="$WORK/$id.aiff"
  fi
  ffmpeg -loglevel error -y -i "$src" -af "$FX" -ar 48000 -ac 1 "$WORK/$id.wav" </dev/null
  ffmpeg -loglevel error -y -i "$WORK/$id.wav" -c:a libopus -b:a 48k "$OUT/$id.ogg" </dev/null
  ffmpeg -loglevel error -y -i "$WORK/$id.wav" -c:a aac -b:a 80k "$OUT/$id.m4a" </dev/null
  printf "%s %.2fs %s\n" "$id" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/$id.wav")" "$([ "$src" = "$WORK/$id.aiff" ] && echo "tts:$VOICE" || echo "recording")"
done
