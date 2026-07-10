import os

from .base import TTSProvider

# Placeholder provider for future OpenAI TTS support.
# Keeping this class in place means the app can switch providers later without
# changing the rest of the codebase; only this file needs a real implementation.
class OpenAIProvider(TTSProvider):

    def __init__(self):
        # These settings are read now so the eventual OpenAI implementation can
        # reuse the same environment-based configuration pattern as ElevenLabs.
        self.model = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
        self.voice = os.getenv("OPENAI_TTS_VOICE", "alloy")

    def generate_audio(self, text: str, voice_key: str | None = None) -> bytes:
        raise RuntimeError(
            "OpenAIProvider is a placeholder right now. "
            "Set TTS_PROVIDER=elevenlabs to use the live voice, or implement OpenAI audio generation here later."
        )