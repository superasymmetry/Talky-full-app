import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../Header/Header.jsx'
import Footer from '../Footer.jsx'
import Card from '../Card.jsx'

const styleId = 'talky-soundbank-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .talky-sb-input {
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .talky-sb-input:focus {
      outline: none;
      border-color: #f5a962 !important;
      box-shadow: 0 0 0 3px rgba(245, 169, 98, 0.18);
    }
    .talky-sb-card {
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .talky-sb-card:hover {
      box-shadow: 0 14px 34px rgba(0,0,0,0.5);
    }
  `;
  document.head.appendChild(style);
}

// Exported so SoundBankCategory can look up name/icon/description by id
// instead of re-deriving them from the url slug.
export const categories = [
  { id: 'l-sounds', icon: '🦁', name: 'L Sounds', description: 'Words like "lion", "leaf", and "lamp"!' },
  { id: 'r-sounds', icon: '🐰', name: 'R Sounds', description: 'Words like "rabbit", "rose", and "rain".' },
  { id: 's-sounds', icon: '☀️', name: 'S Sounds', description: 'Words like "sun", "sand", and "socks".' },
  { id: 'z-sounds', icon: '🦓', name: 'Z Sounds', description: 'Words like "zoo", "zip", and "buzz".' },
  { id: 'th-sounds', icon: '🛁', name: 'TH Sounds', description: 'Words like "think", "bath", and "mother".' },
  { id: 'ch-sounds', icon: '🪑', name: 'CH Sounds', description: 'Words like "children", "chin", and "pinch".' },
  { id: 'sh-sounds', icon: '🐚', name: 'SH Sounds', description: 'Words like "bash", "shadow", and "shift".' },
  { id: 'j-sounds', icon: '🍇', name: 'J Sounds', description: 'Words like "jump", "jar", and "orange".' },
  { id: 'p-sounds', icon: '🐷', name: 'P Sounds', description: 'Words like "pig", "pop", and "puppy".' },
  { id: 'b-sounds', icon: '🎈', name: 'B Sounds', description: 'Words like "ball", "bed", and "bubble".' },
  { id: 't-sounds', icon: '🎩', name: 'T Sounds', description: 'Words like "top", "table", and "cat".' },
  { id: 'd-sounds', icon: '🦆', name: 'D Sounds', description: 'Words like "dog", "duck", and "door".' },
  { id: 'k-sounds', icon: '🔑', name: 'K Sounds', description: 'Words like "cat", "kite", and "cookie".' },
  { id: 'g-sounds', icon: '🎁', name: 'G Sounds', description: 'Words like "goat", "gum", and "wagon".' },
  { id: 'f-sounds', icon: '🐟', name: 'F Sounds', description: 'Words like "fish", "fan", and "leaf".' },
  { id: 'v-sounds', icon: '🎻', name: 'V Sounds', description: 'Words like "van", "vase", and "seven".' },
  { id: 'w-sounds', icon: '🌊', name: 'W Sounds', description: 'Words like "wagon", "window", and "away".' },
  { id: 'y-sounds', icon: '🧶', name: 'Y Sounds', description: 'Words like "yellow", "yarn", and "backyard".' },
  { id: 'h-sounds', icon: '🏠', name: 'H Sounds', description: 'Words like "hat", "hand", and "house".' },
  { id: 'm-sounds', icon: '🌙', name: 'M Sounds', description: 'Words like "moon", "milk", and "hammer".' },
  { id: 'n-sounds', icon: '🥜', name: 'N Sounds', description: 'Words like "nose", "net", and "banana".' },
  { id: 'ng-sounds', icon: '🎵', name: 'NG Sounds', description: 'Words like "ring", "song", and "swing".' },
  { id: 'blends', icon: '🌟', name: 'Blends', description: 'Words like "blue", "green", and "stop".' },
  { id: '1-syllable', icon: '🌽', name: '1 Syllable', description: 'Words like "grass", "corn", and "kite".' },
  { id: '2-syllables', icon: '🚀', name: '2 Syllables', description: 'Words like "pencil", "apple", and "rocket".' },
  { id: '3-syllables', icon: '🦋', name: '3+ Syllables', description: 'Words like "butterfly", "elephant", and "umbrella".' },
]

const panelStyle = {
  borderRadius: '1.25rem',
  backgroundColor: 'rgba(19, 23, 46, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  boxSizing: 'border-box',
};

const inputStyle = {
  padding: '0.6rem 0.9rem',
  borderRadius: '0.6rem',
  border: '1px solid rgba(255,255,255,0.12)',
  backgroundColor: '#171c3a',
  color: '#f1f5f9',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

const getMasteredWords = (id) => {
  try {
    const raw = localStorage.getItem(`talky:mastered:${id}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export default function SoundBank() {
  const navigate = useNavigate()
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 }
  const [query, setQuery] = useState('')
  const [masteredCounts, setMasteredCounts] = useState({})

  // Re-read mastered counts whenever this page is shown, so counts stay
  // fresh if a kid just finished practicing a category and hit "back".
  useEffect(() => {
    const counts = {};
    categories.forEach((cat) => {
      counts[cat.id] = getMasteredWords(cat.id).length;
    });
    setMasteredCounts(counts);
  }, []);

  const totalMastered = useMemo(
    () => Object.values(masteredCounts).reduce((sum, n) => sum + n, 0),
    [masteredCounts]
  );

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-page" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <Header />
      <main className="max-w-7xl mx-auto" style={{ padding: '2rem', paddingTop: 'calc(var(--header-height, 112px) + 2rem)', paddingBottom: '3rem' }}>
        {/* top title row */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/app')}
              className="text-2xl font-bold"
              style={{ color: '#f5a962' }}
              aria-label="Back"
            >
              ❮❮
            </button>
            <h1
              className="text-3xl sm:text-4xl font-extrabold tracking-widest"
              style={{ color: '#f1f5f9', textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
            >
              Super Sound Bank
            </h1>
          </div>

          {totalMastered > 0 && (
            <div
              style={{
                ...panelStyle,
                padding: '0.6rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>⭐</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.95rem' }}>
                {totalMastered} word{totalMastered === 1 ? '' : 's'} mastered
              </span>
            </div>
          )}
        </div>

        {/* search */}
        <div style={{ marginBottom: '2rem', maxWidth: '360px' }}>
          <input
            className="talky-sb-input"
            type="text"
            placeholder="Search categories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
            aria-label="Search categories"
          />
        </div>

        {filteredCategories.length === 0 ? (
          <div style={{ ...panelStyle, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#8b91ad' }}>No categories match "{query}".</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {filteredCategories.map((cat) => {
              const mastered = masteredCounts[cat.id] || 0;
              return (
                <div key={cat.id} className="relative">
                  {mastered > 0 && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        top: '0.6rem',
                        right: '0.6rem',
                        backgroundColor: 'rgba(245, 169, 98, 0.15)',
                        border: '1px solid rgba(245, 169, 98, 0.4)',
                        borderRadius: '999px',
                        padding: '0.15rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#f5a962',
                        zIndex: 20,
                      }}
                    >
                      ⭐ {mastered}
                    </div>
                  )}
                  <Card
                    id={cat.id}
                    dark
                    name={cat.name}
                    content={cat.icon}
                    description={cat.description}
                    to={`/soundbank/${cat.id}`}
                    options={tiltOptions}
                    titleClass="mt-0 text-xl sm:text-2xl font-extrabold tracking-wider text-center text-[#f5a962]"
                    className="w-full h-40 flex flex-col items-center justify-center"
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}