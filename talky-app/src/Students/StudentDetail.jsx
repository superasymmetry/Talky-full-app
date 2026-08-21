import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

import { Card } from '../Statistics/components.jsx';
import Header from '../Header/Header.jsx';
import StatisticsPanel from '../Statistics/StatisticsPanel.jsx';
import { makeAuthFetch } from '../utils/authFetch.js';
import { topFeedback } from '../Lesson/summaryDerive.js';
import { useAuth0 } from '@auth0/auth0-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Same phoneme set the backend's phoneme_word_bank accepts — keep in sync
// with server/user_routes.py.
const PHONEME_OPTIONS = [
  'p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 's', 'z', 'ʃ', 'ʒ', 'tʃ', 'dʒ',
  'm', 'n', 'ŋ', 'l', 'r', 'w', 'j', 'a', 'e', 'i', 'o', 'u',
];

const Layout = ({ children }) => (
  <div className="bg-n-8 text-n-1 min-h-screen">
    <Header />
    <main
      className="px-5 lg:px-10 pb-12"
      style={{ paddingTop: 'calc(var(--header-height, 112px) + 1.5rem)' }}
    >
      <div className="max-w-[87.5rem] mx-auto flex flex-col gap-4">{children}</div>
    </main>
  </div>
);

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function GoalPanel({ studentId, activeGoal, onChanged, authFetch }) {
  const [phoneme, setPhoneme] = useState(activeGoal?.phoneme || PHONEME_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSet = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/goal`, {
        method: 'POST',
        body: JSON.stringify({ phoneme, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not set goal');
      setNote('');
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/goal`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not clear goal');
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Focus goal">
      {activeGoal ? (
        <div className="flex flex-col gap-2 mb-3">
          <p className="body-2 text-n-1">
            Target sound: <span className="font-mono font-semibold text-color-1">/{activeGoal.phoneme}/</span>
          </p>
          {activeGoal.note && <p className="body-2 text-n-3">"{activeGoal.note}"</p>}
          <p className="caption text-n-4">Set {fmtDate(activeGoal.setAt)}</p>
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="cut-chip self-start px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-3/60"
          >
            Clear goal
          </button>
        </div>
      ) : (
        <p className="body-2 text-n-3 mb-3">No standing goal set — lessons auto-target the weakest sound.</p>
      )}

      <div className="flex flex-col gap-2 pt-3 border-t border-n-1/10">
        <label className="caption text-n-3" htmlFor="goal-phoneme-select">Set a new focus sound</label>
        <div className="flex gap-2 flex-wrap">
          <select
            id="goal-phoneme-select"
            value={phoneme}
            onChange={(e) => setPhoneme(e.target.value)}
            className="cut-chip px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10 font-mono"
          >
            {PHONEME_OPTIONS.map((p) => (
              <option key={p} value={p} style={{ backgroundColor: '#171c3a', color: '#f1f5f9' }}>/{p}/</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Optional note, e.g. focus on final position"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="cut-chip flex-1 min-w-[200px] px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10"
          />
          <button
            type="button"
            onClick={handleSet}
            disabled={saving}
            className="cut-chip px-3 py-1.5 bg-color-1 text-n-8 border border-color-1 font-semibold"
          >
            {saving ? 'Saving…' : 'Set goal'}
          </button>
        </div>
        {errorMsg && <p className="caption text-color-3">{errorMsg}</p>}
      </div>
    </Card>
  );
}

function AssignmentPanel({ studentId, pendingAssignedLesson, onChanged, authFetch }) {
  const [phoneme, setPhoneme] = useState(PHONEME_OPTIONS[0]);
  const [wordsText, setWordsText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAssign = async () => {
    const words = wordsText.split(',').map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) {
      setErrorMsg('Enter at least one word, separated by commas.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/assign-lesson`, {
        method: 'POST',
        body: JSON.stringify({ phoneme, words, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not assign lesson');
      setWordsText('');
      setNote('');
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/assign-lesson`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not cancel assignment');
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Assign next lesson">
      {pendingAssignedLesson ? (
        <div className="flex flex-col gap-2 mb-3">
          <p className="body-2 text-n-1">
            Next lesson: <span className="font-mono font-semibold text-color-1">/{pendingAssignedLesson.phoneme}/</span>
            {' — '}{pendingAssignedLesson.words.join(', ')}
          </p>
          {pendingAssignedLesson.note && <p className="body-2 text-n-3">"{pendingAssignedLesson.note}"</p>}
          <p className="caption text-n-4">Assigned {fmtDate(pendingAssignedLesson.assignedAt)} · used automatically next time this student finishes a lesson</p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="cut-chip self-start px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-3/60"
          >
            Cancel assignment
          </button>
        </div>
      ) : (
        <p className="body-2 text-n-3 mb-3">No lesson assigned — the next lesson will use the goal or auto-detected weak sound.</p>
      )}

      <div className="flex flex-col gap-2 pt-3 border-t border-n-1/10">
        <label className="caption text-n-3" htmlFor="assignment-phoneme-select">Hand-pick the next lesson</label>
        <div className="flex gap-2 flex-wrap">
          <select
            id="assignment-phoneme-select"
            value={phoneme}
            onChange={(e) => setPhoneme(e.target.value)}
            className="cut-chip px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10 font-mono"
          >
            {PHONEME_OPTIONS.map((p) => (
              <option key={p} value={p} style={{ backgroundColor: '#171c3a', color: '#f1f5f9' }}>/{p}/</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Words, comma-separated (e.g. lion, light)"
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            className="cut-chip flex-1 min-w-[200px] px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10"
          />
        </div>
        <input
          type="text"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="cut-chip px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10"
        />
        <button
          type="button"
          onClick={handleAssign}
          disabled={saving}
          className="cut-chip self-start px-3 py-1.5 bg-color-1 text-n-8 border border-color-1 font-semibold"
        >
          {saving ? 'Assigning…' : 'Assign lesson'}
        </button>
        {errorMsg && <p className="caption text-color-3">{errorMsg}</p>}
      </div>
    </Card>
  );
}

function AttemptsPanel({ attempts, loading }) {
  if (loading) return <Card title="Recent lesson attempts">Loading…</Card>;
  if (!attempts.length) {
    return <Card title="Recent lesson attempts"><p className="body-2 text-n-3">No lesson attempts yet.</p></Card>;
  }

  return (
    <Card title="Recent lesson attempts">
      <ul className="flex flex-col gap-3 divide-y divide-n-6">
        {attempts.map((a, i) => {
          const cues = topFeedback(a.feedbackHistory);
          return (
            <li key={`${a.lessonId}-${a.attemptNumber}-${i}`} className={i === 0 ? '' : 'pt-3'}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="body-2 text-n-1">
                  Lesson {a.lessonId} · <span className="font-mono">/{a.phoneme}/</span>
                  {' '}<span className="caption text-n-4">attempt #{a.attemptNumber}</span>
                </span>
                <span className="caption text-n-4">{fmtDateTime(a.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className={`font-semibold ${a.status === 'completed' ? 'text-color-4' : 'text-color-3'}`}>
                  {Math.round((a.overallScore || 0) * 100)}%
                </span>
                <span className="caption text-n-4 capitalize">{a.status}</span>
              </div>
              {cues.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {cues.map((c, ci) => (
                    <li key={`${c.word}-${ci}`} className="caption text-n-3">
                      <span className="font-mono text-n-2">{c.word}</span> — {c.tip || c.text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NotesList({ loading, notes, onDelete }) {
  if (loading) return <p className="body-2 text-n-3">Loading notes…</p>;
  if (notes.length === 0) return <p className="body-2 text-n-3">No notes yet.</p>;

  return (
    <ul className="flex flex-col gap-2 divide-y divide-n-6">
      {notes.map((n, i) => (
        <li key={n.id} className={`flex items-start justify-between gap-3 ${i === 0 ? '' : 'pt-2'}`}>
          <div>
            <p className="body-2 text-n-1">{n.text}</p>
            <p className="caption text-n-4">{fmtDateTime(n.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={() => onDelete(n.id)}
            aria-label="Delete note"
            className="text-n-4 hover:text-color-3 shrink-0"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function NotesPanel({ studentId, authFetch }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/notes`);
      if (res.status === 403) {
        setVisible(false);
        return;
      }
      const json = await res.json();
      setNotes(json.notes || []);
    } catch (err) {
      console.error('Failed to load notes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (!visible) return null;

  const handleAdd = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setText('');
        await loadNotes();
      }
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      await authFetch(`${API_BASE}/api/user/student/${studentId}/notes/${noteId}`, { method: 'DELETE' });
      await loadNotes();
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  return (
    <Card title="Therapist notes (private)">
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Add a private note about this student..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="cut-chip flex-1 px-2.5 py-1.5 bg-n-6 text-n-1 border border-n-1/10"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="cut-chip px-3 py-1.5 bg-color-1 text-n-8 border border-color-1 font-semibold"
        >
          Add
        </button>
      </div>

      <NotesList loading={loading} notes={notes} onDelete={handleDelete} />
    </Card>
  );
}

export default function StudentDetail() {
  const { studentId } = useParams();
  const { getAccessTokenSilently, isAuthenticated, isLoading: authLoading } = useAuth0();
  const authFetch = useMemo(() => makeAuthFetch(getAccessTokenSilently), [getAccessTokenSilently]);

  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState('loading');
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  // a parent or teacher viewing this student
  const [viewerRole, setViewerRole] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const loadDetail = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/detail`);
      if (!res.ok) {
        setDetailStatus(res.status === 403 ? 'forbidden' : 'error');
        return;
      }
      setDetail(await res.json());
      setDetailStatus('ready');
    } catch (err) {
      console.error('Failed to load student detail', err);
      setDetailStatus('error');
    }
  };

  const loadAttempts = async () => {
    setAttemptsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/attempts`);
      if (res.ok) {
        const json = await res.json();
        setAttempts(json.attempts || []);
      }
    } catch (err) {
      console.error('Failed to load attempts', err);
    } finally {
      setAttemptsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    loadDetail();
    loadAttempts();
    authFetch(`${API_BASE}/api/getUserProfile`)
      .then((res) => (res.ok ? res.json() : null))
      .then((profile) => { if (profile) setViewerRole(profile.role); })
      .catch((err) => console.error('Failed to load viewer profile', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, studentId]);

  const handleDownloadReport = async (format) => {
    setDownloading(format);
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${studentId}/report.${format}`);
      if (!res.ok) throw new Error(`Report download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `talky-progress-${studentId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report', err);
      alert('Could not download the report — please try again.');
    } finally {
      setDownloading(null);
    }
  };

  if (authLoading) return <Layout><Card>Loading…</Card></Layout>;
  if (!isAuthenticated) return <Layout><Card>Please log in.</Card></Layout>;

  if (detailStatus === 'loading') return <Layout><Card>Loading student…</Card></Layout>;
  if (detailStatus === 'forbidden') {
    return <Layout><Card title="Not authorized">This student isn't on your roster.</Card></Layout>;
  }
  if (detailStatus === 'error' || !detail) {
    return <Layout><Card title="Couldn't load student">Something went wrong loading this student's data.</Card></Layout>;
  }

  return (
    <Layout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/profile" className="caption text-n-3 hover:text-n-1">
            ← Back to {viewerRole === 'Parent' ? 'my children' : 'roster'}
          </Link>
          <h1 className="h5 m-0 mt-1 text-n-1">{detail.nickname || detail.name || 'Student'}</h1>
          {detail.age && <p className="caption text-n-4">Age {detail.age}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleDownloadReport('pdf')}
            disabled={downloading === 'pdf'}
            className="cut-chip px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-1/60"
          >
            {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => handleDownloadReport('csv')}
            disabled={downloading === 'csv'}
            className="cut-chip px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-1/60"
          >
            {downloading === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </div>

      <StatisticsPanel userId={studentId} />

      {viewerRole === 'Teacher' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GoalPanel
            studentId={studentId}
            activeGoal={detail.activeGoal}
            onChanged={loadDetail}
            authFetch={authFetch}
          />
          <AssignmentPanel
            studentId={studentId}
            pendingAssignedLesson={detail.pendingAssignedLesson}
            onChanged={loadDetail}
            authFetch={authFetch}
          />
        </div>
      )}

      <AttemptsPanel attempts={attempts} loading={attemptsLoading} />

      <NotesPanel studentId={studentId} authFetch={authFetch} />
    </Layout>
  );
}
