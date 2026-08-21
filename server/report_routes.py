from flask import Blueprint, g, Response
from database import users_collection, lesson_attempts_collection
from auth import requires_auth
from access import _authorize_student_access
from reports import build_progress_csv, build_progress_pdf

report_bp = Blueprint("report_bp", __name__)


def _load_report_inputs(student_id):
    """Same access rule as the rest of the student-detail surface: self,
    linked teacher, or linked parent - the exact audience who should be
    able to pull a report to hand to an SLP."""
    student, err = _authorize_student_access(g.current_user.get("sub"), student_id)
    if err:
        return None, None, err

    attempts = list(
        lesson_attempts_collection.find({"userId": student_id}, {"_id": 0})
        .sort("createdAt", -1)
    )
    return student, attempts, None


@report_bp.route("/api/user/student/<student_id>/report.csv", methods=["GET"])
@requires_auth
def student_report_csv(student_id):
    student, attempts, err = _load_report_inputs(student_id)
    if err:
        return err

    csv_text = build_progress_csv(student, attempts)
    filename = f"talky-progress-{student_id}.csv"
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@report_bp.route("/api/user/student/<student_id>/report.pdf", methods=["GET"])
@requires_auth
def student_report_pdf(student_id):
    student, attempts, err = _load_report_inputs(student_id)
    if err:
        return err

    pdf_bytes = build_progress_pdf(student, attempts)
    filename = f"talky-progress-{student_id}.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
