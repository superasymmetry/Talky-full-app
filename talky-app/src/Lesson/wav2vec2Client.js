// Process-wide handle to the single wav2vec2 web worker.
//
// The worker starts downloading and compiling the model the moment it is
// constructed (see wav2vec2Worker.js), which takes long enough that doing it
// on Lesson mount left the first sentences of a lesson streaming raw audio to
// the server instead of on-device logits. Owning the worker here instead of
// inside Lesson lets the app kick that load off at startup (preloadWav2Vec2)
// and keeps it warm across lesson navigation — the worker is deliberately
// never terminated, since re-creating it would redo the whole load.
//
// Because the worker posts 'ready'/'error' exactly once, subscribers that
// attach after init finished would otherwise miss it, so the last status is
// cached and replayed to each new subscriber.

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
  // Registered before any subscriber's listener, so `status` is up to date by
  // the time their handler runs for the same message.
  worker.addEventListener('message', (e) => {
    if (e.data?.type === 'ready' || e.data?.type === 'error') status = e.data;
  });
  return worker;
}

/** Start loading the model now. Safe to call repeatedly; only the first call
 *  creates the worker. */
export function preloadWav2Vec2() {
  ensureWorker();
}

/** The shared worker, or null if module workers aren't supported here. */
export function getWav2Vec2Worker() {
  return ensureWorker();
}

/**
 * Attach `handler` to the shared worker's messages, replaying the cached
 * 'ready'/'error' status if init already finished. Returns an unsubscribe fn.
 */
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
