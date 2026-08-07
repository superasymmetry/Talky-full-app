import { useState } from 'react';
// Chamfered corners + the shared card surface, same as the Statistics board.
import '../Statistics/Statistics.css';

export default function Back() {
  const [homeHover, setHomeHover] = useState(false);

  return (
    <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 30 }}>
      <button
        onMouseEnter={() => setHomeHover(true)}
        onMouseLeave={() => setHomeHover(false)}
        onClick={() => window.location.href = '/app'}
        className="cut-chip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          border: 'none',
          background: homeHover ? '#252134' : '#15131D',
          color: homeHover ? '#AC6AFF' : '#FFFFFF',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'background 180ms ease, color 180ms ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Home
      </button>
    </div>
  );
}
