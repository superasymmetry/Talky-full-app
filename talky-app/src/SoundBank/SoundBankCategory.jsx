import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';
import Card from '../Card.jsx';

const toTitleCase = (str) =>
  typeof str === 'string'
    ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : str;

function SoundBank({
  tiles,
  highlightedIndex,
  selectedIndex,
  setHighlightedIndex,
  setSelectedIndex,
  isRandomizing,
  isLoading
}) {
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 };

  const speakWord = (word) => {
    if (!window.speechSynthesis || !word) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    // kid-friendly defaults
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1.2;

    // prefer saved voice name, then common female candidates, then first available
    const savedVoiceName = localStorage.getItem('ttsVoice'); // name string or null
    const voices = window.speechSynthesis.getVoices() || [];
    let chosen =
      (savedVoiceName && voices.find((v) => v.name === savedVoiceName)) ||
      voices.find((v) => (v.lang || '').startsWith('en') && /female|woman|girl/i.test(v.name)) ||
      voices.find((v) => (v.lang || '').startsWith('en')) ||
      voices[0];

    if (chosen) utterance.voice = chosen;

    utterance.onend = () => {
      setSelectedIndex(null);
      setHighlightedIndex(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Ensure 16 tiles
  const displayTiles = tiles.length
    ? tiles.concat(Array(16 - tiles.length).fill({ word: '', emoji: '' }))
    : Array(16).fill({ word: '', emoji: '' });

  return (
    <div className="grid grid-cols-4 gap-6">
      {displayTiles.map((tile, index) => {
        const isHighlighted = highlightedIndex === index;
        const isSelected = selectedIndex === index;

        return (
          <div
            key={index}
            className="relative cursor-pointer"
            onClick={() => {
              if (isRandomizing || isLoading || !tile.word) return;
              speakWord(tile.word);
              setSelectedIndex(index);
              setHighlightedIndex(index);
            }}
          >
            {/* highlight ring */}
            <div
              className={`absolute inset-0 rounded-xl pointer-events-none transition-all duration-150
                ${isHighlighted ? `
                  ring-8 ring-yellow-400
                  shadow-lg shadow-yellow-400/70
                  hover:shadow-orange-400/70
                  animate-pulse
                ` : ""}
                ${isSelected ? "ring-4 ring-pink-400 shadow-pink-400/70" : ""}`}
            ></div>

            {/* loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-20 rounded-xl flex items-center justify-center bg-black/15 text-white text-2xl font-bold animate-pulse pointer-events-none">
                ...
              </div>
            )}

            <Card
              id={`pad-${index}`}
              name={tile.word ? toTitleCase(tile.word) : null}
              content={tile.emoji || null}
              options={tiltOptions}
              noNavigate={true}
              isLoading={isLoading}
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
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';

  const refreshWords = async (signal) => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    setHighlightedIndex(null);
    setSelectedIndex(null);
    setWords([]);
    setIsLoading(true);
    refreshWords(ac.signal);
    return () => ac.abort();
  }, [id]);

  const handleRandomize = () => {
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

  return (
    <div className="min-h-screen bg-page">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/soundbank')} className="text-2xl text-primary font-bold">❮</button>
          <h2 className="text-3xl font-extrabold text-orange-600 tracking-wider">
            {(id || '').replace('-', ' ').toUpperCase()}
          </h2>
          <div className="flex items-center gap-3">
            <button onClick={() => refreshWords()} className="px-4 py-2 bg-primary rounded-lg shadow">
              {isLoading ? 'Loading...' : 'Refresh words'}
            </button>
            <button
              onClick={handleRandomize}
              disabled={isRandomizing}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 disabled:opacity-50"
            >
              Randomize
            </button>
          </div>
        </div>

        <SoundBank
          tiles={words}
          highlightedIndex={highlightedIndex}
          selectedIndex={selectedIndex}
          setHighlightedIndex={setHighlightedIndex}
          setSelectedIndex={setSelectedIndex}
          isRandomizing={isRandomizing}
          isLoading={isLoading}
        />
      </main>
      <Footer />
    </div>
  );
}
