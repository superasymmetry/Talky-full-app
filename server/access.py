from flask import jsonify
from database import users_collection


def _require_role(caller_id, expected_role):
    caller = users_collection.find_one({"userId": caller_id})
    if not caller:
        return None, (jsonify({"message": "User not found"}), 404)
    if caller.get("role") != expected_role:
        return None, (jsonify({"message": f"Only a {expected_role} can do this"}), 403)
    return caller, None


def _authorize_student_access(caller_id, student_id):
    student = users_collection.find_one({"userId": student_id})
    if not student:
        return None, (jsonify({"message": "Student not found"}), 404)
    if caller_id == student_id:
        return student, None
    if student.get("teacherId") == caller_id:
        return student, None
    if caller_id in (student.get("parentIds") or []):
        return student, None
    return None, (jsonify({"message": "Not authorized for this student"}), 403)


def _require_teacher_of(caller_id, student_id):
    '''Stricter than _authorize_student_access: caller must be a Teacher AND
    the specific student's linked teacher. Used for teacher-only writes
    (goals, assignments, notes) where the student themself must NOT be able
    to call the route, even for their own id.'''
    caller, err = _require_role(caller_id, "Teacher")
    if err:
        return None, None, err
    student = users_collection.find_one({"userId": student_id})
    if not student:
        return None, None, (jsonify({"message": "Student not found"}), 404)
    if student.get("teacherId") != caller_id:
        return None, None, (jsonify({"message": "Not authorized for this student"}), 403)
    return caller, student, None
