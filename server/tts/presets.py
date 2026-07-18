from elevenlabs.client import ElevenLabs


DEFAULT_VOICE_KEY = "adam"


def _preset(key: str, name: str, voice_id: str, description: str, sample: str):
    return {
        "key": key,
        "name": name,
        "voice_id": voice_id,
        "description": description,
        "sample": sample,
    }


_VOICE_PRESETS = [
    _preset(
        "adam",
        "Adam",
        "pNInz6obpgDQGcFmaJgB",
        "Firm male narration with a bright, direct delivery.",
        "Let's keep going and make the next one better.",
    ),
    _preset(
        "brian",
        "Brian",
        "nPczCjzI2devNBz1zQrb",
        "Deep, resonant narration with a calm, comforting tone.",
        "You are right on track."
    ),
    _preset(
        "charlie",
        "Charlie",
        "IKne3meq5aSn9XLyUdCD",
        "Confident male voice with a clear, energetic delivery.",
        "That sounded strong, let's do one more take.",
    ),
    _preset(
        "sarah",
        "Sarah",
        "EXAVITQu4vr4xnSDxMaL",
        "Warm female narration with a reassuring professional tone.",
        "You're doing great, keep going.",
    ),
    _preset(
        "bella",
        "Bella",
        "hpp4J3VqNfWAUOO0d1Us",
        "Bright female narration with a polished, narrative quality.",
        "Let's try that once more with feeling.",
    ),
    _preset(
        "liam",
        "Liam",
        "TX3LPaxmHKxFdv7VOQHJ",
        "Energetic male creator voice with a casual, upbeat delivery.",
        "Almost there. Let's finish strong.",
    ),
    _preset(
        "alice",
        "Alice",
        "Xb7hH8MSUJpSbSDYk0k2",
        "Clear British female educator voice with a friendly tone.",
        "Here's the next step, spoken clearly.",
    ),
    _preset(
        "will",
        "Will",
        "bIHbv24MWmeRgasZH58o",
        "Relaxed male voice with a laid-back conversational style.",
        "Take your time and keep practicing.",
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
            "description": preset["description"],
            "sample": preset["sample"],
        }
        for preset in _VOICE_PRESETS
    ]