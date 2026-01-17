import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class SmokeTest(unittest.TestCase):
    def test_smoke(self):
        self.assertTrue(True)

    def test_imports(self):
        import main
        import user_routes
        import score_routes
        self.assertTrue(True)

    def test_database_connection(self):
        import database
        self.assertTrue(database.client is not None)
        self.assertTrue(database.db is not None)
        self.assertTrue(database.users_collection is not None)
    
    def test_user_document_structure(self):
        import database
        user = database.users_collection.find_one()
        if user:
            self.assertIn('userId', user)
            self.assertIn('lessons', user)
            self.assertIn('progress', user)
            self.assertIn('history', user)
            self.assertIn('name', user)
            self.assertIn('level', user)
            self.assertIn('maxLessonId', user)

if __name__ == '__main__':
    unittest.main()