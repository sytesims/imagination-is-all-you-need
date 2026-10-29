#!/bin/bash
# ffmpeg smoke: the post/prep ops runNative uses (fps, resize, chunk/xfade, concat, splice-trim, audio mux).
set -e; T=$(mktemp -d); cd $T; F="ffmpeg -loglevel error -y"; P() { ffprobe -v error -select_streams v:0 -show_entries stream=$1 -of csv=p=0 "$2"; }
$F -f lavfi -i testsrc=s=640x360:r=25:d=4 -f lavfi -i sine=d=4 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac src.mp4
$F -i src.mp4 -vf fps=16 a.mp4; [ "$(P r_frame_rate a.mp4)" = "16/1" ] && echo "PASS fps16"
$F -i src.mp4 -vf scale=832:480 b.mp4; [ "$(P width,height b.mp4)" = "832,480" ] && echo "PASS resize 832x480 (mult16)"
$F -i src.mp4 -t 2 c1.mp4; $F -ss 1 -i src.mp4 c2.mp4
$F -i c1.mp4 -i c2.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=1:offset=1[v]" -map "[v]" x.mp4; echo "PASS xfade dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 x.mp4)"
printf "file 'c1.mp4'\nfile 'c2.mp4'\n" > l.txt; $F -f concat -safe 0 -i l.txt -c copy k.mp4 && echo "PASS concat"
$F -i x.mp4 -i src.mp4 -map 0:v -map 1:a -c:v copy -shortest m.mp4; [ -n "$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 m.mp4)" ] && echo "PASS audio mux"
rm -rf $T
