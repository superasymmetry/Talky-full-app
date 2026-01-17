import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class EndpointTest(unittest.TestCase):
    def test_api_lessons(self):
        import main
        client = main.app.test_client()
        response = client.get('/api/lessons', query_string={'user_id': 'demo', 'lesson_id': '1'})
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
        response = client.get('/api/wordbank', query_string={'category': 'l-sounds'})
        self.assertEqual(response.status_code, 200)

    def test_user_getlevel(self):
        import main
        client = main.app.test_client()
        response = client.get('/api/user/get_level', query_string={'user_id': 'demo'})
        self.assertEqual(response.status_code, 200)
    
    def test_user_getprogress(self):
        import main
        client = main.app.test_client()
        response = client.get('/api/user/progress', query_string={'user_id': 'demo'})
        self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main()