---
license: apache-2.0
library_name: onnx
tags:
  - onnx
  - token-classification
  - agents
  - browser
  - wasm
  - crf
pipeline_tag: token-classification
---

# gpu-ask.js (v13)

On-device agent-question tagger for the browser. Two-seed ensemble (~571k parameters × 2), distilled from an Ettin-150m teacher. Emissions are ONNX; features, linear-chain CRF, and the ask-tool compiler ship as TypeScript in [`@ai-ecoverse/gpu-ask.js`](https://www.npmjs.com/package/@ai-ecoverse/gpu-ask.js).

**[Live demo](https://ai-ecoverse.github.io/gpu-ask.js/)** · **[npm](https://www.npmjs.com/package/@ai-ecoverse/gpu-ask.js)** · **[GitHub](https://github.com/ai-ecoverse/gpu-ask.js)**

## Files (`v13/`)

| File | Role |
| --- | --- |
| `member0.onnx`, `member1.onnx` | Emission networks (ensemble average at runtime) |
| `config.json` | Feature / label / member layout |
| `crf.json` | Start and transition scores for Viterbi |
| `static_vocab.json` | Static potion-32 table |
| `manifest.json` | SHA-256 checksums |

## Usage

```ts
import * as ort from "onnxruntime-web/wasm";
import { loadAsk, parse } from "@ai-ecoverse/gpu-ask.js";

const ask = await loadAsk(
  "https://huggingface.co/ai-ecoverse/gpu-ask.js/resolve/main/v13",
  { ort },
);
const { questions } = await parse(ask, agentMessage);
```

Weights are also bundled under `models/v13/` in the npm package (`bundledModelUrl()`).

## Metrics

Pooled out-of-fold on 4,930 hand-labeled public agent turns (v13, constrained kind rerank in Python): false questions 3.7%, kind 85.4%, options_ok 67.5%. The browser path uses compiler kind (no Python-only rerank).

## Training

See [ai-ecoverse/gpu-questions](https://github.com/ai-ecoverse/gpu-questions) (`docs/training.md`, recipe v13). Architecture follows [gpu-time](https://gpu-time.arikko.dev).

## License

Apache-2.0. Part of [AI Ecoverse](https://github.com/ai-ecoverse).
