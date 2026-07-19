import json
import unittest
from playwright.sync_api import sync_playwright
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))

# Pre-defined mock phoneme results (12 phonemes across 3 words — enough to pass the >10 assertion)
MOCK_PARTIAL_RESULTS = [
    {
        "word_index": 0,
        "word": "the",
        "phonemes": [{"phoneme": "ð", "score": 0.9}, {"phoneme": "ə", "score": 0.85}],
        "score": 0.875,
    },
    {
        "word_index": 1,
        "word": "quick",
        "phonemes": [
            {"phoneme": "k", "score": 0.88},
            {"phoneme": "w", "score": 0.92},
            {"phoneme": "ɪ", "score": 0.80},
            {"phoneme": "k", "score": 0.87},
        ],
        "score": 0.868,
    },
    {
        "word_index": 2,
        "word": "brown",
        "phonemes": [
            {"phoneme": "b", "score": 0.91},
            {"phoneme": "ɹ", "score": 0.83},
            {"phoneme": "aʊ", "score": 0.78},
            {"phoneme": "n", "score": 0.89},
        ],
        "score": 0.853,
    },
    {
        "word_index": 3,
        "word": "fox",
        "phonemes": [
            {"phoneme": "f", "score": 0.94},
            {"phoneme": "ɑ", "score": 0.82},
        ],
        "score": 0.88,
    },
]

MOCK_RESULT = {
    "score": 0.869,
    "passed": True,
    "feedback": "Great job!",
    "res": MOCK_PARTIAL_RESULTS,
}

# Mock /api/lessons response so the test doesn't depend on a seeded Mongo user
# or a real Groq key. The words/phonemes must line up with MOCK_PARTIAL_RESULTS —
# the frontend only shows a score when the returned phoneme matches the expected
# one at the same index.
MOCK_LESSON_RESPONSE = {
    "sentences": {"1": "the quick brown fox"},
    "expected_ipas": [
        {
            "the": ["ð", "ə"],
            "quick": ["k", "w", "ɪ", "k"],
            "brown": ["b", "ɹ", "aʊ", "n"],
            "fox": ["f", "ɑ", "k", "s"],
        }
    ],
    "words_to_ipas": [
        [
            {"word": "the", "phonemes": ["ð", "ə"]},
            {"word": "quick", "phonemes": ["k", "w", "ɪ", "k"]},
            {"word": "brown", "phonemes": ["b", "ɹ", "aʊ", "n"]},
            {"word": "fox", "phonemes": ["f", "ɑ", "k", "s"]},
        ]
    ],
}


def _mock_lessons(route):
    route.fulfill(
        status=200,
        content_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
        body=json.dumps(MOCK_LESSON_RESPONSE),
    )


def _mock_glb(route):
    # The 3D scene (robot-draco.glb, seagull-2.glb) is decorative and
    # unrelated to what this test verifies. CI may not have network access
    # for the Draco WASM decoder or the model files themselves, and letting
    # a real fetch happen just adds flakiness. Fulfilling with a 404 keeps
    # the test hermetic; the frontend's SceneErrorBoundary (see Lesson.jsx)
    # ensures a failed/missing model can't take down the lesson UI.
    route.fulfill(status=404, body="")


# Socket.IO over EIO4 WebSocket framing helpers
def _sio_event(name, data):
    return f'42{json.dumps([name, data])}'


def _mock_socketio(ws_route):
    """Playwright WebSocket route handler that simulates the server socket.io responses."""
    # Engine.IO open packet
    ws_route.send(
        '0{"sid":"testmock","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}'
    )

    def on_message(message):
        if isinstance(message, bytes):
            return  # ignore binary audio chunks
        if message == "40":
            # Namespace connect — ack and queue up mock events
            ws_route.send('40{"sid":"testmock"}')
        elif message.startswith('42["start"'):
            # Emit partial results then final result. Must happen on this
            # callback (sync Playwright is greenlet-based and not thread-safe;
            # sending from another thread raises and is silently swallowed).
            for partial in MOCK_PARTIAL_RESULTS:
                ws_route.send(_sio_event("partial_result", partial))
            ws_route.send(_sio_event("result", MOCK_RESULT))
        elif message == "2":
            ws_route.send("3")  # pong

    ws_route.on_message(on_message)


class TestLesson(unittest.TestCase):
    def test_phoneme_colors_and_tooltip(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=os.getenv("CI") == "true")
            context = browser.new_context(permissions=["microphone"])
            page = context.new_page()

            # Surface any client-side JS errors/console errors in the pytest
            # output instead of letting them fail silently — this is what
            # actually pointed at the root cause of the original timeout
            # (an unhandled GLTF/Draco load rejection with no error boundary
            # around it, which was tearing down the whole component tree).
            page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))
            page.on(
                "console",
                lambda msg: print(f"CONSOLE ERROR: {msg.text}") if msg.type == "error" else None,
            )

            # Mock the lesson API (CI has no seeded Mongo user and no real Groq key)
            page.route("**/api/lessons*", _mock_lessons)

            # Mock the 3D model assets so the test doesn't depend on network
            # access or the Draco decoder being available in CI, and so a
            # missing/broken model can never be the reason this test hangs.
            page.route("**/*.glb", _mock_glb)

            # Intercept socket.io WebSocket connections
            page.route_web_socket("**/socket.io/**", _mock_socketio)

            # Mock getUserMedia to return a silent audio track (avoids microphone prompt)
            page.add_init_script("""
                navigator.mediaDevices.getUserMedia = async () => {
                    const ctx = new AudioContext();
                    const dest = ctx.createMediaStreamDestination();
                    return dest.stream;
                };
            """)

            page.goto("http://localhost:5173/lessons/1")
            page.click("text=Start Lesson")
            page.wait_for_selector("text=Say this sentence:")
            # Phoneme grid rendering proves the lesson data has loaded
            page.wait_for_selector("span[title='No score']")

            page.click("text=Record")

            # Poll on the count directly rather than waiting for visibility of
            # an arbitrary matched element — more robust once several scored
            # spans exist, and gives a clearer timeout failure than
            # wait_for_selector against a >10-count assertion.
            page.wait_for_function(
                "document.querySelectorAll(\"span[title*='Score:']\").length > 10",
                timeout=15000,
            )

            scored_phonemes = page.locator("span[title*='Score:']")
            self.assertGreater(scored_phonemes.count(), 10)

            browser.close()


if __name__ == "__main__":
    unittest.main()