const API_BASE =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8080";

const MAX_AUDIO_CACHE_ENTRIES = 24;
const audioBlobCache = new Map();

// The frontend keeps track of the current audio element and blob URL so that new speech can interrupt old speech cleanly
let activeAudio = null;
let activeObjectUrl = null;
let activeRequestController = null;

function getAudioCacheKey(text, voiceKey) {
  return `${voiceKey || "default"}::${text}`;
}

function rememberAudioBlob(cacheKey, blob) {
  if (audioBlobCache.has(cacheKey)) {
    audioBlobCache.delete(cacheKey);
  }

  audioBlobCache.set(cacheKey, blob);

  while (audioBlobCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    const oldestKey = audioBlobCache.keys().next().value;
    audioBlobCache.delete(oldestKey);
  }
}

// The backend always synthesizes speech at normal speed - "speak slowly"
// is applied client-side via HTMLMediaElement.playbackRate instead, since
// audio elements support this natively. preservesPitch keeps the voice
// sounding natural instead of dropping in pitch as it slows down (the
// "chipmunk effect" in reverse). Vendor-prefixed variants cover older
// Firefox/Safari that haven't adopted the unprefixed property yet.
function applyPlaybackRate(audio, rate) {
  const effectiveRate = typeof rate === "number" && rate > 0 ? rate : 1;
  audio.playbackRate = effectiveRate;
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
}

function createAudioHandlers(audio, objectUrl, onEnd, rate) {
  activeAudio = audio;
  activeObjectUrl = objectUrl;
  applyPlaybackRate(audio, rate);

  audio.onended = () => {
    // Once playback finishes, clean up the object URL and reset the active clip.
    if (activeAudio === audio) {
      cleanupActiveAudio();
    }

    if (typeof onEnd === "function") {
      onEnd();
    }
  };

  audio.onerror = () => {
    // If playback fails, still clean up so future audio can start normally.
    if (activeAudio === audio) {
      cleanupActiveAudio();
    }
  };

  return audio;
}

async function playBlobAudio(blob, onEnd, rate) {
  const url = URL.createObjectURL(blob);
  const audio = createAudioHandlers(new Audio(url), url, onEnd, rate);

  try {
    await audio.play();
  } catch (error) {
    cleanupActiveAudio();
    throw error;
  }

  return audio;
}

async function waitForEvent(target, eventName, errorEventName = "error") {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onResolve);
      target.removeEventListener(errorEventName, onReject);
    };

    const onResolve = () => {
      cleanup();
      resolve();
    };

    const onReject = (event) => {
      cleanup();
      reject(event?.error || new Error(`Failed while waiting for ${eventName}`));
    };

    target.addEventListener(eventName, onResolve, { once: true });
    target.addEventListener(errorEventName, onReject, { once: true });
  });
}

