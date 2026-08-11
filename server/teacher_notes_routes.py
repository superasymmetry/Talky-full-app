from flask import Blueprint, request, jsonify, g
from database import teacher_notes_collection
from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
from auth import requires_auth
from access import _require_teacher_of

teacher_notes_bp = Blueprint("teacher_notes_bp", __name__)


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _serialize_note(note):
    note = dict(note)
    note["id"] = str(note.pop("_id"))
    return note


@teacher_notes_bp.route("/api/user/student/<student_id>/notes", methods=["POST"])
@requires_auth
def add_teacher_note(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"message": "text is required"}), 400

    doc = {
        "studentId": student_id,
        "teacherId": caller_id,
        "text": text,
        "createdAt": _utc_now_iso(),
        "updatedAt": None,
    }
    result = teacher_notes_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify(_serialize_note(doc)), 201


@teacher_notes_bp.route("/api/user/student/<student_id>/notes", methods=["GET"])
@requires_auth
def list_teacher_notes(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    cursor = teacher_notes_collection.find({"studentId": student_id}).sort("createdAt", -1)
    return jsonify({"notes": [_serialize_note(n) for n in cursor]}), 200


@teacher_notes_bp.route("/api/user/student/<student_id>/notes/<note_id>", methods=["DELETE"])
@requires_auth
def delete_teacher_note(student_id, note_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    try:
        oid = ObjectId(note_id)
    except InvalidId:
        return jsonify({"message": "Invalid note id"}), 400

    result = teacher_notes_collection.delete_one(
        {"_id": oid, "studentId": student_id, "teacherId": caller_id}
    )
    if result.deleted_count == 0:
        return jsonify({"message": "Note not found"}), 404
    return jsonify({"message": "Note deleted"}), 200
