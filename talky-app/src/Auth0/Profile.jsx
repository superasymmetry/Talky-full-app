import React, { useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react';
import Header from '../Header/Header';
import talkyRocket from '../assets/logo.png';

const Profile = () => {
  const { user, isAuthenticated, isLoading } = useAuth0();

  // Temporary state for editable fields — start as null so we can show a loading state
  const [nickname, setNickname] = useState(null);
  const [age, setAge] = useState(null);
  const [role, setRole] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // When user logs in, ensure they exist in the app DB then fetch server profile
    async function ensureUserInDbAndSync() {
      if (!isAuthenticated || !user) return;

      const userId = user.sub || user.email;
      const payload = {
        userId,
        name: user.name || user.nickname || user.email || 'Unnamed',
        // Do not rely on local state defaults here; server will be authoritative.
        age: parseInt(age, 10) || undefined,
        nickname: nickname ?? user.nickname ?? "",
        role: role ?? "Student"
      };

      try {
        // create/upsert
        await fetch('http://localhost:8080/api/createUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // fetch authoritative profile from server and sync local state
        const profileRes = await fetch(`http://localhost:8080/api/getUserProfile?userId=${encodeURIComponent(userId)}`);
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setNickname(profile.nickname ?? profile.name ?? '');
          setAge(String(profile.age ?? 16));
          setRole(profile.role ?? 'Student');
          setProfileLoaded(true);
        } else {
          console.warn('Failed to fetch profile from server', profileRes.status);
          // still mark loaded so UI won't hang indefinitely
          setNickname(user.nickname ?? '');
          setAge(String(16));
          setRole('Student');
          setProfileLoaded(true);
        }
      } catch (err) {
        console.error('Failed to create/confirm user or fetch profile', err);
        // fallback to some sensible defaults
        setNickname(user.nickname ?? '');
        setAge(String(16));
        setRole('Student');
        setProfileLoaded(true);
      }
    }

    ensureUserInDbAndSync();
  }, [isAuthenticated, isLoading, user]);

  if (isLoading) return <p>Loading profile...</p>;
  if (!isAuthenticated) return <p>Please log in to view your profile.</p>;
  if (!profileLoaded) return <p>Loading profile...</p>;

  const handleSave = async () => {
    const payload = {
      userId: user.sub || user.email,
      nickname,
      age: parseInt(age, 10) || 16,
      role
    };

    try {
      setSaving(true);
      const res = await fetch('http://localhost:8080/api/updateUserProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      console.log('updateUserProfile', res.status, json);
      // re-fetch authoritative profile so UI always matches DB
      const userId = user.sub || user.email;
      const profileRes = await fetch(`http://localhost:8080/api/getUserProfile?userId=${encodeURIComponent(userId)}`);
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

  return (
    <>
      <Header />

      <main style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
        <div
          style={{
            borderRadius: '1.5rem',
            padding: '3rem 2rem',
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 12px 30px rgba(0,120,255,0.4)',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Small rocket for branding */}
          <img 
            src={talkyRocket} 
            alt="Talky Rocket" 
            style={{
              width: '40px',
              position: 'absolute',
              top: '1rem',
              right: '1.8rem',
              transform: 'rotate(-25deg)',  
              transformOrigin: '50% 50%',   
            }}
          />

          {/* Profile picture */}
          <img
            src={user.picture}
            alt={user.name}
            style={{
              borderRadius: '50%',
              width: '140px',
              height: '140px',
              objectFit: 'cover',
              margin: '0 auto 1rem auto',
              display: 'block'
            }}
          />

          {/* Name and email */}
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            {user.name}
          </h2>
          <p style={{ color: '#475569', fontSize: '1rem', marginBottom: '1.5rem' }}>{user.email}</p>

          {/* Editable fields */}
          <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Nickname:</label>
            <input
              type="text"
              value={nickname === null ? '' : nickname}
              onChange={(e) => setNickname(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            />

            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Age:</label>
            <input
              type="number"
              value={age === null ? '' : age}
              onChange={(e) => setAge(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            />

            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Role:</label>
            <select
              value={role === null ? '' : role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            >
              <option>Student</option>
              <option>Teacher</option>
            </select>
          </div>

          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </main>
    </>
  );
}

export default Profile;