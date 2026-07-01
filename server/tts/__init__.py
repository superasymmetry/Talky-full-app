import os
from functools import lru_cache

from .elevenlabs_provider import (
    ElevenLabsProvider
)

from .openai_provider import (
    OpenAIProvider
)
from .presets import public_voice_presets

# This module is the small factory layer for the TTS system.
# The rest of the server asks for "a provider" instead of hard-coding
# ElevenLabs or OpenAI everywhere, which keeps the app easy to swap later.
@lru_cache(maxsize=1)
def get_tts_provider():

    # TTS_PROVIDER controls which backend should generate audio.
    # We default to ElevenLabs because that is the live provider currently wired up.
    provider = os.getenv(
        "TTS_PROVIDER",
        "elevenlabs"
    )

    # When the env var says "openai", return the OpenAI placeholder provider.
    # Otherwise we fall back to ElevenLabs so the app keeps working by default.
    if provider == "openai":
        return OpenAIProvider()

    return ElevenLabsProvider()


def get_tts_voice_options():
    return public_voice_presets()