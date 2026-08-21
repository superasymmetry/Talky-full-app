import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

TEST_USER_ID = "test_assessment_user"


class AssessmentDocTest(unittest.TestCase):
    """_default_user_doc/_build_assessment_lessons are pure functions - no DB
    or network needed."""

    def test_new_user_starts_with_only_the_first_assessment_lesson(self):
        # Only lesson 1 exists up front - lessons 2-6 come one at a time
        # from generatenextlesson draining pendingAssessmentQueue, so a new
        # user can't jump ahead to assessment lessons they haven't earned.
        import user_routes
        doc = user_routes._default_user_doc(TEST_USER_ID)

        self.assertEqual(len(doc["lessons"]), 1)
        self.assertEqual(doc["maxLessonId"], 1)
        first = doc["lessons"][0]
        self.assertTrue(first["is_assessment"])
        self.assertEqual(first["phoneme"], user_routes.ASSESSMENT_PHONEMES[0])
        self.assertEqual(len(first["words"]), 2)

        queue = doc["pendingAssessmentQueue"]
        self.assertEqual(len(queue), len(user_routes.ASSESSMENT_PHONEMES) - 1)
        self.assertEqual([q["phoneme"] for q in queue], user_routes.ASSESSMENT_PHONEMES[1:])
        self.assertIsNone(doc["assessmentResults"])

    def test_assessment_covers_no_duplicate_phonemes(self):
        import user_routes
        self.assertEqual(len(user_routes.ASSESSMENT_PHONEMES), len(set(user_routes.ASSESSMENT_PHONEMES)))
        # Every assessed phoneme must actually have words to draw from.
        for phoneme in user_routes.ASSESSMENT_PHONEMES:
            self.assertIn(phoneme, user_routes.phoneme_word_bank)


