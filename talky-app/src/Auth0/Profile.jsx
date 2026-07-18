import React, { useEffect, useState } from 'react'

import Header from '../Header/Header';
import talkyRocket from '../assets/logo.png';
import { useAuth0 } from '@auth0/auth0-react';

// One-time style injection for things inline styles can't express
// (focus rings, hover states, the orbit keyframe). Matches the dark
// space theme used on Statistics (dark panels, orange accent from the
// mastery bars, green accent from the activity heatmap).
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
    .talky-save-btn {
      transition: background-color 0.15s ease, transform 0.1s ease;
    }
    .talky-save-btn:hover:not(:disabled) {
      background-color: #f7b87d !important;
    }
    .talky-save-btn:active:not(:disabled) {
      transform: translateY(1px);
    }
    .talky-save-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    @media (prefers-reduced-motion: reduce) {
      .talky-orbit-ring { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

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

  const [nickname, setNickname] = useState(null);
  const [age, setAge] = useState(null);
  const [role, setRole] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    async function syncProfile() {
      if (!isAuthenticated || !user) return;

      try {
        const profileRes = await authFetch(`${API_BASE}/api/getUserProfile`);
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setNickname(profile.nickname ?? profile.name ?? '');
          setAge(String(profile.age ?? 16));
          setRole(profile.role ?? 'Student');
        } else {
          console.warn('Failed to fetch profile from server', profileRes.status);
          setNickname(user.nickname ?? '');
          setAge(String(16));
          setRole('Student');
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
        setNickname(user.nickname ?? '');
        setAge(String(16));
        setRole('Student');
      } finally {
        setProfileLoaded(true);
      }
    }

    syncProfile();
  }, [isAuthenticated, isLoading, user]);

  if (isLoading) return <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Loading profile...</p>;
  if (!isAuthenticated) return <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Please log in to view your profile, statistics, and more.</p>;
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
      const profileRes = await authFetch(`${API_BASE}/api/getUserProfile`);
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setNickname(profile.nickname ?? profile.name ?? '');
        setAge(String(profile.age ?? 16));
        setRole(profile.role ?? 'Student');
      }
      setSaving(false);
      if (res.ok) {
        alert('Profile saved');
      } else {
        alert('Failed to save profile: ' + (json.message || res.status));
      }
    } catch (err) {
      setSaving(false);
      console.error('Failed to save profile', err);
      alert('Error saving profile');
    }
  }

  const initials = (user.name || user.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('');

  const inputStyle = {
    width: '100%',
    padding: '0.65rem 0.8rem',
    borderRadius: '0.6rem',
    border: '1px solid rgba(255,255,255,0.12)',
    marginBottom: '1.1rem',
    backgroundColor: '#171c3a',
    color: '#f1f5f9',
    fontSize: '0.95rem',
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

  return (
    <>
      <Header />

      <main style={{
        display: 'flex',
        justifyContent: 'center',
        // Header is fixed/overlapping content — give the panel real
        // clearance instead of the 3rem margin that let the avatar and
        // rocket logo sit underneath it.
        paddingTop: '7rem',
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
          <div
            style={{
              borderRadius: '1.25rem',
              padding: '3rem 2rem 2.25rem',
              width: '100%',
              maxWidth: '480px',
              backgroundColor: 'rgba(19, 23, 46, 0.75)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* Small rocket for branding */}
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

            {/* Avatar with orbit ring */}
            <div style={{
              position: 'relative',
              width: '132px',
              height: '132px',
              margin: '0 auto 1.25rem auto',
            }}>
              <div
                className="talky-orbit-ring"
                style={{
                  position: 'absolute',
                  inset: '-10px',
                  borderRadius: '50%',
                  border: '1.5px dashed rgba(245, 169, 98, 0.45)',
                  animation: 'talky-orbit-spin 18s linear infinite',
                }}
              />
              <div
                className="talky-orbit-ring"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '50%',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
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
                    borderRadius: '50%',
                    width: '112px',
                    height: '112px',
                    objectFit: 'cover',
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                  }}
                />
              ) : (
                <div style={{
                  borderRadius: '50%',
                  width: '112px',
                  height: '112px',
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  background: 'linear-gradient(135deg, #f5a962, #ef7a5f)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.2rem',
                  fontWeight: 700,
                  color: '#0a0d1f',
                }}>
                  {initials}
                </div>
              )}
            </div>

            {/* Name and email */}
            <h2 style={{ marginBottom: '0.35rem', fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9' }}>
              {user.name}
            </h2>
            <p style={{ color: '#8b91ad', fontSize: '0.95rem', marginBottom: '2rem' }}>{user.email}</p>

            {/* Editable fields */}
            <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
              <label style={labelStyle}>Nickname</label>
              <input
                className="talky-profile-input"
                type="text"
                value={nickname === null ? '' : nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={inputStyle}
              />

              <label style={labelStyle}>Age</label>
              <input
                className="talky-profile-input"
                type="number"
                value={age === null ? '' : age}
                onChange={(e) => setAge(e.target.value)}
                style={inputStyle}
              />

              <label style={labelStyle}>Role</label>
              <select
                className="talky-profile-input"
                value={role === null ? '' : role}
                onChange={(e) => setRole(e.target.value)}
                style={{ ...inputStyle, marginBottom: '1.5rem', cursor: 'pointer' }}
              >
                <option style={{ backgroundColor: '#171c3a' }}>Student</option>
                <option style={{ backgroundColor: '#171c3a' }}>Teacher</option>
              </select>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="talky-save-btn"
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#f5a962',
                color: '#0a0d1f',
                border: 'none',
                borderRadius: '0.6rem',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export default Profile;