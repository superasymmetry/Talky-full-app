const API_BASE =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8080";

// The frontend keeps track of the current audio element and blob URL so that new speech can interrupt old speech cleanly
let activeAudio = null;
let activeObjectUrl = null;

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
  cleanupActiveAudio();
}

export async function speakText(text, options = {}) {
  const { interrupt = true, onEnd, voiceKey } = options;

  // Nothing to speak means nothing to request from the backend
  if (!text) return null;

  // If requested, stop any clip that is already playing before starting a new one.
  if (interrupt) {
    cleanupActiveAudio();
  }

  // Send the text to the backend TTS endpoint. The backend decides which provider
  // to use and returns the synthesized audio bytes.
  const response = await fetch(
    `${API_BASE}/api/tts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        voiceKey: voiceKey || localStorage.getItem('ttsVoiceKey') || undefined
      })
    }
  );

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

  // Convert the returned bytes into a browser Blob so Audio() can play it.
  const blob = await response.blob();

  // Blob URLs let the browser play the downloaded audio without saving a file.
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);

  // Track the active clip so it can be interrupted by later speech.
  activeAudio = audio;
  activeObjectUrl = url;

  audio.onended = () => {
    // Once playback finishes, clean up the blob URL and reset the active clip.
    if (activeAudio === audio) {
      cleanupActiveAudio();
    }

    // Optional callback used by some UI flows to reset selection state.
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

  try {
    // The browser actually performs playback here; the backend only provides bytes.
    await audio.play();
  } catch (error) {
    cleanupActiveAudio();
    throw error;
  }

  return audio;
}