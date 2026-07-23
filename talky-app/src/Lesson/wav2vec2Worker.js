// Web worker that runs wav2vec2 CTC inference in the browser via
// transformers.js (onnxruntime-web). Tries WebGPU/fp16, then WebGPU/fp32,
// then falls back to WASM/int8. Receives 16 kHz float32 audio chunks and
// posts back per-chunk logits (frames x vocab), which the backend aligns
// with stream_decode_logits.
//
// The model must be the SAME checkpoint the backend tokenizer uses
// (vitouphy/wav2vec2-xls-r-300m-timit-phoneme), converted to ONNX — see
// server/scripts/export_wav2vec2_onnx.py, which produces model_fp16.onnx,
// model.onnx, and model_quantized.onnx for the three tiers above. By
// default it is loaded from /models/<id>/ (served out of talky-app/public/).
// Set VITE_W2V2_MODEL to a Hugging Face repo id instead to load a hosted
// ONNX conversion, or VITE_W2V2_DTYPE to pin a single device/dtype and skip
// the fallback chain (e.g. for testing).
//
// Uses AutoFeatureExtractor, not AutoProcessor: a Wav2Vec2 "processor" is a
// feature extractor + tokenizer pair, and AutoProcessor.from_pretrained loads
// both unconditionally even though this worker never decodes text — only the
// backend does, from raw logits. This checkpoint's tokenizer has no fast
// (tokenizer.json) form to give transformers.js, only the slow Python one,
// so AutoProcessor.from_pretrained always throws here and init() never
// completes. AutoFeatureExtractor loads just the audio-preprocessing half,
// which is all `handleChunk` actually calls.
import { AutoModelForCTC, AutoFeatureExtractor, env } from '@huggingface/transformers';

const HUB_MODEL = import.meta.env.VITE_W2V2_MODEL;
const MODEL_ID = HUB_MODEL || 'wav2vec2-xls-r-300m-timit-phoneme';

if (!HUB_MODEL) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
}

let featureExtractor = null;
let model = null;
let activeDevice = null;
let activeDtype = null;

// Tried in order. fp16 halves the ~1.2 GB WebGPU download and runs faster on
// GPU with negligible accuracy loss (the export keeps I/O tensors float32 —
// see server/scripts/export_wav2vec2_onnx.py — so this branch always yields
// a plain Float32Array from `logits.data`, same as fp32). If the adapter
// lacks the shader-f16 feature, transformers.js throws during load/shader
// compilation and we retry with fp32 on WebGPU before giving up on GPU
// entirely and dropping to the WASM/int8 fallback.
const LOAD_ATTEMPTS = import.meta.env.VITE_W2V2_DTYPE
  ? [{ device: 'webgpu', dtype: import.meta.env.VITE_W2V2_DTYPE }]
  : [
      { device: 'webgpu', dtype: 'fp16' },
      { device: 'webgpu', dtype: 'fp32' },
    ];

async function init() {
  featureExtractor = await AutoFeatureExtractor.from_pretrained(MODEL_ID);
  for (const attempt of LOAD_ATTEMPTS) {
    try {
      model = await AutoModelForCTC.from_pretrained(MODEL_ID, attempt);
      activeDevice = attempt.device;
      activeDtype = attempt.dtype;
      break;
    } catch (err) {
      console.warn(`[wav2vec2Worker] ${attempt.device}/${attempt.dtype} unavailable:`, err);
    }
  }
  if (!model) {
    console.warn('[wav2vec2Worker] WebGPU unavailable, falling back to WASM/int8');
    model = await AutoModelForCTC.from_pretrained(MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
    });
    activeDevice = 'wasm';
    activeDtype = 'q8';
  }
  // Warm up so the first real chunk isn't hit by shader compilation.
  const warmup = await featureExtractor(new Float32Array(8000));
  await model(warmup);
}

const initPromise = init()
  .then(() => self.postMessage({ type: 'ready', device: activeDevice, dtype: activeDtype }))
  .catch((err) => {
    console.error('[wav2vec2Worker] init failed:', err);
    model = null;
    self.postMessage({ type: 'error', error: String(err?.message || err) });
  });

async function handleChunk(msg) {
  await initPromise;
  if (!model) {
    self.postMessage({ type: 'chunk_error', error: 'model not loaded' });
    return;
  }
  try {
    const inputs = await featureExtractor(msg.audio);
    const { logits } = await model(inputs);
    const [, frames, vocab] = logits.dims; // [1, frames, vocab]
    const data = logits.data instanceof Float32Array
      ? logits.data
      : Float32Array.from(logits.data);
    self.postMessage({ type: 'logits', frames, vocab, data }, [data.buffer]);
  } catch (err) {
    console.error('[wav2vec2Worker] inference failed:', err);
    self.postMessage({ type: 'chunk_error', error: String(err?.message || err) });
  }
}

// Chain chunk handling so logits are posted in the order chunks arrive,
// even though inference is async.
let chain = Promise.resolve();
self.onmessage = (e) => {
  if (e.data?.type === 'chunk') {
    chain = chain.then(() => handleChunk(e.data));
  }
};