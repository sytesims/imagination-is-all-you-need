#!/usr/bin/env bash
# Regenerates Imagination Is All You Need's own demo media in server/samples (procedural ffmpeg sources only; no third-party footage).
set -euo pipefail
cd "$(dirname "$0")/../samples"
V="-c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -movflags +faststart"
A="-f lavfi -i sine=f=220:d=6 -c:a aac -shortest"
ff() { ffmpeg -loglevel error -y "$@"; }
# inputs
ff -f lavfi -i "testsrc2=s=1280x720:d=6:r=24" $A $V sample-take.mp4
ff -f lavfi -i "cellauto=s=1280x720:rule=110:rate=24,format=yuv420p" -t 6 $V sample-pattern.mp4
ff -f lavfi -i "gradients=s=1024x1024:c0=orange:c1=purple:seed=7" -frames:v 1 sample-character.png
ff -f lavfi -i "gradients=s=1280x720:c0=teal:c1=navy:seed=3" -frames:v 1 sample-keyframe.png
ff -f lavfi -i "gradients=s=1024x1024:c0=crimson:c1=gold:seed=11" -vf "drawbox=x=362:y=262:w=300:h=500:color=white@0.85:t=fill" -frames:v 1 sample-product.png
# mock results (one look per tool)
ff -f lavfi -i "gradients=s=1280x720:speed=0.03:c0=darkorange:c1=teal:rate=24" -vf "drawbox=x='mod(t*220\,1280)':y=260:w=200:h=200:color=white@0.8:t=fill" -t 6 $V result-swap.mp4
ff -f lavfi -i "life=s=640x360:mold=10:rate=24:ratio=0.1:death_color=#1b1b3a:life_color=#ff7ac8" -vf "scale=1280:720:flags=neighbor,format=yuv420p" -t 6 $V result-motion.mp4
ff -f lavfi -i "testsrc2=s=1280x720:r=24" -vf "edgedetect=mode=colormix:high=0.2,hue=h=200:s=2,format=yuv420p" -t 6 $V result-restyle.mp4
ff -f lavfi -i "testsrc2=s=1280x720:r=24" -vf "rotate=0.12*sin(2*PI*t/6):fillcolor=black,scale=1600:900,crop=1280:720:160+80*sin(t):90,format=yuv420p" -t 6 $V result-angle-a.mp4
ff -f lavfi -i "testsrc2=s=1280x720:r=24" -vf "hflip,scale=1920:1080,crop=1280:720:320:180+100*sin(t),format=yuv420p" -t 6 $V result-angle-b.mp4
ff -f lavfi -i "gradients=s=1280x720:speed=0.05:c0=navy:c1=skyblue:rate=24" -vf "zoompan=z='1+0.05*on/24':d=1:s=1280x720:fps=24,format=yuv420p" -t 6 $V result-camera.mp4
ff -f lavfi -i "gradients=s=1280x720:speed=0.08:c0=purple:c1=orange:rate=24" -vf "hue=H=2*PI*t/6:s=1.5,format=yuv420p" -t 6 $V result-fx.mp4
ff -f lavfi -i "cellauto=s=1280x720:rule=30:rate=24" -vf "unsharp=7:7:2,format=yuv420p" -t 6 $V result-detail.mp4
rm -f sample-fractal.mp4
ls -la
