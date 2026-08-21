let worker = null;
let status = null;        // last 'ready' | 'error' message from the worker
let unavailable = false;  // Worker constructor itself threw (no module workers)

function ensureWorker() {
  if (worker || unavailable) return worker;
  try {
    worker = new Worker(new URL('./wav2vec2Worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    unavailable = true;
    status = { type: 'error', error: String(err?.message || err) };
    console.warn('On-device wav2vec2 worker unavailable, streaming raw audio instead:', err);
    return null;
  }

  worker.addEventListener('message', (e) => {
    if (e.data?.type === 'ready' || e.data?.type === 'error') status = e.data;
  });
  return worker;
}

// start loading the model
export function preloadWav2Vec2() {
  ensureWorker();
}

export function getWav2Vec2Worker() {
  return ensureWorker();
}

export function subscribeWav2Vec2(handler) {
  const w = ensureWorker();
  if (!w) {
    if (status) handler(status);
    return () => {};
  }
  const listener = (e) => handler(e.data);
  w.addEventListener('message', listener);
  if (status) handler(status);
  return () => w.removeEventListener('message', listener);
}
