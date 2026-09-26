# @ai-ecoverse/gpu-ask.js

Agent questions in the browser. Prose in, structured ask-tool choices out — on-device, nothing sent anywhere.

A ~570k-parameter token tagger (gpu-time lineage) marks the question and options; a deterministic compiler builds an ask-tool payload your UI can render. Emissions run as ONNX; features, CRF, and compile stay in TypeScript. The two-member ensemble is about **10 MB** and ships inside the npm package.

**[Live demo](https://ai-ecoverse.github.io/gpu-ask.js/)** · **[Weights](https://huggingface.co/ai-ecoverse/gpu-ask.js)** · `npm install @ai-ecoverse/gpu-ask.js onnxruntime-web`

```ts
import * as ort from "onnxruntime-web/wasm";
import { bundledModelUrl, loadAsk, parse } from "@ai-ecoverse/gpu-ask.js";

// Configure ORT wasmPaths for your bundler (see demo/ort-wasm.ts).
const ask = await loadAsk(bundledModelUrl(), { ort });
// or from Hugging Face:
// const ask = await loadAsk("https://huggingface.co/ai-ecoverse/gpu-ask.js/resolve/main/v13", { ort });

const { questions } = await parse(ask, agentMessage);
// questions[0].kind      → "either_or" | "yes_no" | "multi_choice" | "open"
// questions[0].options   → ["merge it now", "wait for CI"]
// questions[0].propose   → true
```

The loader verifies each ONNX member's SHA-256 against `manifest.json`.

## Schema

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `yes_no \| either_or \| multi_choice \| open` | How the UI should ask |
| `propose` | `boolean` | Assistant offers to act |
| `prompt` | `string` | Question span text |
| `options` | `string[]` | Tagged choices |
| `default` | `number \| null` | Recommended option index |
| `multiSelect` | `boolean` | Allow several options |
| `span` | `[start, end]` | Character range in cleaned text |

## Numbers

Pooled out-of-fold on 4,930 hand-labeled public agent turns (v13 recipe, compiler kind):

| Model | Params | False q | Kind | options_ok |
| --- | ---: | ---: | ---: | ---: |
| v13 ensemble (shipped) | 571k × 2 | 3.7% | 85.4%* | 67.5%* |
| Ettin-150m teacher | 150M | 2.4% | 87.8% | 74.5% |

\*CV with constrained kind rerank. The browser path uses compiler kind (Python-only rerank is not in ONNX).

## How it works

Sparse hashed features feed a bidirectional affine-scan tagger. A linear-chain CRF picks token roles (`O`, `Q_*`, `OPT_*`, `REC`). Deterministic compile recovers missing either/or sides, splits inline lists, and decides kind. Only the emission network is ONNX (WASM via onnxruntime-web); everything else is TypeScript.

Training lives in [ai-ecoverse/gpu-questions](https://github.com/ai-ecoverse/gpu-questions). Architecture follows [gpu-time](https://gpu-time.arikko.dev).

## License

Apache-2.0. Part of [AI Ecoverse](https://github.com/ai-ecoverse).
