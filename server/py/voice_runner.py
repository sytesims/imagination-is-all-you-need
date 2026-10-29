#!/usr/bin/env python3
"""Local voice runner for Imagination Is All You Need (CPU, no external server).
  transcribe AUDIO [--model base] [--language es] [--segments]
                                            faster-whisper (MIT) → JSON {"text", "language"}; --segments adds
                                            "segments": [{"start", "end", "text"}] (seconds) for captions
  translate --tgt es [--src en] < text      NLLB-200 distilled 600M (CC BY-NC 4.0) via CTranslate2 int8 → JSON {"text"}
  setup                                     download + convert NLLB to CTranslate2 (needs torch; one-off)
Models live in $OPENHIGGSFIELD_PY_MODELS (default: server/py/models)."""
import json, os, sys, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get('OPENHIGGSFIELD_PY_MODELS') or os.path.join(HERE, 'models')
NLLB_HF = 'facebook/nllb-200-distilled-600M'
NLLB_REV = os.environ.get('OPENHIGGSFIELD_NLLB_REVISION', 'f8d333a098d19b4fd9a8b18f94170487ad3f821d')
NLLB_CT2 = os.path.join(MODELS, 'nllb-200-distilled-600M-ct2-int8')
# int8 *compute* gave garbage output on this box's CPU (int8 storage + float32 compute is correct), so float32 is the default.
COMPUTE = os.environ.get('OPENHIGGSFIELD_CT2_COMPUTE', 'float32')
FLORES = {'en': 'eng_Latn', 'es': 'spa_Latn', 'fr': 'fra_Latn', 'de': 'deu_Latn', 'it': 'ita_Latn', 'pt': 'por_Latn', 'ar': 'arb_Arab', 'hi': 'hin_Deva',
          'zh': 'zho_Hans', 'ja': 'jpn_Jpan', 'ko': 'kor_Hang', 'ru': 'rus_Cyrl', 'tr': 'tur_Latn', 'nl': 'nld_Latn', 'pl': 'pol_Latn', 'id': 'ind_Latn'}
def out(o): sys.stdout.write(json.dumps(o, ensure_ascii=False)); sys.stdout.flush()

def setup():
    if os.path.exists(os.path.join(NLLB_CT2, 'model.bin')): return out({'ok': True, 'nllb': NLLB_CT2, 'cached': True})
    from ctranslate2.converters import TransformersConverter
    os.makedirs(MODELS, exist_ok=True)
    TransformersConverter(NLLB_HF, revision=NLLB_REV, copy_files=['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'sentencepiece.bpe.model']).convert(NLLB_CT2, quantization='int8', force=True)
    out({'ok': True, 'nllb': NLLB_CT2})

def transcribe(audio, model, language=None, segments=False):
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device='cpu', compute_type=COMPUTE, download_root=os.path.join(MODELS, 'whisper'))
    segs, info = m.transcribe(audio, beam_size=5, vad_filter=True, language=language or None)
    segs = [s for s in segs if s.text.strip()]
    o = {'text': ' '.join(s.text.strip() for s in segs).strip(), 'language': info.language}
    if segments: o['segments'] = [{'start': round(s.start, 3), 'end': round(s.end, 3), 'text': s.text.strip()} for s in segs]
    out(o)

def translate(text, src, tgt):
    import ctranslate2
    from transformers import AutoTokenizer
    if tgt not in FLORES: raise SystemExit(f'NLLB: unsupported target language {tgt}')
    if not os.path.exists(os.path.join(NLLB_CT2, 'model.bin')): setup_quiet()
    tok = AutoTokenizer.from_pretrained(NLLB_CT2, src_lang=FLORES.get(src, 'eng_Latn'))
    tr = ctranslate2.Translator(NLLB_CT2, device='cpu', compute_type=COMPUTE)
    lines = [l for l in text.replace('\r', '').split('\n') if l.strip()] or ['']
    toks = [tok.convert_ids_to_tokens(tok.encode(l)) for l in lines]
    res = tr.translate_batch(toks, target_prefix=[[FLORES[tgt]]] * len(toks), beam_size=4, max_decoding_length=512)
    outl = [tok.decode(tok.convert_tokens_to_ids(r.hypotheses[0][1:]), skip_special_tokens=True) for r in res]
    out({'text': '\n'.join(outl)})

def setup_quiet():
    so = sys.stdout; sys.stdout = open(os.devnull, 'w')
    try: setup()
    finally: sys.stdout = so

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('transcribe'); a.add_argument('audio'); a.add_argument('--model', default=os.environ.get('OPENHIGGSFIELD_WHISPER_MODEL', 'base'))
    a.add_argument('--language', default=None); a.add_argument('--segments', action='store_true')
    b = sp.add_parser('translate'); b.add_argument('--src', default='en'); b.add_argument('--tgt', required=True)
    sp.add_parser('setup')
    x = ap.parse_args()
    if x.cmd == 'setup': setup()
    elif x.cmd == 'transcribe': transcribe(x.audio, x.model, x.language, x.segments)
    else: translate(sys.stdin.read(), x.src, x.tgt)
