import '../Statistics/Statistics.css';

import React, { useEffect, useMemo, useState } from 'react';
import { speakText, stopSpeech } from '../tts.js';

import Header from '../Header/Header';
import { useNavigate } from 'react-router-dom';

const defaultVoiceOptions = [
  { key: 'adam', name: 'Adam' },
  { key: 'brian', name: 'Brian' },
  { key: 'charlie', name: 'Charlie' },
  { key: 'sarah', name: 'Sarah' },
  { key: 'bella', name: 'Bella' },
  { key: 'liam', name: 'Liam' }
];

const previewText = 'Let’s practice some sounds together.';

const savedKey = 'ttsVoiceKey';

const tileVars = (active) => ({
  '--cut-fill': '#252134',
  '--cut-edge': active ? '#AC6AFF' : 'rgba(255,255,255,0.1)',
});

const btn = 'cut-chip px-4 py-2 caption font-semibold transition-colors disabled:opacity-50';
const primaryBtn = `${btn} bg-color-1 text-n-8 hover:bg-color-1/80`;
const ghostBtn = `${btn} bg-n-6 text-n-3 border border-n-1/10 hover:text-n-1`;

export default function VoiceSettings({ embed = false }) {
  const navigate = useNavigate();
  const [voiceOptions, setVoiceOptions] = useState(defaultVoiceOptions);
  const [selectedVoiceKey, setSelectedVoiceKey] = useState(() => {
    const saved = localStorage.getItem(savedKey);
    return saved || defaultVoiceOptions[0].key;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadVoiceOptions = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/tts/voices`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const voices = Array.isArray(data.voices) && data.voices.length ? data.voices : defaultVoiceOptions;
        setVoiceOptions(voices);

        const savedVoiceKey = localStorage.getItem(savedKey);
        const nextSelected = savedVoiceKey && voices.some((option) => option.key === savedVoiceKey)
          ? savedVoiceKey
          : voices[0].key;

        setSelectedVoiceKey(nextSelected);
        localStorage.setItem(savedKey, nextSelected);
        setLoadError('');
      } catch {
        if (cancelled) return;

        setVoiceOptions(defaultVoiceOptions);
        const savedVoiceKey = localStorage.getItem(savedKey);
        const nextSelected = savedVoiceKey && defaultVoiceOptions.some((option) => option.key === savedVoiceKey)
          ? savedVoiceKey
          : defaultVoiceOptions[0].key;
        setSelectedVoiceKey(nextSelected);
        localStorage.setItem(savedKey, nextSelected);
        setLoadError('Using built-in voice presets because the backend voice list could not be loaded.');
      } finally {
        if (!cancelled) {
          setIsLoadingVoices(false);
        }
      }
    };

    loadVoiceOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(savedKey, selectedVoiceKey);
  }, [selectedVoiceKey]);

  const selectedVoice = useMemo(
    () => voiceOptions.find((option) => option.key === selectedVoiceKey) || voiceOptions[0],
    [selectedVoiceKey, voiceOptions]
  );

  const preview = async (text, voiceKey) => {
    stopSpeech();
    setIsSpeaking(true);
    try {
      await speakText(text, {
        voiceKey,
        onEnd: () => setIsSpeaking(false)
      });
    } catch (err) {
      setIsSpeaking(false);
      console.warn('TTS preview failed', err);
    }
  };

  const saveSelection = async () => {
    await preview(previewText, selectedVoice.key);
  };

  const resetSelection = () => {
    stopSpeech();
    setIsSpeaking(false);
    setSelectedVoiceKey(voiceOptions[0].key);
    localStorage.removeItem(savedKey);
  };

  const content = (
    <section className="cut-card w-full max-w-[900px] mx-auto p-5 lg:p-6 flex flex-col gap-4">
      <h3 className="h6 text-n-1 m-0">{embed ? 'Voice Preview' : 'Voice Settings'}</h3>

      {loadError && <p className="caption text-color-2">{loadError}</p>}
      {isLoadingVoices && <p className="caption text-n-4">Loading voice options…</p>}

      <div>
        <div className="grid gap-3 sm:grid-cols-2">
          {voiceOptions.map((voice) => {
            const active = selectedVoiceKey === voice.key;

            return (
              <button
                key={voice.key}
                type="button"
                onClick={() => setSelectedVoiceKey(voice.key)}
                style={tileVars(active)}
                className="cut-card p-3 text-left flex items-center justify-between gap-3"
              >
                <span className="font-semibold text-n-1">{voice.name}</span>
                <span className={`caption font-semibold shrink-0 ${active ? 'text-color-4' : 'text-n-4'}`}>
                  {active ? 'Selected' : 'Use'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 justify-end flex-wrap">
        <button onClick={saveSelection} disabled={isSpeaking} className={primaryBtn}>
          {isSpeaking ? 'Previewing…' : 'Preview'}
        </button>
        <button
          onClick={() => {
            stopSpeech();
            setIsSpeaking(false);
          }}
          className={ghostBtn}
        >
          Stop
        </button>
        <button onClick={resetSelection} className={ghostBtn}>
          Reset
        </button>
      </div>
    </section>
  );

  if (embed) {
    return content;
  }

  return (
    <div className="bg-n-8 text-n-1" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <Header />
      <main
        className="max-w-[900px] mx-auto px-5 pb-10"
        style={{ paddingTop: 'calc(var(--header-height, 112px) + 1rem)' }}
      >
        <header className="flex items-baseline gap-4 mb-3">
          <button onClick={() => navigate(-1)} className="caption text-n-3 hover:text-n-1">
            ← Back
          </button>
          <h1 className="h5 m-0 text-n-1">Voice Settings</h1>
        </header>

        {content}
      </main>
    </div>
  );
}
