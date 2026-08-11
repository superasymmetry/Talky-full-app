import '../Statistics/Statistics.css';

import { scoreToStars } from './summaryDerive.js';
import { Waveform } from 'ldrs/react';

const N1 = '#FFFFFF';
const N6 = '#252134';
const N7 = '#15131D';
const ACCENT = '#AC6AFF';
const GOOD = '#7ADB78';

// Precomputed once so the hearts' keys are stable slot ids, not the .map
// index of a freshly-built array every render.
const LIFE_SLOTS = Array.from({ length: 10 }, (_, i) => i);

function wordAverageScore(returnedWord) {
  const scores = (returnedWord?.phonemes || []).map((p) => p.score).filter((s) => s != null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function Stars({ count }) {
  return (
    <span aria-label={`${count} out of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ opacity: i <= count ? 1 : 0.25, fontSize: 20 }}>⭐</span>
      ))}
    </span>
  );
}

export default function LessonKidOverlay({ lives, maxLives, wordHistory, currentWordsToIPA, wordResults, sentenceText }) {
  return (
    <>
      <div style={{
        position: 'absolute', top: 24, right: 24, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {LIFE_SLOTS.slice(0, maxLives).map((slot) => (
          <span key={slot} style={{ fontSize: 26, opacity: slot < lives ? 1 : 0.25 }}>❤️</span>
        ))}
      </div>

      <div
        className="cut-card"
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          color: N1,
          padding: '16px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ opacity: 0.75, fontSize: 14 }}>Say this sentence:</div>
        <div style={{ fontWeight: 'bold', fontSize: 22, marginTop: 4 }}>
          {sentenceText || <Waveform size="20" stroke="2" speed="1" color={ACCENT} />}
        </div>

        {currentWordsToIPA && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 14 }}>
            {currentWordsToIPA.map(({ word }, wordIdx) => {
              const avgScore = wordAverageScore(wordResults?.[wordIdx]);
              const stars = avgScore == null ? null : scoreToStars(avgScore);
              return (
                <div key={word + wordIdx} className="cut-chip" style={{
                  padding: '8px 12px',
                  background: N6,
                  minWidth: 80,
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{word}</div>
                  {stars != null && <Stars count={stars} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {wordHistory.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 24, left: 24, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          background: N7, borderRadius: 999, padding: '8px 16px', color: N1,
        }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>Great job saying</span>
          <span style={{ fontWeight: 700, color: GOOD }}>{wordHistory[wordHistory.length - 1].word}</span>
        </div>
      )}
    </>
  );
}
