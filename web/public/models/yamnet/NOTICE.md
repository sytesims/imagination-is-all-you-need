# YAMNet (TF.js) — third-party model

Used by the audio player to hear a track's style (web/src/shared/listenStyle.ts). Runs only in your browser; nothing is sent anywhere.

- **Model:** YAMNet, by Google. TF.js graph model `google/yamnet/tfJs/tfjs/1`.
  Source: https://www.kaggle.com/models/google/yamnet/tfJs/tfjs/1 (formerly https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1).
  Original archive `yamnet-tfjs-tfjs-v1.tar.gz`, SHA-256 `604467f7ce0900a27a05f274c7e7a46effbb936788a7cee84648238de5c97c82`.
- **Licence:** Apache License 2.0 (full text: `LICENSE` in this folder).
- **Modified:** yes. The float32 weights were quantized to uint8 (per-tensor affine, the TF.js `quantization` field in `model.json`),
  15.4 MB → 3.9 MB, and repacked into one shard. The graph is unchanged. Checked against the original on test clips: same chosen style.
- **Class names:** `classes.json` is the `display_name` column of `yamnet_class_map.csv` from
  https://github.com/tensorflow/models/tree/master/research/audioset/yamnet (Apache-2.0). The labels are the AudioSet ontology
  (https://research.google.com/audioset/ontology/, CC BY-SA 4.0).
- **Runtime:** TensorFlow.js 4.22.0 (@tensorflow/tfjs-core, -converter, -backend-webgl, -backend-cpu), Apache-2.0.
