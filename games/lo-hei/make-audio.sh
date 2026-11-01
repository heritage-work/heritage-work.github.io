#!/bin/bash
# Generates the lo hei phrase clips with macOS text-to-speech into the game's audio folder.
set -euo pipefail
OUT=/Users/andrewfam/heritage/heritage-games/games/lo-hei/audio
WORK="$(mktemp -d)"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
FX="silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1.5"
for p in "OPEN 恭喜发财！万事如意" "NNYY 年年有余" "DJDL 大吉大利" "ZCJB 招财进宝" "YBWL 一本万利！财源广进" "HYDT 鸿运当头" "QCYZ 青春永驻" "FSSQ 风生水起！步步高升" "JYMW 金银满屋" "SYXL 生意兴隆" "MDHJ 满地黄金"; do
  set -- $p
  say -v Tingting -r 175 -o "$1.aiff" "$2！"
  ffmpeg -loglevel error -y -i "$1.aiff" -af "$FX" -ar 48000 "$1.wav"
done
for f in OPEN NNYY DJDL ZCJB YBWL HYDT QCYZ FSSQ JYMW SYXL MDHJ; do
  ffmpeg -loglevel error -y -i $f.wav -c:a libopus -b:a 64k "$OUT/$f.ogg"
  ffmpeg -loglevel error -y -i $f.wav -c:a aac -b:a 96k "$OUT/$f.m4a"
  printf "%s %.2fs\n" $f "$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f.wav)"
done
ls "$OUT"
