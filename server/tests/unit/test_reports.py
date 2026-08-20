import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

STUDENT_ID = "test_report_student"
TEACHER_ID = "test_report_teacher"
PARENT_ID = "test_report_parent"
STRANGER_ID = "test_report_stranger"


def _auth_patches(sub):
    return (
        patch("auth.get_jwks", return_value={
            "keys": [{"kty": "RSA", "kid": "test-kid", "use": "sig", "n": "n", "e": "AQAB"}]
        }),
        patch("auth.jwt.get_unverified_header", return_value={"kid": "test-kid"}),
        patch("auth.jwt.decode", return_value={"sub": sub}),
    )


class ReportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import database
        for uid in (STUDENT_ID, TEACHER_ID, PARENT_ID, STRANGER_ID):
            database.users_collection.delete_one({"userId": uid})
        database.users_collection.insert_one({
            "userId": TEACHER_ID, "name": "Teacher", "role": "Teacher", "students": [STUDENT_ID],
        })
        database.users_collection.insert_one({
            "userId": PARENT_ID, "name": "Parent", "role": "Parent", "children": [STUDENT_ID],
        })
        database.users_collection.insert_one({"userId": STRANGER_ID, "name": "Stranger", "role": "Teacher"})
        database.users_collection.insert_one({
            "userId": STUDENT_ID, "name": "Kid", "nickname": "Kiddo", "age": 9, "role": "Student",
            "teacherId": TEACHER_ID, "parentIds": [PARENT_ID],
            "progress": {
                "phonemeScores": [{"phoneme": "s", "avgScore": 0.5, "attempts": 4}],
                "wordScores": [{"word": "sun", "score": 0.3, "timestamp": "2026-08-01T00:00:00+00:00"}],
            },
        })
        database.lesson_attempts_collection.delete_many({"userId": STUDENT_ID})
        database.lesson_attempts_collection.insert_one({
            "userId": STUDENT_ID, "lessonId": "1", "phoneme": "s", "status": "completed",
            "overallScore": 0.6, "attemptNumber": 1, "createdAt": "2026-08-01T00:00:00+00:00",
        })

    @classmethod
    def tearDownClass(cls):
        import database
        for uid in (STUDENT_ID, TEACHER_ID, PARENT_ID, STRANGER_ID):
            database.users_collection.delete_one({"userId": uid})
        database.lesson_attempts_collection.delete_many({"userId": STUDENT_ID})

    def _get(self, client, path, sub):
        p1, p2, p3 = _auth_patches(sub)
        with p1, p2, p3:
            return client.get(path, headers={"Authorization": "Bearer test-token"})

    def test_self_can_download_csv(self):
        import main
        client = main.app.test_client()
        res = self._get(client, f"/api/user/student/{STUDENT_ID}/report.csv", STUDENT_ID)
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.content_type)
        self.assertIn(b"Kiddo", res.data)
        self.assertIn(b"sun", res.data)

    def test_teacher_can_download_pdf(self):
        import main
        client = main.app.test_client()
        res = self._get(client, f"/api/user/student/{STUDENT_ID}/report.pdf", TEACHER_ID)
        self.assertEqual(res.status_code, 200)
        self.assertIn("application/pdf", res.content_type)
        self.assertTrue(res.data.startswith(b"%PDF"))

    def test_parent_can_download_report(self):
        import main
        client = main.app.test_client()
        res = self._get(client, f"/api/user/student/{STUDENT_ID}/report.csv", PARENT_ID)
        self.assertEqual(res.status_code, 200)

    def test_unrelated_account_is_forbidden(self):
        import main
        client = main.app.test_client()
        res = self._get(client, f"/api/user/student/{STUDENT_ID}/report.csv", STRANGER_ID)
        self.assertEqual(res.status_code, 403)


if __name__ == '__main__':
    unittest.main()
