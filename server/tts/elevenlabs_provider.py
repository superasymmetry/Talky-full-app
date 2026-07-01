import os

from elevenlabs.client import ElevenLabs

from .base import TTSProvider
from .presets import DEFAULT_VOICE_KEY, get_voice_preset


# Live ElevenLabs implementation.
# This provider owns the SDK client and knows the exact voice/model used by the app.
class ElevenLabsProvider(TTSProvider):

    def __init__(self):
        # The API key stays in the environment so we do not hard-code secrets in source.
        self.client = ElevenLabs(
            api_key=os.getenv("ELEVENLABS_API_KEY")
        )

    def generate_audio(self, text: str, voice_key: str | None = None) -> bytes:

        preset = get_voice_preset(voice_key or os.getenv("ELEVENLABS_DEFAULT_VOICE", DEFAULT_VOICE_KEY))

        # Convert text into streamed audio chunks using a fixed voice and model.
        # The chosen voice ID is what gives the app a consistent sounding narrator.
        audio = self.client.text_to_speech.convert(
            voice_id=preset["voice_id"],
            text=text,
            model_id="eleven_multilingual_v2"
        )

        # The ElevenLabs SDK yields chunks; joining them produces one byte string
        # that Flask can return directly as an MP3 response.
        return b"".join(audio)