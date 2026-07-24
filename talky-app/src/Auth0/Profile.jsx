import React, { useEffect, useState } from 'react'

import Header from '../Header/Header';
import talkyRocket from '../assets/logo.png';
import { useAuth0 } from '@auth0/auth0-react';

const styleId = 'talky-profile-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes talky-orbit-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .talky-profile-input {
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .talky-profile-input:focus {
      outline: none;
      border-color: #f5a962 !important;
      box-shadow: 0 0 0 3px rgba(245, 169, 98, 0.18);
    }
    .talky-save-btn, .talky-link-btn, .talky-add-btn, .talky-retry-btn {
      transition: background-color 0.15s ease, transform 0.1s ease;
    }
    .talky-save-btn:hover:not(:disabled),
    .talky-link-btn:hover:not(:disabled),
    .talky-add-btn:hover:not(:disabled),
    .talky-retry-btn:hover:not(:disabled) {
      background-color: #f7b87d !important;
    }
    .talky-save-btn:active:not(:disabled),
    .talky-link-btn:active:not(:disabled),
    .talky-add-btn:active:not(:disabled),
    .talky-retry-btn:active:not(:disabled) {
      transform: translateY(1px);
    }
    .talky-save-btn:disabled, .talky-link-btn:disabled, .talky-add-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .talky-remove-btn {
      transition: color 0.15s ease;
    }
    .talky-remove-btn:hover {
      color: #f87171 !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .talky-orbit-ring { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

const panelStyle = {
  borderRadius: '1.25rem',
  padding: '2.25rem 2rem',
  width: '100%',
  maxWidth: '480px',
  backgroundColor: 'rgba(19, 23, 46, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  boxSizing: 'border-box',
};

const inputStyle = {
  padding: '0.6rem 0.8rem',
  borderRadius: '0.6rem',
  border: '1px solid rgba(255,255,255,0.12)',
  backgroundColor: '#171c3a',
  color: '#f1f5f9',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  color: '#c3c9e0',
  marginBottom: '0.4rem',
  fontSize: '0.85rem',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
};

const smallActionBtnStyle = {
  padding: '0 1rem',
  backgroundColor: '#f5a962',
  color: '#0a0d1f',
  border: 'none',
  borderRadius: '0.6rem',
  fontWeight: 700,
  fontSize: '0.82rem',
  whiteSpace: 'nowrap',
};

const Profile = () => {
  const { user, isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  async function authFetch(url, options = {}) {
    const token = await getAccessTokenSilently();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }

  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('16');
  const [role, setRole] = useState('Student');
  // savedRole is the last value we actually confirmed from the server.
  // The roster/search panel and search calls key off THIS, not the
  // editable `role` dropdown — the dropdown can hold an unsaved change
  // that the backend doesn't know about yet, and the backend is the one
  // enforcing who's allowed to search/roster.
  const [savedRole, setSavedRole] = useState(null);
  const [connectCode, setConnectCode] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Teacher-side: roster + student search
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Student-side: linked teacher
  const [myTeacher, setMyTeacher] = useState(null);
  const [teacherCode, setTeacherCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState('');

  // Returns the profile on success, or throws on any failure — callers
  // decide how to handle a failure. This intentionally never invents
  // fallback field values; a caller that can't get real data should show
  // an error state, not a form that looks like it loaded correctly.
  async function fetchProfile() {
    const profileRes = await authFetch(`${API_BASE}/api/getUserProfile`);
    if (!profileRes.ok) {
      throw new Error(`getUserProfile failed: ${profileRes.status}`);
    }
    const profile = await profileRes.json();
    setNickname(profile.nickname ?? profile.name ?? '');
    setAge(String(profile.age ?? 16));
    setRole(profile.role ?? 'Student');
    setSavedRole(profile.role ?? 'Student');
    setConnectCode(profile.connectCode ?? '');
    return profile;
  }

  async function fetchRoster() {
    const res = await authFetch(`${API_BASE}/api/user/roster`);
    if (res.ok) {
      const json = await res.json();
      setStudents(json.students || []);
    }
  }

  async function fetchMyTeacher() {
    const res = await authFetch(`${API_BASE}/api/user/myTeacher`);
    if (res.ok) {
      const json = await res.json();
      setMyTeacher(json.teacher || null);
    }
  }

  async function fetchLinkedData(currentRole) {
    if (currentRole === 'Teacher') {
      await fetchRoster();
    } else if (currentRole === 'Student') {
      await fetchMyTeacher();
    }
  }

  async function runSearch(query) {
    setSearching(true);
    try {
      const res = await authFetch(`${API_BASE}/api/user/searchStudents?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.students || []);
      }
    } catch (err) {
      console.error('Student search failed', err);
    } finally {
      setSearching(false);
    }
  }

  async function loadEverything() {
    setLoadError(false);

    // Core profile fields (nickname/age/role/connectCode) are the part
    // that must succeed, or nothing is shown at all — this is what
    // guards against overwriting real data with blanks.
    let profile;
    try {
      profile = await fetchProfile();
    } catch (err) {
      console.error('Failed to load profile', err);
      setLoadError(true);
      return;
    }
    setProfileLoaded(true);

    // Roster/teacher-link data is secondary: if it fails (e.g. a
    // transient network/CORS hiccup), the profile itself still renders
    // normally — the roster panel just stays empty until a retry, rather
    // than blocking the whole page.
    const currentRole = profile.role ?? 'Student';
    try {
      await fetchLinkedData(currentRole);
      if (currentRole === 'Teacher') {
        await runSearch('');
      }
    } catch (err) {
      console.error('Failed to load roster/teacher data', err);
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, user?.sub]);

  // Re-run search as the teacher types (simple debounce). Gated on
  // savedRole (server truth), not the editable role dropdown — searching
  // before a role change is saved just gets a 403 from the backend.
  useEffect(() => {
    if (savedRole !== 'Teacher' || !profileLoaded) return;
    const handle = setTimeout(() => runSearch(searchQuery), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, savedRole, profileLoaded]);

  if (isLoading) return <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Loading profile...</p>;
  if (!isAuthenticated) return <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Please log in to view your profile, statistics, and more.</p>;

  if (loadError) {
    return (
      <>
        <Header />
        <main style={{ display: 'flex', justifyContent: 'center', paddingTop: 'calc(var(--header-height, 112px) + 2rem)'}}>
          <div style={{ ...panelStyle, textAlign: 'center' }}>
            <p style={{ color: '#f1f5f9', marginBottom: '1rem' }}>
              Couldn't load your profile — nothing was changed.
            </p>
            <button
              onClick={loadEverything}
              className="talky-retry-btn"
              style={{
                padding: '0.65rem 1.5rem', backgroundColor: '#f5a962',
                color: '#0a0d1f', border: 'none', borderRadius: '0.6rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </main>
      </>
    );
  }

  if (!profileLoaded) return <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Loading profile...</p>;

  const handleSave = async () => {
    const payload = {
      nickname,
      age: Number.parseInt(age, 10) || 16,
      role
    };

    try {
      setSaving(true);
      const res = await authFetch(`${API_BASE}/api/updateUserProfile`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (res.ok) {
        // Re-fetch so nickname/age/role, savedRole, and connectCode all
        // reflect exactly what the server actually persisted.
        const profile = await fetchProfile();
        if (profile.role === 'Teacher') {
          await fetchRoster();
          await runSearch('');
        } else if (profile.role === 'Student') {
          await fetchMyTeacher();
        }
        alert('Profile saved');
      } else {
        alert('Failed to save profile: ' + (json.message || res.status));
      }
    } catch (err) {
      console.error('Failed to save profile', err);
      alert('Error saving profile');
    } finally {
      setSaving(false);
    }
  }

  const handleAddStudent = async (studentId) => {
    try {
      setAddingId(studentId);
      const res = await authFetch(`${API_BASE}/api/user/addStudent`, {
        method: 'POST',
        body: JSON.stringify({ studentId })
      });
      const json = await res.json();
      if (res.ok) {
        await fetchRoster();
        await runSearch(searchQuery);
      } else {
        alert(json.message || 'Could not add student');
      }
    } catch (err) {
      console.error('Failed to add student', err);
    } finally {
      setAddingId(null);
    }
  }

  const handleRemoveStudent = async (studentId) => {
    try {
      await authFetch(`${API_BASE}/api/user/unlink`, {
        method: 'POST',
        body: JSON.stringify({ studentId })
      });
      await fetchRoster();
      await runSearch(searchQuery);
    } catch (err) {
      console.error('Failed to remove student', err);
    }
  }

  const handleLinkTeacher = async () => {
    if (!teacherCode.trim()) return;
    try {
      setLinking(true);
      setLinkMessage('');
      const res = await authFetch(`${API_BASE}/api/user/linkByCode`, {
        method: 'POST',
        body: JSON.stringify({ code: teacherCode.trim() })
      });
      const json = await res.json();
      if (res.ok) {
        setTeacherCode('');
        await fetchMyTeacher();
      } else {
        setLinkMessage(json.message || 'Could not link that code');
      }
    } catch (err) {
      console.error('Failed to link teacher', err);
      setLinkMessage('Error linking account');
    } finally {
      setLinking(false);
    }
  }

  const handleRemoveTeacher = async () => {
    try {
      await authFetch(`${API_BASE}/api/user/unlink`, { method: 'POST' });
      setMyTeacher(null);
    } catch (err) {
      console.error('Failed to remove teacher', err);
    }
  }

  const initials = (user.name || user.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('');

  const roleIsUnsaved = role !== savedRole;

  return (
    <>
      <Header />

      <main style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 'calc(var(--header-height, 112px) + 2rem)',
        paddingBottom: '3rem',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex',
          gap: '2rem',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          width: '100%',
          maxWidth: '1100px',
          justifyContent: 'center',
          padding: '0 1rem',
        }}>
          {/* Profile panel */}
          <div style={{ ...panelStyle, padding: '3rem 2rem 2.25rem', textAlign: 'center', position: 'relative' }}>
            <img
              src={talkyRocket}
              alt="Talky Rocket"
              style={{
                width: '34px',
                position: 'absolute',
                top: '1.1rem',
                right: '1.5rem',
                transform: 'rotate(-25deg)',
                transformOrigin: '50% 50%',
                opacity: 0.9,
              }}
            />

            <div style={{ position: 'relative', width: '132px', height: '132px', margin: '0 auto 1.25rem auto' }}>
              <div
                className="talky-orbit-ring"
                style={{
                  position: 'absolute', inset: '-10px', borderRadius: '50%',
                  border: '1.5px dashed rgba(245, 169, 98, 0.45)',
                  animation: 'talky-orbit-spin 18s linear infinite',
                }}
              />
              <div
                className="talky-orbit-ring"
                style={{
                  position: 'absolute', top: '-4px', left: '50%',
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: '#4ade80',
                  boxShadow: '0 0 8px rgba(74, 222, 128, 0.8)',
                  transformOrigin: '4px 70px',
                  animation: 'talky-orbit-spin 18s linear infinite',
                }}
              />
              {user.picture && !imgError ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  onError={() => setImgError(true)}
                  style={{
                    borderRadius: '50%', width: '112px', height: '112px',
                    objectFit: 'cover', position: 'absolute', top: '10px', left: '10px',
                  }}
                />
              ) : (
                <div style={{
                  borderRadius: '50%', width: '112px', height: '112px',
                  position: 'absolute', top: '10px', left: '10px',
                  background: 'linear-gradient(135deg, #f5a962, #ef7a5f)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.2rem', fontWeight: 700, color: '#0a0d1f',
                }}>
                  {initials}
                </div>
              )}
            </div>

            <h2 style={{ marginBottom: '0.35rem', fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9' }}>
              {user.name}
            </h2>
            <p style={{ color: '#8b91ad', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{user.email}</p>
            {savedRole === 'Teacher' && connectCode && (
              <p style={{ color: '#6b7194', fontSize: '0.8rem', marginBottom: '1.75rem', letterSpacing: '0.05em' }}>
                Your connect code (share with students): <strong style={{ color: '#f5a962' }}>{connectCode}</strong>
              </p>
            )}
            {savedRole !== 'Teacher' && <div style={{ marginBottom: '1.5rem' }} />}

            <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
              <label style={labelStyle}>Nickname</label>
              <input
                className="talky-profile-input"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ ...inputStyle, width: '100%', marginBottom: '1.1rem' }}
              />

              <label style={labelStyle}>Age</label>
              <input
                className="talky-profile-input"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                style={{ ...inputStyle, width: '100%', marginBottom: '1.1rem' }}
              />

              <label style={labelStyle}>Role</label>
              <select
                className="talky-profile-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ ...inputStyle, width: '100%', marginBottom: roleIsUnsaved ? '0.5rem' : '1.5rem', cursor: 'pointer' }}
              >
                <option style={{ backgroundColor: '#171c3a' }}>Student</option>
                <option style={{ backgroundColor: '#171c3a' }}>Teacher</option>
              </select>
              {roleIsUnsaved && (
                <p style={{ color: '#f5a962', fontSize: '0.78rem', marginBottom: '1rem' }}>
                  Save to switch to {role} — the roster/search tools below reflect your saved role until then.
                </p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="talky-save-btn"
              style={{
                width: '100%', padding: '0.75rem', backgroundColor: '#f5a962',
                color: '#0a0d1f', border: 'none', borderRadius: '0.6rem',
                fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Roster / linked-teacher panel — keyed off savedRole, the
              server-confirmed role, not the (possibly unsaved) dropdown. */}
          <div style={{ ...panelStyle, textAlign: 'left' }}>
            {savedRole === 'Teacher' ? (
              <>
                <h3 style={{ color: '#f1f5f9', fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.1rem' }}>
                  My Students
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {students.length === 0 ? (
                    <p style={{ color: '#6b7194', fontSize: '0.9rem' }}>
                      No students yet — search below to add some.
                    </p>
                  ) : students.map((s) => (
                    <div key={s.userId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.75rem 0.9rem', borderRadius: '0.6rem',
                      backgroundColor: '#171c3a', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div>
                        <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.95rem' }}>
                          {s.nickname || s.name || 'Unnamed'}
                        </div>
                        <div style={{ color: '#8b91ad', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                          {s.age ? `Age ${s.age} · ` : ''}
                          {s.overallScore !== null ? `${Math.round(s.overallScore * 100)}% avg` : 'No attempts yet'}
                          {` · ${s.lessonsDone} lesson${s.lessonsDone === 1 ? '' : 's'} done`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveStudent(s.userId)}
                        className="talky-remove-btn"
                        style={{
                          background: 'none', border: 'none', color: '#6b7194',
                          fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem 0.5rem',
                        }}
                        aria-label={`Remove ${s.nickname || s.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <label style={labelStyle}>Find students</label>
                  <input
                    className="talky-profile-input"
                    type="text"
                    placeholder="Search by name or nickname..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ ...inputStyle, width: '100%', marginBottom: '0.9rem' }}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '220px', overflowY: 'auto' }}>
                    {searching && (
                      <p style={{ color: '#6b7194', fontSize: '0.85rem' }}>Searching...</p>
                    )}
                    {!searching && searchResults.length === 0 && (
                      <p style={{ color: '#6b7194', fontSize: '0.85rem' }}>No students found.</p>
                    )}
                    {!searching && searchResults.map((s) => (
                      <div key={s.userId} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.8rem', borderRadius: '0.5rem',
                        backgroundColor: '#12162e', border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{ color: '#dfe3f5', fontSize: '0.88rem' }}>
                          {s.nickname || s.name || 'Unnamed'}
                          {s.age ? <span style={{ color: '#6b7194' }}> · Age {s.age}</span> : null}
                        </div>
                        {s.inMyRoster ? (
                          <span style={{ color: '#4ade80', fontSize: '0.78rem', fontWeight: 600 }}>Added</span>
                        ) : s.hasOtherTeacher ? (
                          <span style={{ color: '#6b7194', fontSize: '0.78rem' }}>Has a teacher</span>
                        ) : (
                          <button
                            onClick={() => handleAddStudent(s.userId)}
                            disabled={addingId === s.userId}
                            className="talky-add-btn"
                            style={{ ...smallActionBtnStyle, padding: '0.3rem 0.8rem', fontSize: '0.78rem', cursor: addingId === s.userId ? 'default' : 'pointer' }}
                          >
                            {addingId === s.userId ? 'Adding...' : 'Add'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ color: '#f1f5f9', fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                  My Teacher
                </h3>

                {myTeacher ? (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.9rem 1rem', borderRadius: '0.6rem',
                    backgroundColor: '#171c3a', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.95rem' }}>
                      {myTeacher.nickname || myTeacher.name || 'Unnamed'}
                    </div>
                    <button
                      onClick={handleRemoveTeacher}
                      className="talky-remove-btn"
                      style={{
                        background: 'none', border: 'none', color: '#6b7194',
                        fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <label style={labelStyle}>Teacher's connect code</label>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <input
                        className="talky-profile-input"
                        type="text"
                        placeholder="e.g. K3F9QZ"
                        value={teacherCode}
                        onChange={(e) => setTeacherCode(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleLinkTeacher}
                        disabled={linking || !teacherCode.trim()}
                        className="talky-link-btn"
                        style={{ ...smallActionBtnStyle, cursor: linking ? 'default' : 'pointer' }}
                      >
                        {linking ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                    {linkMessage && (
                      <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.75rem' }}>{linkMessage}</p>
                    )}
                    <p style={{ color: '#6b7194', fontSize: '0.85rem', marginTop: '1rem' }}>
                      Ask your teacher for their connect code to link your progress to their roster.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default Profile;