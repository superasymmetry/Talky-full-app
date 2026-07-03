import hashlib
import os
from collections import OrderedDict
from pathlib import Path
from threading import Lock

from elevenlabs.client import ElevenLabs

from .base import TTSProvider
from .presets import DEFAULT_VOICE_KEY, get_voice_preset


# --- Cache configuration ---------------------------------------------------
# Two tiers: a small in-memory LRU for hot repeats within this process, and a
# disk-backed cache underneath it that survives restarts/deploys and can be
# pointed at a shared volume so multiple server instances share hits instead
# of each having its own cold cache.

_MEMORY_CACHE_LIMIT = 32
_memory_cache: OrderedDict[str, bytes] = OrderedDict()
_cache_lock = Lock()

_DISK_CACHE_DIR = Path(
    os.getenv("TTS_CACHE_DIR", "/var/lib/yourapp/tts_cache")
)
_DISK_CACHE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(_DISK_CACHE_DIR, 0o700)

def _cache_key(text: str, voice_id: str) -> str:
    # Hash so keys are fixed-length and filesystem-safe no matter how long
    # the input text is, and so we never leak raw user text into filenames.
    raw = f"{voice_id}::{text}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _disk_path(key: str) -> Path:
    return _DISK_CACHE_DIR / f"{key}.mp3"


def _remember_in_memory(key: str, audio_bytes: bytes) -> None:
    with _cache_lock:
        _memory_cache[key] = audio_bytes
        _memory_cache.move_to_end(key)

        while len(_memory_cache) > _MEMORY_CACHE_LIMIT:
            _memory_cache.popitem(last=False)


def _get_cached_audio(text: str, voice_id: str) -> bytes | None:
    key = _cache_key(text, voice_id)

    with _cache_lock:
        cached = _memory_cache.get(key)
        if cached is not None:
            _memory_cache.move_to_end(key)
            return cached

    disk_path = _disk_path(key)
    if disk_path.exists():
        try:
            audio_bytes = disk_path.read_bytes()
        except OSError:
            return None

        _remember_in_memory(key, audio_bytes)
        return audio_bytes

    return None


def _set_cached_audio(text: str, voice_id: str, audio_bytes: bytes) -> None:
    key = _cache_key(text, voice_id)
    _remember_in_memory(key, audio_bytes)

    disk_path = _disk_path(key)

    try:
        # Write to a temp file then rename, so a concurrent reader (another
        # worker process) never sees a partially-written mp3.
        tmp_path = disk_path.with_suffix(".tmp")
        tmp_path.write_bytes(audio_bytes)
        tmp_path.replace(disk_path)
    except OSError:
        # Disk cache is best-effort - the in-memory cache still works even
        # if the filesystem is read-only or the write fails for some reason.
        pass


class ElevenLabsProvider(TTSProvider):

    def __init__(self):
        api_key = os.getenv("ELEVENLABS_API_KEY")

        if not api_key:
            raise RuntimeError("ELEVENLABS_API_KEY is not set")

        # The API key stays in the environment so we do not hard-code secrets
        # in source, and it never leaves the server.
        self.client = ElevenLabs(api_key=api_key)

    def _resolve_voice_id(self, voice_key: str | None = None) -> str:
        preset = get_voice_preset(voice_key or os.getenv("ELEVENLABS_DEFAULT_VOICE", DEFAULT_VOICE_KEY))
        return preset["voice_id"]

    def generate_audio(self, text: str, voice_key: str | None = None) -> bytes:
        return b"".join(self.stream_audio(text, voice_key=voice_key))

    def stream_audio(self, text: str, voice_key: str | None = None):
        voice_id = self._resolve_voice_id(voice_key)
        cached_audio = _get_cached_audio(text, voice_id)

        if cached_audio is not None:
            yield cached_audio
            return

        # Convert text into streamed audio chunks using the resolved voice/model.
        # Yielding chunks early lets Flask start sending data before synthesis
        # fully finishes.
        audio = self.client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2"
        )

        collected_chunks = []

        for chunk in audio:
            if not chunk:
                continue

            collected_chunks.append(chunk)
            yield chunk

        if collected_chunks:
            _set_cached_audio(text, voice_id, b"".join(collected_chunks))