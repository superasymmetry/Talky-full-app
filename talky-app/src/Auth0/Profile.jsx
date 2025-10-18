import React, { useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react';
import Header from '../Header/Header';
import talkyRocket from '../assets/logo.png';

const Profile = () => {
  const { user, isAuthenticated, isLoading } = useAuth0();

  // Temporary state for editable fields
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [age, setAge] = useState('16'); // default value
  const [role, setRole] = useState('Student');

  useEffect(() => {
    // When user logs in, ensure they exist in the app DB
    async function ensureUserInDb() {
      if (!isAuthenticated || !user) return;

      const payload = {
        userId: user.sub || user.email, // use Auth0 sub (or fallback to email)
        name: user.name || user.nickname || user.email || 'Unnamed',
        age: parseInt(age, 10) || 16
      };

      try {
        const res = await fetch('http://localhost:8080/api/createUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        console.log('createUser response:', res.status, json);
      } catch (err) {
        console.error('Failed to create/confirm user on server', err);
      }
    }

    ensureUserInDb();
  }, [isAuthenticated, isLoading, user, age]);

  if (isLoading) return <p>Loading profile...</p>;
  if (!isAuthenticated) return <p>Please log in to view your profile.</p>;

  const handleSave = () => {
    console.log({ nickname, age, role });
    alert('Profile updated!');
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
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            />

            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Age:</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            />

            <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Role:</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', marginBottom: '0.75rem' }}
            >
              <option>Student</option>
              <option>Teacher</option>
            </select>
          </div>

          <button 
            onClick={handleSave} 
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