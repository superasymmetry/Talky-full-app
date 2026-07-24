import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';
import Card from '../Card.jsx';
import { speakText, stopSpeech } from '../tts.js';
import { categories } from './SoundBank.jsx';

const toTitleCase = (str) =>
  typeof str === 'string'
    ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : str;

const panelStyle = {
  borderRadius: '1.25rem',
  backgroundColor: 'rgba(19, 23, 46, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  boxSizing: 'border-box',
};

const pillButtonStyle = {
  padding: '0.55rem 1.1rem',
  borderRadius: '0.6rem',
  border: 'none',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease, transform 0.1s ease',
};

const getMasteredWords = (id) => {
  try {
    const raw = localStorage.getItem(`talky:mastered:${id}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setMasteredWords = (id, words) => {
  try {
    localStorage.setItem(`talky:mastered:${id}`, JSON.stringify(words));
  } catch {
    // localStorage unavailable (private browsing, etc) — fail silently,
    // mastery just won't persist across sessions.
  }
};

function SoundBank({
  tiles,
  highlightedIndex,
  selectedIndex,
  setHighlightedIndex,
  setSelectedIndex,
  isRandomizing,
  isLoading,
  masteredSet,
  toggleMastered,
  hideMastered,
  slowMode,
}) {
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 };

  const speakWord = (word) => {
    if (!word) return;
    stopSpeech();

    speakText(word, {
      rate: slowMode ? 0.65 : 1,
      onEnd: () => {
        setSelectedIndex(null);
        setHighlightedIndex(null);
      }
    }).catch((err) => {
      console.warn('TTS failed', err);
      setSelectedIndex(null);
      setHighlightedIndex(null);
    });
  };

  const visibleTiles = hideMastered
    ? tiles.filter((t) => !t.word || !masteredSet.has(t.word))
    : tiles;

  // Always render 16 slots regardless of how many real tiles came back
  // (previously this could throw if the API ever returned >16 words).
  const displayTiles = Array.from({ length: 16 }, (_, i) => visibleTiles[i] || { word: '', emoji: '' });

  return (
    <div className="grid grid-cols-4 gap-6">
      {displayTiles.map((tile, index) => {
        const isHighlighted = highlightedIndex === index;
        const isSelected = selectedIndex === index;
        const isMastered = tile.word && masteredSet.has(tile.word);
        const isDisabled = isRandomizing || isLoading || !tile.word;

        const activate = () => {
          speakWord(tile.word);
          setSelectedIndex(index);
          setHighlightedIndex(index);
        };

        return (
          <div key={index} className="relative">
            {/* highlight ring */}
            <div
              className={`absolute inset-0 rounded-xl pointer-events-none transition-all duration-150
                ${isHighlighted ? `
                  ring-8 ring-yellow-400
                  shadow-lg shadow-yellow-400/70
                  hover:shadow-orange-400/70
                  animate-pulse
                ` : ""}
                ${isSelected ? "ring-4 ring-pink-400 shadow-pink-400/70" : ""}
                ${isMastered && !isHighlighted && !isSelected ? "ring-2 ring-[#f5a962]" : ""}`}
            ></div>

            {/* loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-20 rounded-xl flex items-center justify-center bg-black/15 text-white text-2xl font-bold animate-pulse pointer-events-none">
                ...
              </div>
            )}

            {/* mastery star toggle */}
            {tile.word && !isLoading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMastered(tile.word);
                }}
                aria-label={isMastered ? `Unmark ${tile.word} as mastered` : `Mark ${tile.word} as mastered`}
                className="absolute z-30"
                style={{
                  top: '0.35rem',
                  right: '0.35rem',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  filter: isMastered ? 'none' : 'grayscale(1) opacity(0.55)',
                }}
              >
                ⭐
              </button>
            )}

            <Card
              id={`pad-${index}`}
              dark
              disabled={isDisabled}
              onActivate={activate}
              name={tile.word ? toTitleCase(tile.word) : null}
              content={tile.emoji || null}
              options={tiltOptions}
              noNavigate={true}
              isLoading={isLoading}
              aria-label={tile.word ? `Play ${tile.word}` : undefined}
              className="relative z-10 w-full h-38 flex flex-col items-center justify-center"
            />
          </div>
        );
      })}
    </div>
  );
}

export default function SoundBankCategory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);
  const [masteredWords, setMasteredWordsState] = useState(() => getMasteredWords(id));
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  const meta = categories.find((c) => c.id === id);
  const masteredSet = useMemo(() => new Set(masteredWords), [masteredWords]);

  const toggleMastered = useCallback((word) => {
    setMasteredWordsState((prev) => {
      const next = prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word];
      setMasteredWords(id, next);
      return next;
    });
  }, [id]);

  const refreshWords = useCallback(async (signal) => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`${API_BASE}/api/wordbank?category=${id}`, { signal });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      // Convert to {word, emoji} structure
      const wordsArray = Object.values(parsedData).map(w => ({
        word: toTitleCase(w.word || w), // fallback in case API just returns word
        emoji: w.emoji || '' // assumes Groq API returns emoji field
      }));
      setWords(wordsArray);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load words:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, id]);

  useEffect(() => {
    const ac = new AbortController();
    setHighlightedIndex(null);
    setSelectedIndex(null);
    setWords([]);
    setMasteredWordsState(getMasteredWords(id));
    setIsLoading(true);
    refreshWords(ac.signal);
    return () => {
      ac.abort();
      stopSpeech();
    };
  }, [id, refreshWords]);

  const handleRefresh = () => {
    setHighlightedIndex(null);
    setSelectedIndex(null);
    refreshWords();
  };

  const handleRandomize = () => {
    if (!words.length || isLoading) return;
    setIsRandomizing(true);
    let iterations = 0;
    const totalIterations = 30 + Math.floor(Math.random() * 20);
    let delay = 50;

    const spin = () => {
      const nextIndex = Math.floor(Math.random() * words.length);
      setHighlightedIndex(nextIndex);
      iterations++;
      if (iterations < totalIterations) {
        delay *= 1.05;
        setTimeout(spin, delay);
      } else {
        setSelectedIndex(nextIndex);
        setIsRandomizing(false);
      }
    };

    spin();
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-page" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
        <Header />
        <main className="max-w-7xl mx-auto" style={{ overflow: 'hidden', transform: 'scale(0.9)', padding: '45px', paddingTop: 'calc(var(--header-height, 112px) + 2rem)', paddingBottom: '2rem' }}>
          <div style={{ ...panelStyle, padding: '2.25rem 2rem', textAlign: 'center', maxWidth: '420px' }}>
            <p style={{ color: '#f1f5f9', marginBottom: '1.25rem' }}>
              Couldn't load these words — check your connection and try again.
            </p>
            <button
              onClick={handleRefresh}
              style={{ ...pillButtonStyle, backgroundColor: '#f5a962', color: '#0a0d1f' }}
            >
              Retry
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <Header />
      <main className="max-w-7xl mx-auto" style={{ overflow: 'hidden', transform: 'scale(0.9)', padding: '45px', paddingBottom: '2rem' }}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <button onClick={() => navigate('/soundbank')} className="text-2xl font-bold" style={{ color: '#f5a962' }}>❮</button>
          <h2
            className="text-3xl font-extrabold tracking-wider"
            style={{ color: '#f1f5f9', textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
          >
            {meta ? `${meta.icon} ${meta.name}` : (id || '').replace(/-/g, ' ').toUpperCase()}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              style={{ ...pillButtonStyle, backgroundColor: '#171c3a', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {isLoading ? 'Loading...' : 'Refresh words'}
            </button>
            <button
              onClick={handleRandomize}
              disabled={isRandomizing || isLoading || !words.length}
              style={{ ...pillButtonStyle, backgroundColor: '#f5a962', color: '#0a0d1f', opacity: (isRandomizing || isLoading || !words.length) ? 0.5 : 1 }}
            >
              Surprise Me
            </button>
          </div>
        </div>

        {meta?.description && (
          <p style={{ color: '#8b91ad', fontSize: '0.9rem', marginBottom: '1.25rem' }}>{meta.description}</p>
        )}

        <div className="flex items-center gap-5 mb-6 flex-wrap" style={{ fontSize: '0.85rem', color: '#c3c9e0' }}>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={slowMode}
              onChange={(e) => setSlowMode(e.target.checked)}
            />
            🐢 Speak slowly
          </label>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hideMastered}
              onChange={(e) => setHideMastered(e.target.checked)}
            />
            Hide mastered words
          </label>
          {masteredWords.length > 0 && (
            <span style={{ color: '#f5a962', fontWeight: 700 }}>⭐ {masteredWords.length} mastered</span>
          )}
        </div>

        <SoundBank
          tiles={words}
          highlightedIndex={highlightedIndex}
          selectedIndex={selectedIndex}
          setHighlightedIndex={setHighlightedIndex}
          setSelectedIndex={setSelectedIndex}
          isRandomizing={isRandomizing}
          isLoading={isLoading}
          masteredSet={masteredSet}
          toggleMastered={toggleMastered}
          hideMastered={hideMastered}
          slowMode={slowMode}
        />
      </main>
      <Footer />
    </div>
  );
}