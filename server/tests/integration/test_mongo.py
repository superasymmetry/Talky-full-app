import unittest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from main import app
from database import users_collection
import dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

dotenv.load_dotenv()

class TestMongoDB(unittest.TestCase):
    def setUp(self):
        MONGO_URI = os.getenv("MONGO_URI")
        self.client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
        db = self.client["talky"]
        self.users_collection = db["users"]
        self.test_user_id = "test_user"
        self.flask_client = app.test_client()
        phonemes = ["l", "r", "p", "b", "t", "d", "k", "g", "f", "v", "s", "z", 
                "ʃ", "sh", "ʒ", "tʃ", "ch", "dʒ", "j", "m", "n", "ŋ", "w", "y",
                "a", "e", "i", "o", "u"]
        phoneme_scores = [{"phoneme": ph, "avgScore": None, "attempts": None} for ph in phonemes]
        initial_history = {ph: 0 for ph in phonemes}
        
        user_doc = {
            "userId": self.test_user_id,
            "name": "Test User",
            "progress": {
                "phonemeScores": phoneme_scores,
                "wordScores": []
            },
            "history": [initial_history],
            "lessons": [
                {"id": "1", "phoneme": "r", "words": ["rainbow", "racecar"], "score": 0},
                {"id": "2", "phoneme": "r", "words": ["red", "read"], "score": 0},
                {"id": "game", "phoneme": "l", "words": ["lion", "leaf"], "score": 0},
                {"id": "3", "phoneme": "l", "words": ["lion", "leaf"], "score": 0},
                {"id": "4", "phoneme": "l", "words": ["letter", "learn"], "score": 0},
            ],
            "level": {"current": 1, "subpoints": 20, "maxval": 100},
            "maxLessonId": 4
        }
        self.users_collection.insert_one(user_doc)
        
    def tearDown(self):
        self.users_collection.delete_one({"userId": self.test_user_id})
        self.client.close()

    def test_user_creation_and_retrieval(self):
        user = self.users_collection.find_one({"userId": self.test_user_id})
        self.assertIsNotNone(user)
        self.assertEqual(user['name'], "Test User")
    
    def test_update_user_progress(self):
        self.users_collection.update_one({"userId": self.test_user_id}, {"$set": {"progress.phonemeScores.0.avgScore": 85}})
        user = self.users_collection.find_one({"userId": self.test_user_id})
        self.assertEqual(user['progress']['phonemeScores'][0]['avgScore'], 85)

    def test_get_user_progress(self):
        response = self.flask_client.get('/api/user/progress', query_string={'user_id': self.test_user_id})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsNotNone(data['phonemeScores'])
    
    def test_get_user_level(self):
        response = self.flask_client.get('/api/user/get_level', query_string={'user_id': self.test_user_id})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsNotNone(data['level'])
        self.assertIsNotNone(data['level']['current'])
        self.assertIsNotNone(data['level']['subpoints'])
        self.assertIsNotNone(data['level']['maxval'])

    def test_get_lessons(self):
        response = self.flask_client.get('/api/user/lessons', query_string={'user_id': self.test_user_id, 'lesson_id': '1'})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsNotNone(data['lessons'])
        self.assertEqual(len(data['lessons']), 5)
        
    def test_generate_next_lesson(self):
        max_lesson_before = self.users_collection.find_one({"userId": self.test_user_id})['maxLessonId']
        
        response = self.flask_client.post('/api/user/generatenextlesson', 
            json={'userId': self.test_user_id, 'currentLessonId': max_lesson_before - 1},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify MongoDB was updated
        user_after = self.users_collection.find_one({"userId": self.test_user_id})
        self.assertEqual(user_after['maxLessonId'], max_lesson_before + 1)

    def test_get_user_history(self):
        response = self.flask_client.get('/api/user/history', query_string={'user_id': self.test_user_id, 'currentLessonId': '5'})
        data = response.get_json()
        self.assertIsNotNone(data['history'])

    def test_without_userid(self):
        response = self.flask_client.get('/api/user/progress')
        self.assertEqual(response.status_code, 400)
        response = self.flask_client.get('/api/user/get_level')
        self.assertEqual(response.status_code, 400)
        response = self.flask_client.get('/api/user/lessons')
        self.assertEqual(response.status_code, 400)
        response = self.flask_client.get('/api/user/generatenextlesson')
        self.assertEqual(response.status_code, 400)
    
    def test_update_user_progress(self):
        prev_attempts = self.users_collection.find_one({"userId": self.test_user_id})['progress']['phonemeScores'][0]['attempts']
        prev_avg_score = self.users_collection.find_one({"userId": self.test_user_id})['progress']['phonemeScores'][0]['avgScore']
        response = self.flask_client.post('/api/user/updateUserProgress', json={
            'user_id': self.test_user_id,
            'phoneme': 'r',
            'addScore': 90,
            'lessonId': '2'
        })
        self.assertEqual(response.status_code, 200)
        user = self.users_collection.find_one({"userId": self.test_user_id})
        self.assertEqual(user['progress']['phonemeScores'][0]['avgScore'], 90)
        self.assertEqual(user['lessons'][1]['score'], 90)
        self.assertEqual(user['history'][-1]['r'], 90)
        self.assertEqual(user['progress']['phonemeScores'][0]['attempts'], prev_attempts + 1)

if __name__ == '__main__':
    unittest.main()