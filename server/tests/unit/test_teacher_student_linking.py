import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

TEACHER_ID = "test_link_teacher"
STUDENT_ID = "test_link_student"
OTHER_TEACHER_ID = "test_link_other_teacher"


def _auth_patches(sub):
    return (
        patch("auth.get_jwks", return_value={
            "keys": [{"kty": "RSA", "kid": "test-kid", "use": "sig", "n": "n", "e": "AQAB"}]
        }),
        patch("auth.jwt.get_unverified_header", return_value={"kid": "test-kid"}),
        patch("auth.jwt.decode", return_value={"sub": sub}),
    )


class TeacherStudentLinkingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import database
        for uid in (TEACHER_ID, STUDENT_ID, OTHER_TEACHER_ID):
            database.users_collection.delete_one({"userId": uid})
        database.users_collection.insert_one({
            "userId": TEACHER_ID, "name": "Ms. Test", "role": "Teacher", "students": [],
        })
        database.users_collection.insert_one({
            "userId": OTHER_TEACHER_ID, "name": "Mr. Other", "role": "Teacher", "students": [],
        })
        database.users_collection.insert_one({
            "userId": STUDENT_ID, "name": "Test Kid", "role": "Student", "teacherId": None,
            "pendingTeacherRequest": None,
        })

    @classmethod
    def tearDownClass(cls):
        import database
        for uid in (TEACHER_ID, STUDENT_ID, OTHER_TEACHER_ID):
            database.users_collection.delete_one({"userId": uid})

    def setUp(self):
        import database
        database.users_collection.update_one(
            {"userId": STUDENT_ID},
            {"$set": {"teacherId": None, "pendingTeacherRequest": None}},
        )
        database.users_collection.update_one(
            {"userId": TEACHER_ID}, {"$set": {"students": []}}
        )

    def _call(self, client, method, path, sub, body=None):
        p1, p2, p3 = _auth_patches(sub)
        with p1, p2, p3:
            fn = getattr(client, method)
            kwargs = {"headers": {"Authorization": "Bearer test-token"}}
            if body is not None:
                import json as _json
                kwargs["data"] = _json.dumps(body)
                kwargs["content_type"] = "application/json"
            return fn(path, **kwargs)

    def test_add_student_creates_pending_request_not_instant_link(self):
        import main
        client = main.app.test_client()

        res = self._call(client, "post", "/api/user/addStudent", TEACHER_ID, {"studentId": STUDENT_ID})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        # No link should exist yet - only a pending request.
        self.assertIsNone(student.get("teacherId"))
        self.assertIsNotNone(student.get("pendingTeacherRequest"))
        self.assertEqual(student["pendingTeacherRequest"]["teacherId"], TEACHER_ID)

        teacher = database.users_collection.find_one({"userId": TEACHER_ID})
        self.assertNotIn(STUDENT_ID, teacher.get("students", []))

    def test_student_must_accept_before_link_exists(self):
        import main
        client = main.app.test_client()

        self._call(client, "post", "/api/user/addStudent", TEACHER_ID, {"studentId": STUDENT_ID})
        res = self._call(client, "post", "/api/user/respondToTeacherRequest", STUDENT_ID, {"accept": True})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertEqual(student.get("teacherId"), TEACHER_ID)
        self.assertIsNone(student.get("pendingTeacherRequest"))

        teacher = database.users_collection.find_one({"userId": TEACHER_ID})
        self.assertIn(STUDENT_ID, teacher.get("students", []))

    def test_student_can_decline_request(self):
        import main
        client = main.app.test_client()

        self._call(client, "post", "/api/user/addStudent", TEACHER_ID, {"studentId": STUDENT_ID})
        res = self._call(client, "post", "/api/user/respondToTeacherRequest", STUDENT_ID, {"accept": False})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertIsNone(student.get("teacherId"))
        self.assertIsNone(student.get("pendingTeacherRequest"))

        teacher = database.users_collection.find_one({"userId": TEACHER_ID})
        self.assertNotIn(STUDENT_ID, teacher.get("students", []))

    def test_second_teacher_cannot_request_already_linked_student(self):
        import main
        client = main.app.test_client()

        self._call(client, "post", "/api/user/addStudent", TEACHER_ID, {"studentId": STUDENT_ID})
        self._call(client, "post", "/api/user/respondToTeacherRequest", STUDENT_ID, {"accept": True})

        res = self._call(client, "post", "/api/user/addStudent", OTHER_TEACHER_ID, {"studentId": STUDENT_ID})
        self.assertEqual(res.status_code, 400)

    def test_search_requires_a_real_query(self):
        import main
        client = main.app.test_client()

        p1, p2, p3 = _auth_patches(TEACHER_ID)
        with p1, p2, p3:
            empty = client.get('/api/user/searchStudents', query_string={'q': ''},
                                headers={"Authorization": "Bearer test-token"})
            one_char = client.get('/api/user/searchStudents', query_string={'q': 'T'},
                                   headers={"Authorization": "Bearer test-token"})
            real = client.get('/api/user/searchStudents', query_string={'q': 'Test Kid'},
                               headers={"Authorization": "Bearer test-token"})

        self.assertEqual(empty.get_json()["students"], [])
        self.assertEqual(one_char.get_json()["students"], [])
        self.assertTrue(any(s["userId"] == STUDENT_ID for s in real.get_json()["students"]))


if __name__ == '__main__':
    unittest.main()
