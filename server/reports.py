"""Builds the parent/teacher-facing progress report (CSV + PDF) that a
guardian can hand to a licensed SLP. Pure data-formatting - no Flask/auth
here, so it's easy to unit test without a request context.
"""
import csv
import io
from datetime import datetime, timezone

from fpdf import FPDF

REPORT_MAX_ATTEMPTS = 50
WORDS_NEEDING_PRACTICE_COUNT = 10


def _fmt_pct(score):
    return f"{round(score * 100)}%" if isinstance(score, (int, float)) else "—"


def _fmt_date(iso):
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%b %d, %Y")
    except ValueError:
        return iso


def _scored_phonemes(user_doc):
    scores = user_doc.get("progress", {}).get("phonemeScores", [])
    return sorted(
        (p for p in scores if p.get("avgScore") is not None),
        key=lambda p: p["avgScore"],
    )


def _weakest_words(user_doc, limit=WORDS_NEEDING_PRACTICE_COUNT):
    word_scores = user_doc.get("progress", {}).get("wordScores", [])
    scored = [w for w in word_scores if isinstance(w.get("score"), (int, float))]
    return sorted(scored, key=lambda w: w["score"])[:limit]


def build_report_data(user_doc, attempts):
    """Shared data prep for both export formats, kept separate from the
    format-specific rendering so CSV/PDF can't silently drift apart."""
    return {
        "name": user_doc.get("nickname") or user_doc.get("name") or user_doc.get("userId", "Student"),
        "age": user_doc.get("age"),
        "generated_at": datetime.now(timezone.utc),
        "phoneme_scores": _scored_phonemes(user_doc),
        "weakest_words": _weakest_words(user_doc),
        "attempts": attempts[:REPORT_MAX_ATTEMPTS],
    }


def build_progress_csv(user_doc, attempts):
    data = build_report_data(user_doc, attempts)
    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow(["Talky Progress Report"])
    writer.writerow(["Student", data["name"]])
    if data["age"]:
        writer.writerow(["Age", data["age"]])
    writer.writerow(["Generated", data["generated_at"].strftime("%Y-%m-%d %H:%M UTC")])
    writer.writerow([])

    writer.writerow(["Phoneme", "Average Score", "Attempts"])
    for p in data["phoneme_scores"]:
        writer.writerow([p["phoneme"], _fmt_pct(p["avgScore"]), p.get("attempts") or 0])
    writer.writerow([])

    writer.writerow(["Words needing practice", "Score", "Last practiced"])
    for w in data["weakest_words"]:
        writer.writerow([w.get("word", ""), _fmt_pct(w.get("score")), _fmt_date(w.get("timestamp"))])
    writer.writerow([])

    writer.writerow(["Lesson", "Phoneme", "Status", "Score", "Date"])
    for a in data["attempts"]:
        writer.writerow([
            a.get("lessonId", ""), a.get("phoneme", ""), a.get("status", ""),
            _fmt_pct(a.get("overallScore")), _fmt_date(a.get("createdAt")),
        ])

    return buf.getvalue()


def build_progress_pdf(user_doc, attempts):
    data = build_report_data(user_doc, attempts)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "Talky Progress Report", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    subtitle = f"{data['name']}"
    if data["age"]:
        subtitle += f" - age {data['age']}"
    pdf.cell(0, 8, subtitle, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, f"Generated {data['generated_at'].strftime('%B %d, %Y')}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    def section_title(text):
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 9, text, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)

    def table(headers, rows, widths, empty_message):
        pdf.set_font("Helvetica", "B", 10)
        for h, w in zip(headers, widths):
            pdf.cell(w, 7, h, border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        if not rows:
            pdf.cell(sum(widths), 7, empty_message, border=1, new_x="LMARGIN", new_y="NEXT")
            return
        for row in rows:
            for cell, w in zip(row, widths):
                pdf.cell(w, 7, str(cell), border=1)
            pdf.ln()

    section_title("Phoneme scores")
    table(
        ["Phoneme", "Avg score", "Attempts"],
        [[p["phoneme"], _fmt_pct(p["avgScore"]), p.get("attempts") or 0] for p in data["phoneme_scores"]],
        [40, 40, 40],
        "No scored phonemes yet.",
    )
    pdf.ln(4)

    section_title("Words needing practice")
    table(
        ["Word", "Score", "Last practiced"],
        [[w.get("word", ""), _fmt_pct(w.get("score")), _fmt_date(w.get("timestamp"))] for w in data["weakest_words"]],
        [60, 40, 50],
        "No word-level data yet.",
    )
    pdf.ln(4)

    section_title("Recent lesson attempts")
    table(
        ["Lesson", "Phoneme", "Status", "Score", "Date"],
        [[a.get("lessonId", ""), a.get("phoneme", ""), a.get("status", ""),
          _fmt_pct(a.get("overallScore")), _fmt_date(a.get("createdAt"))] for a in data["attempts"]],
        [25, 30, 30, 30, 45],
        "No lesson attempts yet.",
    )

    return bytes(pdf.output())
