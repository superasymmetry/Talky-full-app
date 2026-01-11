import { useState } from 'react';

export default function Back() {
  const [homeHover, setHomeHover] = useState(false);

  return (
    <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 30 }}>
      <button
        onMouseEnter={() => setHomeHover(true)}
        onMouseLeave={() => setHomeHover(false)}
        onClick={() => window.location.href = '/app'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderRadius: 20,
          border: 'none',
          background: homeHover
            ? 'linear-gradient(90deg, #ff8a00 0%, #e52e71 100%)'
            : 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: homeHover ? '0 10px 30px rgba(229,46,113,0.35)' : '0 8px 24px rgba(107,115,255,0.18)',
          transform: homeHover ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 180ms ease',
          backdropFilter: 'blur(6px)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 19l-7-7 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Home
      </button>
    </div>
  );
}
