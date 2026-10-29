set -e
clip() { # name src start cropfilter fx
  ffmpeg -loglevel error -y -i /tmp/$2 -ss $3 -t $6 -filter_complex "[0:v]$4,scale=480:270:force_original_aspect_ratio=increase,crop=480:270,format=gbrp,split[a][b];[b]$5,format=gbrp[c];[a][c]blend=all_expr='if(lt(abs(X-W*(0.5+0.35*sin(T*1.8))),1.5),255,if(lt(X,W*(0.5+0.35*sin(T*1.8))),A,B))',format=yuv420p" -r 24 -c:v libx264 -crf 28 -preset veryfast -movflags +faststart -an $1.mp4
  ffmpeg -loglevel error -y -ss 0.4 -i $1.mp4 -frames:v 1 -q:v 4 -strict unofficial $1.jpg
}
SC="crop=854:356"; BB="null"
clip ex-snow     sintel.mp4 6.0  "$SC" "colorbalance=rs=.4:gm=-.1:bh=-.3,eq=saturation=1.8" 1.9
clip ex-elder    sintel.mp4 12.2 "$SC" "lutrgb=r='floor(val/48)*48':g='floor(val/48)*48':b='floor(val/48)*48',eq=saturation=1.5" 1.7
clip ex-alley    sintel.mp4 19.1 "$SC" "edgedetect=mode=colormix:high=0.15,eq=saturation=1.6" 1.8
clip ex-dragon   sintel.mp4 25.1 "$SC" "hue=h=170:s=1.3" 1.8
clip ex-portrait sintel.mp4 26.9 "$SC" "hue=h=-40:s=1.4,unsharp" 1.0
clip ex-flight   sintel.mp4 32.1 "$SC" "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.2:.3:.5:0,eq=contrast=1.2" 1.8
clip ex-desert   sintel.mp4 36.1 "$SC" "negate,hue=h=30" 2.8
clip ex-bunny    bbb.mov 9.05 "$BB" "hue=h=-90:s=1.5" 1.9
clip ex-rodents  bbb.mov 13.05 "$BB" "edgedetect=mode=wires,lutrgb=r=val:g=val*0.55:b=val*0.1" 0.9
clip ex-squirrel bbb.mov 19.1 "$BB" "lutrgb=r='floor(val/64)*64':g='floor(val/64)*64':b='floor(val/64)*64'" 0.85
