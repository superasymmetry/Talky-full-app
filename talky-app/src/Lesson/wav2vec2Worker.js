// Web worker that runs wav2vec2 CTC inference in the browser via transformers.js (onnxruntime-web).

import { AutoFeatureExtractor, AutoModelForCTC, env } from '@huggingface/transformers';

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