from flask import (
    Blueprint,
    request,
    Response,
    jsonify,
    stream_with_context
)

from . import (
    get_tts_provider,
    get_tts_voice_options
)


# Blueprint for the backend TTS route.
# Flask registers this blueprint in main.py so the frontend can POST text here.
tts_bp = Blueprint("tts", __name__)


@tts_bp.route("/api/tts/voices", methods=["GET"])
def tts_voices():
    return jsonify({
        "voices": get_tts_voice_options()
    })


@tts_bp.route("/api/tts", methods=["POST"])
def tts():

    # Parse the incoming JSON body from the frontend.
    data = request.get_json()

    # Text is required because the provider can only synthesize spoken audio
    # when there is actual text to read.
    if not data or "text" not in data or not isinstance(data["text"], str) or not data["text"].strip():
        return jsonify({
            "error": "Missing text field"
        }), 400

    text = data["text"]
    voice_key = data.get("voiceKey") if isinstance(data, dict) else None

    try:
        # Select the active provider using the environment variable.
        # This keeps the route independent from the actual TTS vendor.
        provider = get_tts_provider()
        audio_stream = provider.stream_audio(text, voice_key=voice_key if isinstance(voice_key, str) else None)
    except Exception as error:
        # Convert provider failures into JSON so the frontend can show a useful
        # message instead of receiving a generic server crash.
        return jsonify({
            "error": str(error)
        }), 500

    # Stream the audio as it is produced so the server does not buffer the full file first.
    return Response(
        stream_with_context(audio_stream),
        mimetype="audio/mpeg"
    )