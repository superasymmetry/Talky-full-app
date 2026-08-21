import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

PARENT_ID = "test_parent_a"
OTHER_PARENT_ID = "test_parent_b"
STUDENT_ID = "test_parent_student"


def _auth_patches(sub):
    return (
        patch("auth.get_jwks", return_value={
            "keys": [{"kty": "RSA", "kid": "test-kid", "use": "sig", "n": "n", "e": "AQAB"}]
        }),
        patch("auth.jwt.get_unverified_header", return_value={"kid": "test-kid"}),
        patch("auth.jwt.decode", return_value={"sub": sub}),
    )


class ParentLinkingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import database
        for uid in (PARENT_ID, OTHER_PARENT_ID, STUDENT_ID):
            database.users_collection.delete_one({"userId": uid})
        database.users_collection.insert_one({
            "userId": PARENT_ID, "name": "Parent A", "role": "Parent", "children": [],
        })
        database.users_collection.insert_one({
            "userId": OTHER_PARENT_ID, "name": "Parent B", "role": "Parent", "children": [],
        })
        database.users_collection.insert_one({
            "userId": STUDENT_ID, "name": "Test Kid", "role": "Student",
            "parentIds": [], "pendingParentRequests": [], "teacherId": None,
        })

    @classmethod
    def tearDownClass(cls):
        import database
        for uid in (PARENT_ID, OTHER_PARENT_ID, STUDENT_ID):
            database.users_collection.delete_one({"userId": uid})

    def setUp(self):
        import database
        database.users_collection.update_one(
            {"userId": STUDENT_ID},
            {"$set": {"parentIds": [], "pendingParentRequests": []}},
        )
        for pid in (PARENT_ID, OTHER_PARENT_ID):
            database.users_collection.update_one({"userId": pid}, {"$set": {"children": []}})

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

    def test_request_creates_pending_not_instant_link(self):
        import main
        client = main.app.test_client()
        res = self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertEqual(student.get("parentIds"), [])
        self.assertEqual(len(student.get("pendingParentRequests", [])), 1)
        self.assertEqual(student["pendingParentRequests"][0]["parentId"], PARENT_ID)

    def test_accept_links_both_sides(self):
        import main
        client = main.app.test_client()
        self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        res = self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                          {"parentId": PARENT_ID, "accept": True})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertIn(PARENT_ID, student.get("parentIds", []))
        self.assertEqual(student.get("pendingParentRequests"), [])

        parent = database.users_collection.find_one({"userId": PARENT_ID})
        self.assertIn(STUDENT_ID, parent.get("children", []))

    def test_decline_clears_request_without_linking(self):
        import main
        client = main.app.test_client()
        self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        res = self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                          {"parentId": PARENT_ID, "accept": False})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertEqual(student.get("parentIds"), [])
        self.assertEqual(student.get("pendingParentRequests"), [])

    def test_student_can_have_multiple_parents(self):
        import main
        client = main.app.test_client()
        self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        self._call(client, "post", "/api/user/requestChildLink", OTHER_PARENT_ID, {"studentId": STUDENT_ID})
        self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                   {"parentId": PARENT_ID, "accept": True})
        res = self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                          {"parentId": OTHER_PARENT_ID, "accept": True})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertCountEqual(student.get("parentIds", []), [PARENT_ID, OTHER_PARENT_ID])

    def test_remove_child_unlinks_both_sides(self):
        import main
        client = main.app.test_client()
        self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                   {"parentId": PARENT_ID, "accept": True})

        res = self._call(client, "post", "/api/user/removeChild", PARENT_ID, {"studentId": STUDENT_ID})
        self.assertEqual(res.status_code, 200)

        import database
        student = database.users_collection.find_one({"userId": STUDENT_ID})
        self.assertNotIn(PARENT_ID, student.get("parentIds", []))
        parent = database.users_collection.find_one({"userId": PARENT_ID})
        self.assertNotIn(STUDENT_ID, parent.get("children", []))

    def test_parent_can_view_student_detail_readonly(self):
        # get_student_detail uses _authorize_student_access, which should
        # now accept a linked parent the same way it already accepts a
        # linked teacher.
        import main
        client = main.app.test_client()
        self._call(client, "post", "/api/user/requestChildLink", PARENT_ID, {"studentId": STUDENT_ID})
        self._call(client, "post", "/api/user/respondToParentRequest", STUDENT_ID,
                   {"parentId": PARENT_ID, "accept": True})

        res = self._call(client, "get", f"/api/user/student/{STUDENT_ID}/detail", PARENT_ID)
        self.assertEqual(res.status_code, 200)

    def test_search_children_requires_query_and_role(self):
        import main
        client = main.app.test_client()

        blank = self._call(client, "get", "/api/user/searchChildren?q=", PARENT_ID)
        self.assertEqual(blank.get_json()["students"], [])

        real = self._call(client, "get", "/api/user/searchChildren?q=Test%20Kid", PARENT_ID)
        self.assertTrue(any(s["userId"] == STUDENT_ID for s in real.get_json()["students"]))

        # A student can't use the parent search endpoint.
        forbidden = self._call(client, "get", "/api/user/searchChildren?q=Test", STUDENT_ID)
        self.assertEqual(forbidden.status_code, 403)


if __name__ == '__main__':
    unittest.main()
