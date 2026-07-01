import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const panelStyle = {
  borderRadius: '1.5rem',
  padding: '3rem 2rem',
  width: '100%',
  maxWidth: '1100px',
  backgroundColor: 'rgba(255, 255, 255, 0.75)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 12px 30px rgba(0,120,255,0.4)',
  textAlign: 'left',
  position: 'relative',
  margin: 0
};

const headingStyle = { marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' };
const smallText = { color: '#475569', fontSize: '0.9rem' };

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
      } catch (error) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={headingStyle}>{embed ? 'Voice Preview' : 'Voice Settings'}</h3>
        <div style={smallText}>Backend TTS</div>
      </div>

      <p style={{ marginBottom: '1rem', color: '#475569' }}>
        Choose a labeled voice option, then preview the written sample sentence.
      </p>

      {loadError ? (
        <p style={{ marginBottom: '1rem', color: '#b45309', fontSize: '0.92rem' }}>{loadError}</p>
      ) : null}

      {isLoadingVoices ? (
        <p style={{ marginBottom: '1rem', color: '#64748b' }}>Loading voice options...</p>
      ) : null}

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem'}}>
        {voiceOptions.map((voice) => {
          const active = selectedVoiceKey === voice.key;

          return (
            <button
              key={voice.key}
              type="button"
              onClick={() => setSelectedVoiceKey(voice.key)}
              style={{
                padding: '1rem',
                background: active ? '#dbeafe' : '#f8fafc',
                borderRadius: '0.75rem',
                border: active ? '1px solid #60a5fa' : '1px solid #e2e8f0',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: active ? '0 6px 18px rgba(59,130,246,0.10)' : 'none'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{voice.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{voice.description}</div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 700 }}>
                    {active ? 'Selected' : 'Use'}
                  </div>
                </div>
                <div style={{ fontSize: '0.92rem', color: '#334155' }}>
                  Sample: “{voice.sample}”
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={saveSelection}
          disabled={isSpeaking}
          style={{ padding: '0.5rem 0.75rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '0.5rem', boxShadow: '0 6px 18px rgba(59,130,246,0.15)', border: 'none', cursor: 'pointer', opacity: isSpeaking ? 0.7 : 1 }}
        >
          Preview {isSpeaking ? '...' : ''}
        </button>
        <button
          onClick={() => {
            stopSpeech();
            setIsSpeaking(false);
          }}
          style={{ padding: '0.5rem 0.75rem', background: '#d36060', borderRadius: '0.5rem', border: '1px solid #e2e8f0', cursor: 'pointer' }}
        >
          Stop
        </button>
        <button
          onClick={resetSelection}
          style={{ padding: '0.5rem 0.75rem', background: '#b12424', borderRadius: '0.5rem', border: '1px solid #e2e8f0', cursor: 'pointer' }}
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
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="text-xl">← Back</button>
        <h2 className="text-2xl font-bold">Voice Settings</h2>
        <div />
      </div>

      <p className="mb-4">Preview and select your preferred voice option.</p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {content}
      </div>
    </div>
  );
}