from abc import ABC, abstractmethod

# Base interface for every TTS provider.
# Each provider only needs to know how to turn text into raw audio bytes.
class TTSProvider(ABC):

    @abstractmethod
    def generate_audio(self, text: str, voice_key: str | None = None) -> bytes:
        # Concrete providers must implement this method.
        # The return value is raw MP3-like bytes that Flask can send back.
        pass

    def stream_audio(self, text: str, voice_key: str | None = None):
        # Default streaming behavior falls back to a single in-memory chunk.
        # Providers with real chunked output can override this for lower latency.
        yield self.generate_audio(text, voice_key=voice_key)