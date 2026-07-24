import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../Header/Header';
import talkyRocket from '../assets/logo.png';
import { speakText, stopSpeech } from '../tts.js';

const defaultVoiceOptions = [
  {
    key: 'adam',
    name: 'Adam',
    description: 'Firm male narration with a bright, direct delivery.',
    sample: 'Let\'s keep going and make the next one better.'
  },
  {
    key: 'brian',
    name: 'Brian',
    description: 'Deep, resonant narration with a calm, comforting tone.',
    sample: 'You are right on track.'
  },
  {
    key: 'charlie',
    name: 'Charlie',
    description: 'Confident male voice with a clear, energetic delivery.',
    sample: 'That sounded strong, let\'s do one more take.'
  },
  {
    key: 'sarah',
    name: 'Sarah',
    description: 'Warm female narration with a reassuring professional tone.',
    sample: 'You\'re doing great, keep going.'
  },
  {
    key: 'bella',
    name: 'Bella',
    description: 'Bright female narration with a polished, narrative quality.',
    sample: 'Let\'s try that once more with feeling.'
  },
  {
    key: 'liam',
    name: 'Liam',
    description: 'Energetic male creator voice with a casual, upbeat delivery.',
    sample: 'Almost there. Let\'s finish strong.'
  }
];

const savedKey = 'ttsVoiceKey';

const styleId = 'talky-voice-settings-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes talky-orbit-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .talky-voice-card {
      transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.1s ease;
    }
    .talky-voice-card:hover {
      border-color: rgba(245, 169, 98, 0.35) !important;
    }
    .talky-voice-card:active {
      transform: translateY(1px);
    }
    .talky-preview-btn, .talky-reset-btn {
      transition: background-color 0.15s ease, transform 0.1s ease;
    }
    .talky-preview-btn:hover:not(:disabled) {
      background-color: #f7b87d !important;
    }
    .talky-preview-btn:active:not(:disabled),
    .talky-reset-btn:active {
      transform: translateY(1px);
    }
    .talky-preview-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .talky-stop-btn, .talky-reset-btn {
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .talky-stop-btn:hover {
      color: #f87171 !important;
      border-color: rgba(248, 113, 113, 0.4) !important;
    }
    .talky-reset-btn:hover {
      color: #f1f5f9 !important;
      border-color: rgba(255,255,255,0.2) !important;
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
  maxWidth: '900px',
  backgroundColor: 'rgba(19, 23, 46, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  boxSizing: 'border-box',
  position: 'relative',
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

const headingStyle = { marginBottom: '0.35rem', fontSize: '1.15rem', fontWeight: 700, color: '#f1f5f9' };
const smallText = { color: '#6b7194', fontSize: '0.8rem' };

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
    await preview(selectedVoice.sample, selectedVoice.key);
  };

  const resetSelection = () => {
    stopSpeech();
    setIsSpeaking(false);
    setSelectedVoiceKey(voiceOptions[0].key);
    localStorage.removeItem(savedKey);
  };

  const content = (
    <div style={{ ...panelStyle, margin: '0 auto' }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', paddingRight: '2.5rem' }}>
        <h3 style={headingStyle}>{embed ? 'Voice Preview' : 'Voice Settings'}</h3>
        <div style={smallText}>Backend TTS</div>
      </div>

      <p style={{ marginBottom: '1.5rem', color: '#8b91ad', fontSize: '0.9rem' }}>
        Choose a labeled voice option, then preview the written sample sentence.
      </p>

      {loadError ? (
        <p style={{ marginBottom: '1rem', color: '#f5a962', fontSize: '0.85rem' }}>{loadError}</p>
      ) : null}

      {isLoadingVoices ? (
        <p style={{ marginBottom: '1rem', color: '#6b7194', fontSize: '0.9rem' }}>Loading voice options...</p>
      ) : null}

      <label style={labelStyle}>Voice options</label>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '0.9rem',
        marginBottom: '1.75rem',
      }}>
        {voiceOptions.map((voice) => {
          const active = selectedVoiceKey === voice.key;

          return (
            <button
              key={voice.key}
              type="button"
              onClick={() => setSelectedVoiceKey(voice.key)}
              className="talky-voice-card"
              style={{
                padding: '0.9rem 1rem',
                backgroundColor: active ? 'rgba(245, 169, 98, 0.1)' : '#171c3a',
                borderRadius: '0.6rem',
                border: active ? '1px solid rgba(245, 169, 98, 0.55)' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: active ? '0 0 0 3px rgba(245, 169, 98, 0.12)' : 'none',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>{voice.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#8b91ad', marginTop: '0.1rem' }}>{voice.description}</div>
                  </div>
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: active ? '#4ade80' : '#6b7194',
                    whiteSpace: 'nowrap',
                  }}>
                    {active ? 'Selected' : 'Use'}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#c3c9e0' }}>
                  Sample: "{voice.sample}"
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={saveSelection}
          disabled={isSpeaking}
          className="talky-preview-btn"
          style={{
            padding: '0.6rem 1.1rem',
            backgroundColor: '#f5a962',
            color: '#0a0d1f',
            border: 'none',
            borderRadius: '0.6rem',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: isSpeaking ? 'default' : 'pointer',
          }}
        >
          {isSpeaking ? 'Previewing...' : 'Preview'}
        </button>
        <button
          onClick={() => {
            stopSpeech();
            setIsSpeaking(false);
          }}
          className="talky-stop-btn"
          style={{
            padding: '0.6rem 1.1rem',
            background: 'none',
            color: '#6b7194',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.6rem',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Stop
        </button>
        <button
          onClick={resetSelection}
          className="talky-reset-btn"
          style={{
            padding: '0.6rem 1.1rem',
            background: 'none',
            color: '#6b7194',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.6rem',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );

  if (embed) {
    return content;
  }

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
        <div style={{ width: '100%', maxWidth: '900px', padding: '0 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: '#c3c9e0', fontSize: '1.1rem', cursor: 'pointer' }}
            >
              ← Back
            </button>
            <h2 style={{ color: '#f1f5f9', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Voice Settings</h2>
            <div style={{ width: '3.5rem' }} />
          </div>

          <p style={{ color: '#8b91ad', marginBottom: '1.5rem', textAlign: 'center' }}>
            Preview and select your preferred voice option.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {content}
          </div>
        </div>
      </main>
    </>
  );
}