#!/bin/bash
# Regenerates web/public/examples/hq-*.mp4/.jpg from Blender open movies (CC BY 3.0).
# Needs /tmp/src/sintel720.mp4 (download.blender.org/durian/trailer/sintel_trailer-720p.mp4)
# and /tmp/src/bbb1080.mov (download.blender.org/peach/trailer/trailer_1080p.mov).
set -e; O=web/public/examples; S=/tmp/src/sintel720.mp4; B=/tmp/src/bbb1080.mov
mk(){ # id src start dur aspect(w:h) x-offset(0..1)
  local id=$1 src=$2 ss=$3 d=$4 a=$5 xo=${6:-0.5}; local w h; w=${a%:*}; h=${a#*:}
  local pre=""; [ "$src" = "$S" ] && pre="crop=1280:536:0:92,"; local vf="${pre}crop='min(iw,ih*$w/$h)':'min(ih,iw*$h/$w)':'(iw-min(iw,ih*$w/$h))*$xo':'(ih-min(ih,iw*$h/$w))/2',scale=-2:'if(gt($h,$w),720,540)':flags=lanczos,fps=24,format=yuv420p"
  ffmpeg -v error -y -ss $ss -t $d -i $src -an -vf "$vf" -c:v libx264 -crf 25 -preset slow -movflags +faststart $O/hq-$id.mp4
  ffmpeg -v error -y -ss $(awk "BEGIN{print $ss+0.4}") -i $src -frames:v 1 -vf "$vf" -q:v 4 $O/hq-$id.jpg
}
mk snow $S 6.2 1.8 16:9; mk elder $S 12.2 1.7 4:5 0.3; mk heroine $S 14.2 1.7 3:4 0.45; mk hand $S 16.3 1.6 1:1
mk alley $S 18.2 3 16:9; mk ember $S 22.2 1.7 9:16 0.35; mk city $S 24.1 1.7 16:9; mk glide $S 26.1 1.7 4:5 0.4
mk blade $S 28.2 1.7 3:4 0.4; mk gaze $S 30.2 1.7 1:1 0.3; mk wings $S 32.2 1.7 9:16 0.5; mk soar $S 34.1 1.7 16:9
mk dunes $S 36.1 2.5 16:9; mk burrow $B 4.2 1.7 1:1; mk giant $B 9.2 1.7 3:4; mk trio $B 13.1 0.8 16:9
mk meadow $B 14.1 0.8 4:5; mk stare $B 16.1 0.8 1:1; mk twig $B 19.1 0.8 9:16 0.3; mk gang $B 20.1 0.8 16:9
mk grin $B 21.1 0.8 3:4 0.5; mk forest $B 22.1 0.8 16:9; mk flutter $B 25.1 0.8 4:5 0.5; mk grump $B 26.1 0.8 1:1
