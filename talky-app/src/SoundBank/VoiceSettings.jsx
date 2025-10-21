import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function VoiceSettings({ embed = false }) {
  const [voices, setVoices] = useState([]);
  const [selected, setSelected] = useState(localStorage.getItem('ttsVoice') || '');
  const navigate = useNavigate();

  useEffect(() => {
    const filterGoogleUSUK = (all) =>
      (all || []).filter(v =>
        /google/i.test(v.name) && /\b(US|UK)\b/i.test(v.name)
      );

    const load = () => {
      const all = window.speechSynthesis.getVoices() || [];
      const filtered = filterGoogleUSUK(all);
      setVoices(filtered);

      // if saved voice isn't available or not set, pick a sensible default (female google US/UK)
      const saved = localStorage.getItem('ttsVoice') || '';
      if (saved && filtered.find(v => v.name === saved)) {
        setSelected(saved);
      } else if (filtered.length) {
        const female = filtered.find(v => /female|woman|girl/i.test(v.name));
        setSelected(female ? female.name : filtered[0].name);
      } else {
        // keep whatever is in localStorage (may be a non-Google voice) until voices are available
      }
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const save = () => {
    if (!selected) {
      localStorage.removeItem('ttsVoice');
    } else {
      localStorage.setItem('ttsVoice', selected);
    }
    // quick feedback: speak a short preview
    const u = new SpeechSynthesisUtterance('This is your selected voice.');
    const v = voices.find(vv => vv.name === selected);
    if (v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1.2;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const preview = (name) => {
    const u = new SpeechSynthesisUtterance(`Preview for ${name}`);
    const v = voices.find(vv => vv.name === name);
    if (v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1.2;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  // panel style adjusted to match profile panel (blue shadow / sizing)
  const panelStyle = {
    borderRadius: '1.5rem',
    padding: '3rem 2rem',
    width: '100%',
    maxWidth: '500px',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 12px 30px rgba(0,120,255,0.4)',
    textAlign: 'left',
    position: 'relative',
    margin: 0
  };

  const headingStyle = { marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' };
  const smallText = { color: '#475569', fontSize: '0.9rem' };

  if (embed) {
    // when embedded we no longer center ourselves — parent (Profile) handles layout
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={headingStyle}>Voice Settings</h3>
          <div style={smallText}>Google US / UK</div>
        </div>

        <p style={{ marginBottom: '1rem', color: '#475569' }}>
          Select the voice used by SoundBank. Your selection is saved to this browser.
        </p>

        <div style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {voices.length === 0 && <div style={{ color: '#64748b' }}>Loading Google US/UK voices... (refresh if you recently added OS voices)</div>}
          {voices.map((v) => (
            <div key={v.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{v.name}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>lang: {v.lang} {v.default ? '• default' : ''}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => { setSelected(v.name); preview(v.name); }}
                  style={{ padding: '0.4rem 0.6rem', background: '#f1f5f9', borderRadius: '0.375rem', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  Preview
                </button>

                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="ttsVoice"
                    checked={selected === v.name}
                    onChange={() => setSelected(v.name)}
                    style={{ width: '16px', height: '16px' }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={save}
            style={{ padding: '0.5rem 0.75rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '0.5rem', boxShadow: '0 6px 18px rgba(59,130,246,0.15)', border: 'none', cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={() => { localStorage.removeItem('ttsVoice'); setSelected(''); }}
            style={{ padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  // non-embedded (standalone) rendering
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="text-xl">← Back</button>
        <h2 className="text-2xl font-bold">Voice Settings</h2>
        <div />
      </div>

      <p className="mb-4">Choose a voice for the SoundBank.</p>

      <div className="space-y-3">
        {voices.length === 0 && <div>Loading voices... (refresh if you recently added OS voices)</div>}
        {voices.map((v) => (
          <div key={v.name} className="flex items-center justify-between p-3 border rounded">
            <div>
              <div className="font-medium">{v.name}</div>
              <div className="text-sm text-muted">lang: {v.lang} {v.default ? '• default' : ''}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelected(v.name); preview(v.name); }} className="px-3 py-1 bg-gray-200 rounded">Preview</button>
              <label className="inline-flex items-center">
                <input type="radio" name="ttsVoice" checked={selected === v.name} onChange={() => setSelected(v.name)} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
        <button onClick={() => { localStorage.removeItem('ttsVoice'); setSelected(''); }} className="px-4 py-2 border rounded">Reset</button>
      </div>
    </div>
  );
}