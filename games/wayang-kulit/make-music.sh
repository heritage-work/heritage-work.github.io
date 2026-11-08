#!/bin/bash
# Builds the looping gamelan track as audio/gamelan-loop.ogg and .m4a from a live recording:
# "Ladrang Wilujeng" by Gamelan Nyai Saraswati, CC BY-NC 3.0 US, from the Free Music Archive.
# The cut stays between 3:12 and 4:04, the stretch with no singing, so it never talks over the narration.
# A and B are the two most alike moments in that stretch: the loop runs from A to B, and its first FADE
# seconds blend A with B so that the end runs straight back into the start.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="https://files.freemusicarchive.org/storage-freemusicarchive-org/music/Oddio_Overplay/Gamelan_Nyai_Saraswati/Performing_Music_of_Central_Java/Gamelan_Nyai_Saraswati_-_02_-_Ladrang_WILUJENG.mp3"
A=192.05
B=231.6738
FADE=1.5
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
curl -fsSL -o "$WORK/source.mp3" "$URL"
END_A=$(python3 -I -c "print($A + $FADE)")
END_B=$(python3 -I -c "print($B + $FADE)")
ffmpeg -loglevel error -y -i "$WORK/source.mp3" -filter_complex "
  [0:a]aformat=sample_rates=48000:channel_layouts=mono,asplit=3[a][b][c];
  [a]atrim=$A:$END_A,asetpts=PTS-STARTPTS,afade=t=in:d=$FADE:curve=qsin[in];
  [b]atrim=$B:$END_B,asetpts=PTS-STARTPTS,afade=t=out:d=$FADE:curve=qsin[out];
  [in][out]amix=inputs=2:normalize=0[join];
  [c]atrim=$END_A:$B,asetpts=PTS-STARTPTS[body];
  [join][body]concat=n=2:v=0:a=1[loop]" -map "[loop]" "$WORK/loop.wav"
ffmpeg -loglevel error -y -i "$WORK/loop.wav" -c:a libopus -b:a 64k "$HERE/audio/gamelan-loop.ogg"
ffmpeg -loglevel error -y -i "$WORK/loop.wav" -c:a aac -b:a 96k "$HERE/audio/gamelan-loop.m4a"
