// Web worker that runs wav2vec2 CTC inference in the browser via
// transformers.js (onnxruntime-web). Prefers WebGPU, falls back to WASM.
// Receives 16 kHz float32 audio chunks and posts back per-chunk logits
// (frames x vocab), which the backend aligns with stream_decode_logits.
//
// The model must be the SAME checkpoint the backend tokenizer uses
// (vitouphy/wav2vec2-xls-r-300m-timit-phoneme), converted to ONNX — see
// server/scripts/export_wav2vec2_onnx.py. By default it is loaded from
// /models/<id>/ (served out of talky-app/public/). Set VITE_W2V2_MODEL to a
// Hugging Face repo id instead to load a hosted ONNX conversion.

import { AutoModelForCTC, AutoProcessor, env } from '@huggingface/transformers';

const HUB_MODEL = import.meta.env.VITE_W2V2_MODEL;
const MODEL_ID = HUB_MODEL || 'wav2vec2-xls-r-300m-timit-phoneme';

if (!HUB_MODEL) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
}

let processor = null;
let model = null;

async function init() {
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  try {
    model = await AutoModelForCTC.from_pretrained(MODEL_ID, {
      device: 'webgpu',
      dtype: import.meta.env.VITE_W2V2_DTYPE || 'fp32',
    });
  } catch (err) {
    console.warn('[wav2vec2Worker] WebGPU unavailable, falling back to WASM:', err);
    model = await AutoModelForCTC.from_pretrained(MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
    });
  }
  // Warm up so the first real chunk isn't hit by shader compilation.
  const warmup = await processor(new Float32Array(8000));
  await model(warmup);
}

const initPromise = init()
  .then(() => self.postMessage({ type: 'ready' }))
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
    const inputs = await processor(msg.audio);
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