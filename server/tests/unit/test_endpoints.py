import json
import unittest
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

TEST_USER_ID = "test_endpoints_demo"


def _mock_groq_completion(content_dict):
    """Build a mock Groq client whose chat completion returns the given JSON."""
    completion = MagicMock()
    completion.choices[0].message.content = json.dumps(content_dict)
    groq_client = MagicMock()
    groq_client.chat.completions.create.return_value = completion
    return groq_client


class EndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import database
        database.users_collection.delete_one({"userId": TEST_USER_ID})
        database.users_collection.insert_one({
            "userId": TEST_USER_ID,
            "name": "Test User",
            "progress": {
                "phonemeScores": [
                    {"phoneme": "r", "avgScore": None, "attempts": None},
                    {"phoneme": "l", "avgScore": None, "attempts": None},
                ],
                "wordScores": []
            },
            "history": [],
            "lessons": [
                {"id": "1", "phoneme": "r", "words": ["rainbow", "racecar"], "score": 0},
                {"id": "2", "phoneme": "r", "words": ["red", "read"], "score": 0},
            ],
            "level": {"current": 1, "subpoints": 20, "maxval": 100},
            "maxLessonId": 2
        })

    @classmethod
    def tearDownClass(cls):
        import database
        database.users_collection.delete_one({"userId": TEST_USER_ID})

    def test_api_lessons(self):
        import main
        client = main.app.test_client()
        sentences = {str(i): f"sentence number {i} for practice" for i in range(1, 8)}
        with patch.object(main, "Groq", return_value=_mock_groq_completion(sentences)):
            response = client.get('/api/lessons', query_string={'user_id': TEST_USER_ID, 'lesson_id': '1'})
        self.assertEqual(response.status_code, 200)

    def test_database_write_and_read(self):
        import database
        test_doc = {"userId": "testuser", "name": "Test User"}
        database.users_collection.insert_one(test_doc)
        user = database.users_collection.find_one({"userId": "testuser"})
        self.assertIsNotNone(user)
        database.users_collection.delete_one({"userId": "testuser"})

    def test_api_wordbank(self):
        import main
        client = main.app.test_client()
        words = {str(i): {"word": f"word{i}", "emoji": "🍎"} for i in range(1, 17)}
        with patch.object(main, "Groq", return_value=_mock_groq_completion(words)):
            response = client.get('/api/wordbank', query_string={'category': 'l-sounds'})
        self.assertEqual(response.status_code, 200)

    def test_user_getlevel(self):
        import main
        client = main.app.test_client()
        response = client.get('/api/user/get_level', query_string={'user_id': TEST_USER_ID})
        self.assertEqual(response.status_code, 200)

    def test_user_getprogress(self):
        import main
        client = main.app.test_client()
        response = client.get('/api/user/progress', query_string={'user_id': TEST_USER_ID})
        self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main()