async function playStreamedAudio(response, onEnd, abortSignal, rate) {
  const mimeType = 'audio/mpeg';

  if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(mimeType)) {
    return playBlobAudio(await response.blob(), onEnd, rate);
  }

  if (!response.body) {
    return playBlobAudio(await response.blob(), onEnd, rate);
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = createAudioHandlers(new Audio(objectUrl), objectUrl, onEnd, rate);

  const appendQueue = [];
  const collectedChunks = [];
  let sourceBuffer = null;
  let streamFinished = false;
  let streamError = null;

  // Single source of truth for draining the queue. Nothing else triggers
  // appends - the old code also called this from a sourceBuffer "updateend"
  // listener, which meant two code paths could race to append at once.
  // The `updating` guard stopped that from causing a real double-append,
  // but it was fragile and unnecessary - this recursive await already
  // chains correctly on its own.
  const appendNextChunk = async () => {
    if (!sourceBuffer || sourceBuffer.updating || appendQueue.length === 0) {
      if (
        sourceBuffer &&
        !sourceBuffer.updating &&
        streamFinished &&
        appendQueue.length === 0 &&
        mediaSource.readyState === "open"
      ) {
        try {
          mediaSource.endOfStream();
        } catch {
          // Ignore endOfStream errors during teardown.
        }
      }
      return;
    }

    const chunk = appendQueue.shift();
    sourceBuffer.appendBuffer(chunk);
    await waitForEvent(sourceBuffer, "updateend");
    return appendNextChunk();
  };

  const streamReader = response.body.getReader();

  const readerTask = (async () => {
    try {
      while (true) {
        if (abortSignal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        const { done, value } = await streamReader.read();

        if (done) {
          break;
        }

        if (value?.byteLength) {
          collectedChunks.push(value);
          appendQueue.push(value);
          await appendNextChunk();
        }
      }

      streamFinished = true;
      await appendNextChunk();
    } catch (error) {
      streamError = error;

      try {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream("network");
        }
      } catch {
        // Ignore endOfStream errors during abort/failure cleanup.
      }

      throw error;
    }
  })();

  mediaSource.addEventListener("sourceopen", async () => {
    try {
      sourceBuffer = mediaSource.addSourceBuffer(mimeType);
      await appendNextChunk();
      await audio.play();
    } catch (error) {
      streamError = error;
      cleanupActiveAudio();
    }
  }, { once: true });

  abortSignal.addEventListener("abort", () => {
    try {
      streamReader.cancel();
    } catch {
      // Best-effort cancel.
    }
  }, { once: true });

  await readerTask;

  if (streamError) {
    throw streamError;
  }

  return {
    audio,
    blob: new Blob(collectedChunks, { type: mimeType })
  };
}

function cleanupActiveAudio() {
  // pause the current clip + clear its source + release the browser resources
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio.load();
    activeAudio = null;
  }

  // Blob URLs should always be revoked once we are done with them
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export function stopSpeech() {
  // Shared stop function used by multiple UI screens
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = null;
  }

  cleanupActiveAudio();
}

export async function speakText(text, options = {}) {
  const { interrupt = true, onEnd, voiceKey, rate = 1 } = options;

  // Nothing to speak means nothing to request from the backend
  if (!text) return null;

  // If requested, stop any clip that is already playing before starting a new one.
  if (interrupt) {
    if (activeRequestController) {
      activeRequestController.abort();
      activeRequestController = null;
    }

    cleanupActiveAudio();
  }

  const resolvedVoiceKey = voiceKey || localStorage.getItem('ttsVoiceKey') || undefined;
  const cacheKey = getAudioCacheKey(text, resolvedVoiceKey);

  const cachedBlob = audioBlobCache.get(cacheKey);

  if (cachedBlob) {
    // Reuse previously generated audio when the same text and voice are requested again.
    return playBlobAudio(cachedBlob, onEnd, rate);
  }

  const requestController = new AbortController();
  activeRequestController = requestController;

  // Send the text to the backend TTS endpoint. The backend decides which provider
  // to use and returns the synthesized audio bytes.
  let response;

  try {
    response = await fetch(
      `${API_BASE}/api/tts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: requestController.signal,
        body: JSON.stringify({
          text,
          voiceKey: resolvedVoiceKey
        })
      }
    );
  } finally {
    if (activeRequestController === requestController) {
      activeRequestController = null;
    }
  }

  if (!response.ok) {
    // The server returns JSON errors, but we defensively handle plain-text too.
    const bodyText = await response.text();
    let message = "TTS request failed";

    try {
      const parsed = JSON.parse(bodyText);
      message = parsed.error || parsed.message || message;
    } catch {
      if (bodyText) {
        message = bodyText;
      }
    }

    throw new Error(message);
  }
  try {
    const playbackResult = await playStreamedAudio(response, onEnd, requestController.signal, rate);

    // Cache a blob copy for repeated local playback when the same sentence is requested again.
    // This keeps later requests fast even if the browser cannot stream a second time.
    rememberAudioBlob(cacheKey, playbackResult.blob);

    return playbackResult.audio;
  } catch (error) {
    cleanupActiveAudio();
    throw error;
  }
}