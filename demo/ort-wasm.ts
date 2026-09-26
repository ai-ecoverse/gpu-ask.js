/** onnxruntime-web WASM with Vite `?url` paths (same as cua-s1.js / kev.js). */

import * as ort from "onnxruntime-web/wasm";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

ort.env.wasm.wasmPaths = { wasm, mjs };
ort.env.wasm.numThreads = 1;

export { ort };
