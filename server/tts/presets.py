from elevenlabs.client import ElevenLabs


DEFAULT_VOICE_KEY = "adam"


def _preset(key: str, name: str, voice_id: str):
    return {
        "key": key,
        "name": name,
        "voice_id": voice_id,
    }


_VOICE_PRESETS = [
    _preset(
        "adam",
        "Adam",
        "pNInz6obpgDQGcFmaJgB",
    ),
    _preset(
        "brian",
        "Brian",
        "nPczCjzI2devNBz1zQrb",
    ),
    _preset(
        "charlie",
        "Charlie",
        "IKne3meq5aSn9XLyUdCD",
    ),
    _preset(
        "sarah",
        "Sarah",
        "EXAVITQu4vr4xnSDxMaL",
    ),
    _preset(
        "bella",
        "Bella",
        "hpp4J3VqNfWAUOO0d1Us",
    ),
    _preset(
        "liam",
        "Liam",
        "TX3LPaxmHKxFdv7VOQHJ",
    ),
    _preset(
        "alice",
        "Alice",
        "Xb7hH8MSUJpSbSDYk0k2",
    ),
    _preset(
        "will",
        "Will",
        "bIHbv24MWmeRgasZH58o",
    ),
]


def get_voice_preset(key: str | None):
    selected_key = (key or DEFAULT_VOICE_KEY).strip().lower()

    for preset in _VOICE_PRESETS:
        if preset["key"] == selected_key:
            return preset

    return next((preset for preset in _VOICE_PRESETS if preset["key"] == DEFAULT_VOICE_KEY), _VOICE_PRESETS[0])


def public_voice_presets():
    return [
        {
            "key": preset["key"],
            "name": preset["name"],
        }
        for preset in _VOICE_PRESETS
    ]