class AssessmentEndpointTest(unittest.TestCase):
    """/api/lessons must skip the paid Groq call for is_assessment lessons."""

    @classmethod
    def setUpClass(cls):
        import database
        database.users_collection.delete_one({"userId": TEST_USER_ID})
        database.users_collection.insert_one({
            "userId": TEST_USER_ID,
            "name": "Test User",
            "progress": {"phonemeScores": [], "wordScores": []},
            "history": [],
            "lessons": [
                {"id": "1", "phoneme": "s", "words": ["sun", "bus"], "score": 0, "is_assessment": True},
            ],
            "level": {"current": 1, "subpoints": 20, "maxval": 100},
            "maxLessonId": 1,
        })

    @classmethod
    def tearDownClass(cls):
        import database
        database.users_collection.delete_one({"userId": TEST_USER_ID})

    def test_assessment_lesson_skips_groq(self):
        import main
        client = main.app.test_client()
        groq_mock = MagicMock()
        auth_patches = (
            patch("auth.get_jwks", return_value={
                "keys": [{"kty": "RSA", "kid": "test-kid", "use": "sig", "n": "n", "e": "AQAB"}]
            }),
            patch("auth.jwt.get_unverified_header", return_value={"kid": "test-kid"}),
            patch("auth.jwt.decode", return_value={"sub": TEST_USER_ID}),
        )
        with auth_patches[0], auth_patches[1], auth_patches[2], patch.object(main, "Groq", groq_mock):
            response = client.get(
                '/api/lessons',
                query_string={'user_id': TEST_USER_ID, 'lesson_id': '1'},
                headers={"Authorization": "Bearer test-token"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        # Bare words, not a carrier phrase like "Say sun." - the per-word
        # scoring UI would otherwise score "Say" as if it were a real word.
        self.assertEqual(body["sentences"], {"1": "sun", "2": "bus"})
        # Assert on the actual billed call, not the constructor - the
        # background ASR-warmup thread (see _warmup_asr_async in main.py)
        # also constructs a Groq client independently of any request, so it
        # can race with this mock's patch window and make groq_mock itself
        # look "called" for reasons that have nothing to do with this route.
        groq_mock.return_value.chat.completions.create.assert_not_called()


def _auth_patches(sub):
    return (
        patch("auth.get_jwks", return_value={
            "keys": [{"kty": "RSA", "kid": "test-kid", "use": "sig", "n": "n", "e": "AQAB"}]
        }),
        patch("auth.jwt.get_unverified_header", return_value={"kid": "test-kid"}),
        patch("auth.jwt.decode", return_value={"sub": sub}),
    )


class AssessmentSequentialUnlockTest(unittest.TestCase):
    """Exercises /api/user/generatenextlesson and /api/user/retakeAssessment
    against a real user doc, since the sequencing logic lives across both
    _pick_next_lesson_phoneme_and_words and the route itself."""

    USER_ID = "test_assessment_sequence_user"

    def setUp(self):
        import database
        import user_routes
        database.users_collection.delete_one({"userId": self.USER_ID})
        database.users_collection.insert_one(user_routes._default_user_doc(self.USER_ID))

    def tearDown(self):
        import database
        database.users_collection.delete_one({"userId": self.USER_ID})

    def _post(self, client, path, body):
        p1, p2, p3 = _auth_patches(self.USER_ID)
        with p1, p2, p3:
            return client.post(path, json=body, headers={"Authorization": "Bearer test-token"})

    def test_assessment_lessons_unlock_one_at_a_time_then_snapshot_results(self):
        import main
        import database
        import user_routes
        client = main.app.test_client()

        # Drain all 6 assessment lessons one at a time.
        for current_id in range(1, len(user_routes.ASSESSMENT_PHONEMES) + 1):
            res = self._post(client, "/api/user/generatenextlesson", {
                "user_id": self.USER_ID, "currentLessonId": current_id,
            })
            self.assertEqual(res.status_code, 200)

        user = database.users_collection.find_one({"userId": self.USER_ID})
        # 6 assessment lessons + 1 real lesson just generated after the last one.
        self.assertEqual(len(user["lessons"]), len(user_routes.ASSESSMENT_PHONEMES) + 1)
        self.assertEqual(user["pendingAssessmentQueue"], [])
        last_lesson = user["lessons"][-1]
        self.assertNotIn("is_assessment", last_lesson)

        # The transition out of assessment must have snapshotted results.
        self.assertIsNotNone(user["assessmentResults"])
        snapshot_phonemes = {p["phoneme"] for p in user["assessmentResults"]["phonemeScores"]}
        self.assertEqual(snapshot_phonemes, set(user_routes.ASSESSMENT_PHONEMES))

    def test_cannot_skip_ahead_to_a_later_assessment_lesson(self):
        import main
        client = main.app.test_client()
        # Only lesson 1 exists; trying to jump straight to lesson 3 must fail.
        res = self._post(client, "/api/user/generatenextlesson", {
            "user_id": self.USER_ID, "currentLessonId": 2,
        })
        self.assertEqual(res.status_code, 400)

    def test_real_lessons_keep_unlocking_one_at_a_time_after_assessment(self):
        # Regression test: real lessons used to be gated by
        # `currentLessonId == maxLessonId - 1`, a "stay one lesson ahead"
        # buffer that only worked because the old hardcoded system
        # bulk-created 4 real lessons at signup. Once real lessons started
        # being generated one at a time (same as assessment ones), that gate
        # had nothing to buffer against and permanently rejected every
        # generatenextlesson call from the first real lesson onward.
        import main
        import user_routes
        client = main.app.test_client()

        for current_id in range(1, len(user_routes.ASSESSMENT_PHONEMES) + 4):
            res = self._post(client, "/api/user/generatenextlesson", {
                "user_id": self.USER_ID, "currentLessonId": current_id,
            })
            self.assertEqual(
                res.status_code, 200,
                f"generatenextlesson rejected finishing lesson {current_id}: {res.get_json()}"
            )

    def test_retake_assessment_resets_scores_and_requeues(self):
        import main
        import database
        import user_routes
        client = main.app.test_client()

        # Give the assessed phonemes some scores, as if the first pass finished.
        database.users_collection.update_one(
            {"userId": self.USER_ID},
            {"$set": {"progress.phonemeScores": [
                {"phoneme": ph, "avgScore": 0.5, "attempts": 3} for ph in user_routes.ASSESSMENT_PHONEMES
            ], "assessmentResults": {"phonemeScores": [], "completedAt": "2026-01-01T00:00:00+00:00"}}}
        )

        res = self._post(client, "/api/user/retakeAssessment", {})
        self.assertEqual(res.status_code, 200)

        user = database.users_collection.find_one({"userId": self.USER_ID})
        self.assertIsNone(user["assessmentResults"])
        self.assertEqual(len(user["pendingAssessmentQueue"]), len(user_routes.ASSESSMENT_PHONEMES) - 1)
        for entry in user["progress"]["phonemeScores"]:
            if entry["phoneme"] in user_routes.ASSESSMENT_PHONEMES:
                self.assertIsNone(entry["avgScore"])
                self.assertIsNone(entry["attempts"])

        new_lesson = user["lessons"][-1]
        self.assertTrue(new_lesson["is_assessment"])
        self.assertEqual(new_lesson["phoneme"], user_routes.ASSESSMENT_PHONEMES[0])


if __name__ == '__main__':
    unittest.main()
