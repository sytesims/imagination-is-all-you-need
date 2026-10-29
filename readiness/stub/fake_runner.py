#!/usr/bin/env python3
"""Stub stand-in for server/py/voice_runner.py in the stub e2e (same CLI + JSON). The real runner is CPU-smoked in readiness/smoke."""
import json, sys
cmd = sys.argv[1]
if cmd == 'transcribe': print(json.dumps({'text': 'Hello, this is the stub transcript.', 'language': 'en'}))
elif cmd == 'translate': tgt = sys.argv[sys.argv.index('--tgt') + 1]; print(json.dumps({'text': f'[{tgt}] ' + sys.stdin.read().strip()}))
else: print(json.dumps({'ok': True}))
