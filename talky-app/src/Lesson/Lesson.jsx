import 'ldrs/react/Waveform.css'
import '../Statistics/Statistics.css';

import * as THREE from 'three'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Cloud, Clouds, ContactShadows, Environment, OrbitControls, Sky, useAnimations, useGLTF } from '@react-three/drei'
import { Component, Suspense, forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { VIEW_MODES, useViewMode } from '../viewMode/viewMode.js';
import { getWav2Vec2Worker, subscribeWav2Vec2 } from './wav2vec2Client.js';
import { speakText, stopSpeech } from '../tts.js';
import toast, { Toaster } from 'react-hot-toast';

import Back from './Back.jsx';
import LessonKidOverlay from './LessonKidOverlay.jsx';
import LessonSummary from './LessonSummary.jsx';
import { Waveform } from 'ldrs/react'
import { io } from 'socket.io-client';
import { makeAuthFetch } from '../utils/authFetch.js';
import { useAuth0 } from '@auth0/auth0-react';
import { useMatch } from 'react-router-dom';

useGLTF.preload('/robot-draco.glb')
useGLTF.preload('/seagull-2.glb')

const DEFAULT_INTRO_VIDEO_ID = 'IwWw6Xe09O0';

const LESSON_START_LIVES = 3;
const PHONEME_TREND_MARGIN = 0.05;

function extractWordScores(res) {
  if (!Array.isArray(res)) return [];
  const now = new Date().toISOString();
  return res.map(({ word, phonemes }) => {
    const valid = (phonemes || []).map(p => p.score).filter(s => s != null);
    const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    return { word, score: avg, timestamp: now };
  });
}

async function resampleTo16k(float32Array, fromSampleRate) {
  if (fromSampleRate === 16000) return float32Array;
  const targetLength = Math.ceil(float32Array.length * 16000 / fromSampleRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
  const buffer = offlineCtx.createBuffer(1, float32Array.length, fromSampleRate);
  buffer.copyToChannel(float32Array, 0);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, info) {
    console.warn('3D scene failed to load, continuing without it:', error, info);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function Pine({ position, scale = 1, hue = 0 }) {
  const green = `hsl(${100 + hue}, 35%, ${28 + hue}%)`
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.8, 6]} />
        <meshStandardMaterial color="#5c4326" roughness={1} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.7, 1.1, 8]} />
        <meshStandardMaterial color={green} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.52, 0.9, 8]} />
        <meshStandardMaterial color={green} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.34, 0.7, 8]} />
        <meshStandardMaterial color={green} roughness={0.9} />
      </mesh>
    </group>
  )
}

function LeafyTree({ position, scale = 1, hue = 0 }) {
  const green = `hsl(${95 + hue}, 45%, ${32 + hue}%)`
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.15, 1, 6]} />
        <meshStandardMaterial color="#6b4a2c" roughness={1} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.65, 0]} />
        <meshStandardMaterial color={green} roughness={0.95} flatShading />
      </mesh>
    </group>
  )
}

function Trees() {
  const trees = useMemo(() => {
    const items = []
    let seed = 1337
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (let i = 0; i < 150; i++) {
      const angle = rand() * Math.PI * 2
      const radius = 16 + rand() * 22
      const x = Math.cos(angle) * radius - 8
      const z = Math.sin(angle) * radius
      if (Math.abs(z) < 5 && x > -6) continue
      const scale = 0.8 + rand() * 0.9
      const hue = rand() * 20 - 10
      const Comp = rand() > 0.5 ? Pine : LeafyTree
      items.push({ id: i, x, z, scale, hue, Comp })
    }
    return items
  }, [])

  return (
    <group>
      {trees.map(({ id, x, z, scale, hue, Comp }) => (
        <Comp key={id} position={[x, -1, z]} scale={scale} hue={hue} />
      ))}
    </group>
  )
}

function Mountains() {
  const ranges = useMemo(() => {
    const items = []
    let seed = 42
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const layers = [
      { radius: 70, count: 10, height: 18, color: '#7c8fa8', y: -1 },
      { radius: 95, count: 12, height: 25, color: '#9aa9c0', y: -1 },
      { radius: 125, count: 14, height: 32, color: '#bcc7da', y: -1 },
    ]
    layers.forEach((layer, li) => {
      for (let i = 0; i < layer.count; i++) {
        const angle = (i / layer.count) * Math.PI * 2 + rand() * 0.3
        const x = Math.cos(angle) * layer.radius
        const z = Math.sin(angle) * layer.radius
        const height = layer.height * (0.6 + rand() * 0.7)
        const width = height * (0.8 + rand() * 0.6)
        items.push({ id: `${li}-${i}`, x, z, height, width, color: layer.color })
      }
    })
    return items
  }, [])

  return (
    <group>
      {ranges.map(({ id, x, z, height, width, color }) => (
        <mesh key={id} position={[x, height / 2 - 1, z]} rotation={[0, (x + z) * 0.01, 0]}>
          <coneGeometry args={[width / 2, height, 4]} />
          <meshStandardMaterial color={color} flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function SkyClouds() {
  const groupRef = useRef(null)
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.position.x += delta * 0.15
  })
  return (
    <group ref={groupRef}>
      <Clouds>
        <Cloud position={[-20, 10, -30]} speed={0.15} opacity={0.6} segments={20} bounds={[10, 3, 3]} />
        <Cloud position={[15, 12, -45]} speed={0.1} opacity={0.5} segments={16} bounds={[8, 2.5, 3]} />
        <Cloud position={[40, 8, -20]} speed={0.2} opacity={0.55} segments={18} bounds={[9, 3, 3]} />
        <Cloud position={[-45, 14, 10]} speed={0.12} opacity={0.5} segments={14} bounds={[7, 2, 3]} />
      </Clouds>
    </group>
  )
}

const Model = forwardRef(function Model(props, ref) {
  const { scene, animations } = useGLTF('/robot-draco.glb');
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    console.log('Available actions:', Object.keys(actions))
    if (actions.Idle) {
      actions.Idle.play()
    } else if (Object.keys(actions).length > 0) {
      const firstAction = Object.values(actions)[0]
      firstAction.play()
    }
    scene.traverse((obj) => obj.isMesh && (obj.receiveShadow = obj.castShadow = true))
    if (props.onActionsReady) props.onActionsReady(actions)
  }, [actions, scene, animations, props])

  return <primitive ref={ref} object={scene} {...props} />
})

class CanvasErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    console.error('3D scene failed to start:', error);
    toast.error('Could not start the 3D scene — enable hardware acceleration / WebGL in your browser settings and reload.', { duration: 8000 });
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ ...screenStyle, padding: 24 }}>
          <div>
            <h2>3D scene unavailable</h2>
            <p>Your browser couldn't create a WebGL context. Enable hardware acceleration / WebGL and reload the page.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CameraIntro({ facePos, target, controlsRef, actions, greeting, onGreetingDone, canLeaveRef }) {
  const { camera } = useThree()
  const start = useRef(camera.position.clone())
  const startTarget = useRef(new THREE.Vector3())
  const phase = useRef('in')
  const t = useRef(0)
  const holdFor = useRef(1.5)
  const greetingSpokenRef = useRef(false)
  const idleResumedRef = useRef(false)

  useFrame((_, delta) => {
    if (phase.current === 'done' || !actions) return
    const controls = controlsRef.current
    if (controls) controls.enabled = false

    if (phase.current === 'in' || phase.current === 'out') {
      const [from, to] = phase.current === 'in' ? [start.current, facePos] : [facePos, start.current]
      const [fromT, toT] = phase.current === 'in' ? [startTarget.current, target] : [target, startTarget.current]
      t.current = Math.min(1, t.current + delta / 1.2)
      const e = 1 - Math.pow(1 - t.current, 3)
      camera.position.lerpVectors(from, to, e)
      controls?.target.lerpVectors(fromT, toT, e)

      if (t.current === 1) {
        t.current = 0
        if (phase.current === 'in') {
          const idle = actions.Idle
          const wave = actions.Wave || Object.values(actions).find(a => /wave/i.test(a.getClip().name))
          idle?.fadeOut(0.3)
          if (wave) {
            wave.reset().setLoop(THREE.LoopOnce, 1)
            wave.clampWhenFinishActions = true
            wave.fadeIn(0.3).play()
            holdFor.current = wave.getClip().duration + 0.3
          }
          if (!greetingSpokenRef.current) {
            greetingSpokenRef.current = true
            if (greeting) {
              speakText(greeting, { onEnd: onGreetingDone }).catch((err) => {
                console.warn('TTS failed', err)
                onGreetingDone?.()
              })
            } else {
              onGreetingDone?.()
            }
          }
          phase.current = 'hold'
        } else {
          phase.current = 'done'
          controls.enabled = true
        }
      }
    } else if (phase.current === 'hold') {
      t.current += delta
      if (!idleResumedRef.current && t.current > holdFor.current) {
        idleResumedRef.current = true
        actions.Idle?.reset().fadeIn(0.3).play()
      }
      if (t.current > holdFor.current && canLeaveRef?.current) {
        phase.current = 'out'
        t.current = 0
      }
    }
    controls?.update()
  })

  return null
}

const N8 = '#0E0C15';
const N7 = '#15131D';
const N6 = '#252134';
const N1 = '#FFFFFF';
const N3 = '#ADA8C3';
const N4 = '#757185';
const EDGE = 'rgba(255,255,255,0.1)';
const ACCENT = '#AC6AFF';
const GOOD = '#7ADB78';
const WARN = '#FFC876';
const BAD = '#FF776F';

const getPhonemeStyle = (score) => {
  if (score === null || score === undefined) {
    return { background: N6, color: N4 };
  }
  if (score >= 0.9) {
    return { background: 'rgba(122,219,120,0.18)', color: GOOD };
  }
  if (score >= 0.7) {
    return { background: 'rgba(255,200,118,0.18)', color: WARN };
  }
  return { background: 'rgba(255,119,111,0.18)', color: BAD };
};

const scoreColor = (score) => (score >= 0.8 ? GOOD : score >= 0.5 ? WARN : BAD);

const buttonStyle = (variant = 'primary') => ({
  padding: '12px 24px',
  border: 'none',
  background: variant === 'primary' ? ACCENT : N7,
  color: variant === 'primary' ? N8 : N1,
  boxShadow: variant === 'primary' ? 'none' : `inset 0 0 0 1px ${EDGE}`,
  fontSize: '1.1rem',
  fontWeight: 700,
  cursor: 'pointer',
});

const screenStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: N8,
  color: N1,
  textAlign: 'center',
};

function PerformanceTracker({ lives, maxLives, runningScore, phonemeStats, wordHistory }) {
  const [open, setOpen] = useState(true);

  const phonemeRows = Object.entries(phonemeStats)
    .filter(([, v]) => v.scores.length > 0)
    .map(([phoneme, v]) => ({
      phoneme,
      avgScore: v.scores.reduce((a, b) => a + b, 0) / v.scores.length,
      avgDelta: v.deltas.length ? v.deltas.reduce((a, b) => a + b, 0) / v.deltas.length : null,
      attempts: v.scores.length,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  return (
    <div style={{
      position: 'absolute', top: 24, right: 24, zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="cut-chip"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: N7, color: N1, border: 'none',
          padding: '8px 16px', cursor: 'pointer',
          fontWeight: 700, fontSize: 14,
        }}
      >
        <span style={{ display: 'flex', gap: 4 }} aria-label={`${lives} of ${maxLives} attempts remaining`}>
          {Array.from({ length: maxLives }).map((_, i) => (
            <svg key={i} width="16" height="16" viewBox="0 0 24 24">
              <path
                d="M13 2 L4 14 h6 l-1 8 9-12h-6z"
                fill={i < lives ? WARN : 'none'}
                stroke={i < lives ? WARN : N4}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </span>
        <span>{Math.round((runningScore || 0) * 100)}%</span>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{open ? '▲ hide' : '▼ stats'}</span>
      </button>

      {open && (
        <div className="cut-card" style={{ width: 260, color: N1, padding: 16, textAlign: 'left' }}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Lesson accuracy
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 8, background: N6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round((runningScore || 0) * 100)}%`,
                  height: '100%',
                  background: scoreColor(runningScore || 0),
                  transition: 'width 200ms ease',
                }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{Math.round((runningScore || 0) * 100)}%</div>
            </div>
          </div>

          {phonemeRows.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Phonemes this lesson
              </div>
              {phonemeRows.map(r => (
                <div key={r.phoneme} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 13, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span>
                    {r.phoneme} <span style={{ opacity: 0.55, fontSize: 11 }}>×{r.attempts}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: scoreColor(r.avgScore) }}>{Math.round(r.avgScore * 100)}%</span>
                    {r.avgDelta != null && (
                      <span style={{
                        color: r.avgDelta > PHONEME_TREND_MARGIN ? GOOD
                          : r.avgDelta < -PHONEME_TREND_MARGIN ? BAD : N3,
                        fontSize: 11,
                      }}>
                        {r.avgDelta > PHONEME_TREND_MARGIN ? '▲' : r.avgDelta < -PHONEME_TREND_MARGIN ? '▼' : '—'}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {wordHistory.length > 0 && (
            <div>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Recent words
              </div>
              {wordHistory.slice(-8).reverse().map((w, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span>{w.word}</span>
                  <span style={{ color: scoreColor(w.score), fontWeight: 600 }}>{Math.round(w.score * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

const buildEmbedUrl = (videoId, startSeconds) => {
  if (!videoId) return null;
  const s = Number.isFinite(startSeconds) ? Math.max(0, Math.floor(startSeconds)) : 0;
  const params = new URLSearchParams({ autoplay: '0' });
  if (s) params.set('start', String(s));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
};

export default function Lesson() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  const { user, isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const userId = isAuthenticated && user ? (user.sub || user.email) : 'demo';
  const authFetch = useMemo(() => makeAuthFetch(getAccessTokenSilently), [getAccessTokenSilently]);
  
  // pick which fetch function to use: either authFetch or fetch
  const lessonFetch = useMemo(
    () => (isAuthenticated ? authFetch : (url, options) => fetch(url, options)),
    [isAuthenticated, authFetch]
  );
  const [viewMode] = useViewMode();

  const [nextHover, setNextHover] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [cardData, setCardData] = useState(null);
  const [actions, setActions] = useState(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(1);
  const [isFinished, setIsFinished] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [robotPos] = useState([-10, -1, 0]);
  const robotRef = useRef(null);
  const controlsRef = useRef(null);
  const robotFaceTarget = useMemo(() => new THREE.Vector3(robotPos[0], -0.3, robotPos[2]), [robotPos]);
  const robotFacePos = useMemo(() => new THREE.Vector3(robotPos[0] + 3, 0.2, robotPos[2]), [robotPos]);
  const match = useMatch("/lessons/:id");
  const lessonId = match?.params?.id;
  const [showIntro, setShowIntro] = useState(true);
  const [targetPhoneme, setTargetPhoneme] = useState(null);
  const [introVideo, setIntroVideo] = useState(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoStarted, setVideoStarted] = useState(false);
  const [wordsToIPA, setWordsToIPA] = useState(null);
  const [lessonWords, setLessonWords] = useState([]);
  const [currentWordsToIPA, setCurrentWordsToIPA] = useState(null);
  const currentWordsToIPARef = useRef(null);
  const [wordResults, setWordResults] = useState([]);
  const [prosody, setProsody] = useState(null);
  const wordScoresRef = useRef([]);
  const skipNextSentenceSpeechRef = useRef(false);

  const speakSentence = (sentence) => {
    return speakText(sentence).catch((err) => {
      console.warn('TTS failed', err);
    });
  };

  const introGreeting = useMemo(() => {
    if (!lessonWords || lessonWords.length === 0) return null;
    const wordsPhrase = lessonWords.length >= 2
      ? `${lessonWords[0]} and ${lessonWords[1]}`
      : lessonWords[0];
    return `Hi! Welcome to a new lesson, today you will practice speaking sentences including the words ${wordsPhrase}. Now, can you say this sentence?`;
  }, [lessonWords]);

  const introCanLeaveRef = useRef(false);

  const [greetingDone, setGreetingDone] = useState(false);
  const greetingDoneRef = useRef(false);

  const handleIntroGreetingDone = () => {
    if (greetingDoneRef.current) return;
    greetingDoneRef.current = true;
    setGreetingDone(true);
    const currentSentence = cardData?.[String(currentSentenceIndex)] || cardData?.[currentSentenceIndex] || '';
    if (!currentSentence) {
      introCanLeaveRef.current = true;
      return;
    }
    speakText(currentSentence, {
      onEnd: () => { introCanLeaveRef.current = true; },
    }).catch((err) => {
      console.warn('TTS failed', err);
      introCanLeaveRef.current = true;
    });
  };

  // The camera/greeting sequence above only advances once the robot's GLTF
  // model has loaded and its animations are ready (see CameraIntro's
  // `!actions` guard). If the model fails to load — missing asset, no WebGL,
  // SceneErrorBoundary catching a render error — that never happens, and the
  // lesson would otherwise be stuck showing only the intro screen forever.
  // Fall back to unlocking the lesson UI after a short grace period so the
  // 3D scene stays decorative, not load-bearing.
  useEffect(() => {
    if (showIntro) return undefined;
    const fallback = setTimeout(() => handleIntroGreetingDone(), 4000);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIntro]);

  const [lives, setLives] = useState(LESSON_START_LIVES);
  const [runningScore, setRunningScore] = useState(0);
  const [phonemeStats, setPhonemeStats] = useState({});
  const [wordHistory, setWordHistory] = useState([]);
  const [lessonFailed, setLessonFailed] = useState(false);
  const allWordScoresRef = useRef([]);
  const lessonFailedRef = useRef(false);
  const sentenceStrikeAppliedRef = useRef(false);

  const phonemeStatsRef = useRef({});
  const wordHistoryRef = useRef([]);
  const wordResultsRef = useRef([]);
  const sentenceResultsRef = useRef([]);
  const prosodyHistoryRef = useRef([]);
  const feedbackHistoryRef = useRef([]);
  const currentSentenceIndexRef = useRef(1);
  const attemptSavedRef = useRef(false);
  const liveSnapshotRef = useRef(null);
  const targetPhonemeRef = useRef(null);
  const cardDataRef = useRef(null);
  const livesRef = useRef(LESSON_START_LIVES);
  const [thisAttempt, setThisAttempt] = useState(null);
  const [comparisonAttempts, setComparisonAttempts] = useState({ first: null, previous: null });

  useEffect(() => { targetPhonemeRef.current = targetPhoneme; }, [targetPhoneme]);
  useEffect(() => { cardDataRef.current = cardData; }, [cardData]);
  useEffect(() => { livesRef.current = lives; }, [lives]);

  const buildAttemptPayload = (status, livesOverride) => {
    const scores = allWordScoresRef.current;
    const overallScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const phonemeStatsArr = Object.entries(phonemeStatsRef.current).map(([phoneme, v]) => ({
      phoneme,
      scores: v.scores,
      deltas: v.deltas,
    }));

    let sentenceResults = sentenceResultsRef.current;
    const idx = currentSentenceIndexRef.current;
    if (status === 'failed' && wordResultsRef.current.some(Boolean)
        && !sentenceResults.some(s => s.sentenceIndex === idx)) {
      sentenceResults = [
        ...sentenceResults,
        {
          sentenceIndex: idx,
          sentence: cardDataRef.current?.[idx.toString()] || '',
          partial: true,
          words: wordResultsRef.current.filter(Boolean),
        },
      ];
    }

    return {
      userId,
      lessonId,
      phoneme: targetPhonemeRef.current,
      status,
      overallScore,
      livesRemaining: livesOverride ?? livesRef.current,
      maxLives: LESSON_START_LIVES,
      wordHistory: wordHistoryRef.current,
      phonemeStats: phonemeStatsArr,
      sentenceResults,
      prosody: prosodyHistoryRef.current,
      feedbackHistory: feedbackHistoryRef.current,
    };
  };

  const saveLessonAttempt = async (status, livesOverride) => {
    if (attemptSavedRef.current) return;
    attemptSavedRef.current = true;
    const payload = buildAttemptPayload(status, livesOverride);
    liveSnapshotRef.current = payload;
    try {
      const res = await authFetch(`${API_BASE}/api/user/lessonAttempts`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }
      const saved = await res.json();
      setThisAttempt(saved);
      if (saved.attemptNumber > 1) {
        const q = new URLSearchParams({ userId, lessonId, before: String(saved.attemptNumber) });
        const cmp = await authFetch(`${API_BASE}/api/user/lessonAttempts?${q}`).then(r => r.json());
        setComparisonAttempts(cmp);
      }
    } catch (err) {
      console.error('Failed to save lesson attempt:', err);
      // Let the summary screen fall back to the live-computed snapshot
      // (liveSnapshotRef) instead of silently showing a blank/zeroed
      // "Lesson Complete" screen as if the save had actually succeeded.
      attemptSavedRef.current = false;
      toast.error("Couldn't save your results — showing this session's scores only.");
    }
  };

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const isStartingRecordingRef = useRef(false);
  const accumChunksRef = useRef([]);
  const chunkIntervalRef = useRef(null);
  const pendingSessionRef = useRef(null);
  const sentencePassedRef = useRef(false);

  const workerRef = useRef(null);
  const workerReadyRef = useRef(false);
  const workerDeviceRef = useRef(null);
  const sessionModeRef = useRef('audio');
  const pendingChunksRef = useRef(0);
  const stopPendingRef = useRef(false);
  const stopTimeoutRef = useRef(null);
  const stopHardCapRef = useRef(null);
  const prosodyTimeoutRef = useRef(null);

  useEffect(() => {
    const socket = io(API_BASE, { autoConnect: false, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (pendingSessionRef.current) {
        socket.emit('start', pendingSessionRef.current);
        pendingSessionRef.current = null;
      }
    });

    socket.on('partial_result', (data) => {
      setWordResults(prev => {
        const next = [...prev];
        next[data.word_index] = { word: data.word, phonemes: data.phonemes };
        wordResultsRef.current = next;
        return next;
      });

      const targetPhonemes = currentWordsToIPARef.current?.[data.word_index]?.phonemes || [];
      const rows = (data.phonemes || []).map((p, i) => ({
        target: targetPhonemes[i] ?? '—',
        decoded: p.decoded,
        score: p.score != null ? p.score.toFixed(2) : 'n/a',
      }));
      console.log(`[phoneme] word ${data.word_index} "${data.word}"`);
      console.table(rows);
    });

    socket.on('stats_update', (data) => {
      allWordScoresRef.current.push(data.score);
      const scores = allWordScoresRef.current;
      setRunningScore(scores.reduce((a, b) => a + b, 0) / scores.length);

      setWordHistory(prev => {
        const next = [...prev, { word: data.word, score: data.score, timestamp: new Date().toISOString() }];
        wordHistoryRef.current = next;
        return next;
      });

      if (data.phoneme_deltas && data.phoneme_deltas.length) {
        setPhonemeStats(prev => {
          const next = { ...prev };
          data.phoneme_deltas.forEach(pd => {
            const existing = next[pd.phoneme] || { scores: [], deltas: [] };
            const scores2 = [...existing.scores, pd.score];
            const deltas2 = (pd.delta === null || pd.delta === undefined)
              ? existing.deltas
              : [...existing.deltas, pd.delta];
            next[pd.phoneme] = { scores: scores2, deltas: deltas2 };
          });
          phonemeStatsRef.current = next;
          return next;
        });
      }

      if (data.is_strike && !sentenceStrikeAppliedRef.current) {
        sentenceStrikeAppliedRef.current = true;
        setLives(prev => {
          const next = Math.max(0, prev - 1);
          if (next === 0 && !lessonFailedRef.current) {
            lessonFailedRef.current = true;
            socketRef.current?.emit('stop');
            stopRecording();
            setLessonFailed(true);
            saveLessonAttempt('failed', next);
            setTimeout(() => socketRef.current?.disconnect(), 150);
          }
          return next;
        });
      }
    });

    socket.on('result', (data) => {
      if (lessonFailedRef.current) return;
      handleFinalResult(data);
    });

    socket.on('prosody', (data) => {
      setProsody(data);
      prosodyHistoryRef.current = [
        ...prosodyHistoryRef.current,
        { sentenceIndex: currentSentenceIndexRef.current, ...data },
      ];
      if (prosodyTimeoutRef.current) {
        clearTimeout(prosodyTimeoutRef.current);
        prosodyTimeoutRef.current = null;
      }
      socket.disconnect();
    });

    return () => {
      socket.off('connect');
      socket.off('partial_result');
      socket.off('stats_update');
      socket.off('result');
      socket.off('prosody');
      socket.disconnect();
    };
  }, [API_BASE]);

  useEffect(() => {
    workerRef.current = getWav2Vec2Worker();

    const unsubscribe = subscribeWav2Vec2((msg) => {
      if (msg.type === 'ready') {
        console.log('model loaded');
        workerReadyRef.current = true;
        workerDeviceRef.current = { device: msg.device, dtype: msg.dtype };
        if (msg.device === 'webgpu') {
          console.info(`[wav2vec2] on-device inference ready: WebGPU/${msg.dtype}`);
        } else {
          console.warn(`[wav2vec2] WebGPU unavailable, running ${msg.device}/${msg.dtype} instead (slower, less accurate)`);
        }
      } else if (msg.type === 'error') {
        workerReadyRef.current = false;
        console.warn('On-device wav2vec2 unavailable, streaming raw audio instead:', msg.error);
      } else if (msg.type === 'logits') {
        if (sessionModeRef.current === 'logits' && socketRef.current?.connected) {
          socketRef.current.emit('logits_chunk', { frames: msg.frames, data: msg.data.buffer });
        }
        pendingChunksRef.current -= 1;
        onWorkerProgress();
      } else if (msg.type === 'chunk_error') {
        pendingChunksRef.current -= 1;
        onWorkerProgress();
      }
    });

    return () => {
      unsubscribe();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading || !lessonId) return;
    let cancelled = false;

    lessonFetch(`${API_BASE}/api/lessons?user_id=${encodeURIComponent(userId)}&lesson_id=${encodeURIComponent(lessonId)}`, {
      cache: 'no-store',
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setCardData(data.sentences ?? data);
        const ipas = data.words_to_ipas;
        if (!ipas || ipas.length === 0) {
          toast.error('Phoneme data failed to load. Please reload the page.');
        }
        setWordsToIPA(ipas);
        setLessonWords(Array.isArray(data.words) ? data.words : []);
        setTargetPhoneme(data.target_phoneme || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Error fetching data:", error);
        toast.error('Failed to load lesson. Please check your connection and reload.');
      });

    return () => { cancelled = true; };
  }, [authLoading, userId, lessonId, API_BASE, lessonFetch]);

  useEffect(() => {
    if (authLoading || !lessonId) return;
    let cancelled = false;

    setVideoLoading(true);
    lessonFetch(`${API_BASE}/api/lessons/intro-video?user_id=${encodeURIComponent(userId)}&lesson_id=${encodeURIComponent(lessonId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.intro_video_id) {
          setIntroVideo({ videoId: data.intro_video_id, start: data.intro_video_start || 0, usedFallback: false });
        } else {
          setIntroVideo({ videoId: DEFAULT_INTRO_VIDEO_ID, start: 0, usedFallback: true });
          console.warn(`No intro video mapped for phoneme "${data.target_phoneme}", using fallback.`);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Intro video lookup failed:', error);
        setIntroVideo({ videoId: DEFAULT_INTRO_VIDEO_ID, start: 0, usedFallback: true });
      })
      .finally(() => { if (!cancelled) setVideoLoading(false); });

    return () => { cancelled = true; };
  }, [authLoading, userId, lessonId, API_BASE, lessonFetch]);

  useEffect(() => {
    currentSentenceIndexRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  useEffect(() => {
    if (wordsToIPA && currentSentenceIndex > 0) {
      const words = wordsToIPA[currentSentenceIndex - 1] || null;
      setCurrentWordsToIPA(words);
      currentWordsToIPARef.current = words;
      setWordResults([]);
    }
  }, [wordsToIPA, currentSentenceIndex]);

  useEffect(() => {
    if (!cardData || showIntro) return;
    const currentSentence = cardData[String(currentSentenceIndex)] || cardData[currentSentenceIndex] || '';
    if (!currentSentence) return;
    if (skipNextSentenceSpeechRef.current) {
      skipNextSentenceSpeechRef.current = false;
      return;
    }
    speakSentence(currentSentence);
  }, [cardData, currentSentenceIndex, showIntro]);

  const stopRecording = () => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    accumChunksRef.current = [];
    setIsRecording(false);
  };

  const handleFinalResult = (data) => {
    setWordResults(data.res || []);
    if (data.prosody) setProsody(data.prosody);
    stopRecording();
    if (prosodyTimeoutRef.current) clearTimeout(prosodyTimeoutRef.current);
    prosodyTimeoutRef.current = setTimeout(() => {
      prosodyTimeoutRef.current = null;
      socketRef.current?.disconnect();
    }, 20000);

    if (data.passed) {
      if (sentencePassedRef.current) return;
      sentencePassedRef.current = true;
      wordScoresRef.current.push(...extractWordScores(data.res));
      sentenceResultsRef.current = [
        ...sentenceResultsRef.current,
        {
          sentenceIndex: currentSentenceIndexRef.current,
          sentence: cardData?.[currentSentenceIndexRef.current.toString()] || '',
          partial: false,
          words: data.res || [],
        },
      ];
      actions?.ThumbsUp?.play?.();
      speakSentence("Great job!");
      actions?.Walking?.play?.();
      if (robotRef.current) {
        robotRef.current.translateZ(30 / 7);
        robotRef.current.updateMatrixWorld();
      }
      actions?.Idle?.play?.();
    } else {
      actions?.No?.play?.();
      const feedbackMsg = String(data.feedback || 'No, try again.');
      setFeedbackText(feedbackMsg);
      speakSentence(feedbackMsg);
      if (data.feedback_detail?.phoneme) {
        feedbackHistoryRef.current = [
          ...feedbackHistoryRef.current,
          {
            ...data.feedback_detail,
            sentenceIndex: currentSentenceIndexRef.current,
            sentence: cardDataRef.current?.[currentSentenceIndexRef.current.toString()] || '',
            timestamp: new Date().toISOString(),
          },
        ];
      }
    }
  };

  const sendChunk = async (chunks, sampleRate) => {
    if (!chunks.length || !socketRef.current?.connected) return;
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const flat = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) { flat.set(c, offset); offset += c.length; }
    const resampled = await resampleTo16k(flat, sampleRate);
    socketRef.current.emit('chunk', resampled.buffer);
    if (sessionModeRef.current === 'logits' && workerRef.current) {
      pendingChunksRef.current += 1;
      workerRef.current.postMessage({ type: 'chunk', audio: resampled });
    }
  };

  const STOP_DRAIN_STALL_MS = 8000;
  const STOP_DRAIN_HARD_CAP_MS = 30000;

  const clearStopTimers = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (stopHardCapRef.current) {
      clearTimeout(stopHardCapRef.current);
      stopHardCapRef.current = null;
    }
  };

  const emitStop = () => {
    clearStopTimers();
    if (stopPendingRef.current) {
      stopPendingRef.current = false;
      if (pendingChunksRef.current > 0) {
        console.warn(`[wav2vec2] gave up draining worker with ${pendingChunksRef.current} chunk(s) still unscored`);
      }
      socketRef.current?.emit('stop');
    }
  };

  const onWorkerProgress = () => {
    if (!stopPendingRef.current) return;
    if (pendingChunksRef.current <= 0) {
      emitStop();
      return;
    }
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(emitStop, STOP_DRAIN_STALL_MS);
  };

  const requestStop = () => {
    if (sessionModeRef.current === 'logits' && pendingChunksRef.current > 0) {
      stopPendingRef.current = true;
      stopTimeoutRef.current = setTimeout(emitStop, STOP_DRAIN_STALL_MS);
      stopHardCapRef.current = setTimeout(emitStop, STOP_DRAIN_HARD_CAP_MS);
    } else {
      socketRef.current?.emit('stop');
    }
  };

  const startRecording = async () => {
    if (isStartingRecordingRef.current || isRecording) return;
    isStartingRecordingRef.current = true;
    try {
      await startRecordingInner();
    } finally {
      isStartingRecordingRef.current = false;
    }
  };

  const startRecordingInner = async () => {
    if (sentencePassedRef.current) {
      toast("You've already passed this exercise! Click Next to continue.", { icon: '✅' });
      return;
    }
    const sentence = cardData?.[currentSentenceIndex.toString()];
    const words_ipa = wordsToIPA?.[currentSentenceIndex - 1];
    if (!sentence || !words_ipa) {
      toast.error('Lesson data not ready yet — please wait a moment and try again.');
      return;
    }

    setIsRecording(true);
    setWordResults([]);
    sentenceStrikeAppliedRef.current = false;
    setProsody(null);

    sessionModeRef.current = workerReadyRef.current ? 'logits' : 'audio';
    pendingChunksRef.current = 0;
    stopPendingRef.current = false;
    clearStopTimers();
    if (prosodyTimeoutRef.current) {
      clearTimeout(prosodyTimeoutRef.current);
      prosodyTimeoutRef.current = null;
    }

    const socket = socketRef.current;
    if (socket.connected) socket.disconnect();
    // The server only accepts a userId other than "demo" when it's backed by
    // a valid token for that same subject (see handle_start in main.py) - an
    // authenticated learner's real progress/baseline must not be readable or
    // writable by an unauthenticated caller who merely knows their user id.
    const token = isAuthenticated ? await getAccessTokenSilently().catch(() => null) : null;
    pendingSessionRef.current = { sentence, words_ipa, userId, mode: sessionModeRef.current, target_phoneme: targetPhoneme, token };
    socket.connect();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.error('Microphone access denied:', err);
      setIsRecording(false);
      alert('Microphone access is required to record.');
      socket.disconnect();
      return;
    }
    streamRef.current = stream;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);

    const BUFFER_SIZE = 2048;
    const CHUNK_INTERVAL_MS = 500;

    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;
    accumChunksRef.current = [];

    processor.onaudioprocess = (e) => {
      accumChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    chunkIntervalRef.current = setInterval(() => {
      const chunks = accumChunksRef.current.splice(0);
      if (chunks.length > 0) sendChunk(chunks, ctx.sampleRate);
    }, CHUNK_INTERVAL_MS);

    source.connect(processor);
    processor.connect(ctx.destination);
  };

  const toggleRecording = () => {
    if (isRecording) {
      requestStop();
      stopRecording();
    } else {
      startRecording();
    }
  };

  const goToNextSentence = async () => {
    sentencePassedRef.current = false;
    if (cardData && cardData[(currentSentenceIndex + 1).toString()]) {
      stopSpeech();
      setCurrentSentenceIndex(prev => prev + 1);
      if (actions) {
        Object.values(actions).forEach(action => action.stop());
        actions.Idle && actions.Idle.play();
      }
    } else {
      if (actions) {
        Object.values(actions).forEach(action => action.stop());
        actions.Dance && actions.Dance.play();
      }
      setIsFinished(true);
      const currentLessonId = parseInt(window.location.pathname.split('/').pop());
      saveLessonAttempt('completed');

      authFetch(`${API_BASE}/api/user/updateUserProgress`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          lessonId: currentLessonId,
          addScore: runningScore || 0.1,
          wordScores: wordScoresRef.current
        })
      }).catch(err => console.error('Failed to update user progress:', err));

      try {
        await authFetch(`${API_BASE}/api/user/generatenextlesson`, {
          method: 'POST',
          body: JSON.stringify({ user_id: userId, currentLessonId: currentLessonId }),
        });
      } catch (err) {
        console.error('Failed to generate next lesson:', err);
      }
    }
  }

  if (showIntro) {
    const thumbUrl = introVideo
      ? `https://img.youtube.com/vi/${introVideo.videoId}/hqdefault.jpg`
      : null;
    const embedUrl = introVideo
      ? buildEmbedUrl(introVideo.videoId, introVideo.start) + '&autoplay=1'
      : null;

    return (
      <div style={{ ...screenStyle, flexDirection: 'column', padding: 24 }}>
        <Back />
        <h2 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>Watch this example first</h2>
        {targetPhoneme && (
          <p style={{ color: N3, marginBottom: '1.25rem', fontSize: '1rem' }}>
            Today's focus: the <strong style={{ color: ACCENT }}>/{targetPhoneme}/</strong> sound
          </p>
        )}

        <div style={{ width: 640, maxWidth: '90vw', aspectRatio: '16 / 9', marginBottom: '2rem', overflow: 'hidden', background: N7 }}>
          {videoLoading ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Waveform size="35" stroke="3.5" speed="1" color={ACCENT} />
            </div>
          ) : videoStarted ? (
            <iframe
              title="intro-video"
              src={embedUrl}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              onClick={() => setVideoStarted(true)}
              style={{
                width: '100%', height: '100%', border: 'none', padding: 0, cursor: 'pointer',
                position: 'relative', backgroundImage: `url(${thumbUrl})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
              }}
              aria-label="Play example video"
            >
              <span style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.25)',
              }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>

        <button
          onClick={() => {
            skipNextSentenceSpeechRef.current = true;
            setShowIntro(false);
          }}
          className="cut-chip"
          style={buttonStyle()}
        >
          Start Lesson
        </button>
      </div>
    );
  }

  if (lessonFailed || isFinished) {
    return (
      <LessonSummary
        status={lessonFailed ? 'failed' : 'completed'}
        currentAttempt={thisAttempt || liveSnapshotRef.current}
        comparisonAttempts={comparisonAttempts}
        viewMode={viewMode}
        onRetry={() => window.location.reload()}
        onHome={() => window.location.href = '/app'}
      />
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      <Toaster position="top-center" />
      <CanvasErrorBoundary>
      <SceneErrorBoundary>
        <Canvas
          style={{ width: '100%', height: '100%' }}
          camera={{ position: [-15, 8, 10], fov: 50 }}
          shadows
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Sky distance={450000} sunPosition={[2, 1, 0]} inclination={0.45} azimuth={0.25} />
            <Environment preset="sunset" background={false} />
            <fog attach="fog" args={['#bcd4e6', 40, 190]} />

            <ambientLight intensity={0.6} />
            <hemisphereLight args={['#bcd4f0', '#5c7a3f', 0.5]} />
            <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.01, 0]} receiveShadow>
              <planeGeometry args={[260, 260]} />
              <meshStandardMaterial color="#6aa84f" roughness={1} metalness={0} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, -1.0, 0]} receiveShadow>
              <planeGeometry args={[30, 4]} />
              <meshStandardMaterial color="#333" roughness={0.9} metalness={0.1} />
            </mesh>

            <Mountains />
            <Trees />
            <SkyClouds />

            <group position={[20, -1, 0]}>
              <mesh position={[0, 1, 0]} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 2, 8]} />
                <meshStandardMaterial color="#444" />
              </mesh>
              <mesh position={[0, 1.7, 0.45]} rotation={[0, Math.PI / 2, 0]} castShadow>
                <planeGeometry args={[1, 0.6]} />
                <meshStandardMaterial color="#e53935" side={2} />
              </mesh>
            </group>

            <ContactShadows position={robotPos} opacity={0.6} width={4} height={4} blur={2} far={2} />

            <Model
              ref={robotRef}
              position={robotPos}
              scale={0.5}
              rotation={[0, Math.PI / 2, 0]}
              onActionsReady={setActions}
            />

            <CameraIntro
              facePos={robotFacePos}
              target={robotFaceTarget}
              controlsRef={controlsRef}
              actions={actions}
              greeting={introGreeting}
              onGreetingDone={handleIntroGreetingDone}
              canLeaveRef={introCanLeaveRef}
            />
            <OrbitControls ref={controlsRef} enablePan={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
      </CanvasErrorBoundary>

      <Back />
      {viewMode === VIEW_MODES.TEACHER && (
        <PerformanceTracker
          lives={lives}
          maxLives={LESSON_START_LIVES}
          runningScore={runningScore}
          phonemeStats={phonemeStats}
          wordHistory={wordHistory}
        />
      )}
      <div
        style={{
          position: 'absolute',
          right: 24,
          bottom: 24,
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        {feedbackText && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)'
          }}>
            <div
              className="cut-card"
              style={{ width: '50%', maxWidth: 600, padding: 24 }}
            >
              <button
                onClick={() => {
                  setFeedbackText('')
                  stopSpeech()
                }}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: N4
                }}
              >
                ×
              </button>
              <h3 style={{ marginTop: 0, marginBottom: 16, color: N1 }}>Feedback</h3>
              <div style={{ color: N3, lineHeight: 1.6 }}>{feedbackText}</div>
            </div>
          </div>
        )}

        <button
          aria-label="Next lesson"
          onMouseEnter={() => setNextHover(true)}
          onMouseLeave={() => setNextHover(false)}
          onClick={() => {
            goToNextSentence();
            stopSpeech()
          }}
          className="cut-chip"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
            border: 'none',
            cursor: 'pointer',
            background: nextHover ? WARN : ACCENT,
            color: N8,
            fontWeight: 700,
            transition: 'background 180ms ease',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 30 }}>
        <button
          onClick={toggleRecording}
          className="cut-chip"
          style={{
            padding: '10px 14px',
            border: 'none',
            background: isRecording ? BAD : ACCENT,
            color: N8,
            fontWeight: 700,
            cursor: 'pointer',
            animation: isRecording ? 'pulse 1.2s infinite' : 'none',
          }}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>

      {greetingDone && viewMode === VIEW_MODES.STUDENT && (
        <LessonKidOverlay
          lives={lives}
          maxLives={LESSON_START_LIVES}
          wordHistory={wordHistory}
          currentWordsToIPA={currentWordsToIPA}
          wordResults={wordResults}
          sentenceText={cardData ? cardData[currentSentenceIndex.toString()] : null}
        />
      )}

      {greetingDone && viewMode === VIEW_MODES.TEACHER && (
      <div
        className="cut-card"
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          color: N1,
          padding: '12px 20px',
        }}
      >
        <div style={{ color: N3 }}>Say this sentence:</div>
        <div style={{ fontWeight: 'bold', marginTop: 4 }}>
          {cardData ? cardData[currentSentenceIndex.toString()] || 'End of lesson' : <Waveform size="20" stroke="2" speed="1" color={ACCENT} />}
        </div>

        {currentWordsToIPA && (
          <div style={{ margin: '12px 0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {currentWordsToIPA.map(({ word, phonemes }, wordIdx) => {
                const returnedWord = wordResults?.[wordIdx];
                return (
                  <div key={word + wordIdx} className="cut-chip" style={{
                    padding: 6,
                    color: N1,
                    background: N6,
                    minWidth: 70,
                    marginBottom: 4,
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 2, textAlign: 'center', fontSize: 13 }}>{word}</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {phonemes.map((ph, i) => {
                        let score = null;
                        if (returnedWord && returnedWord.phonemes[i] && returnedWord.phonemes[i].phoneme === ph) {
                          score = returnedWord.phonemes[i].score;
                        }
                        const stats = phonemeStats[ph];
                        const trendAvg = stats && stats.deltas.length
                          ? stats.deltas.reduce((a, b) => a + b, 0) / stats.deltas.length
                          : null;
                        const trendArrow = trendAvg == null
                          ? null
                          : trendAvg > PHONEME_TREND_MARGIN ? '▲'
                          : trendAvg < -PHONEME_TREND_MARGIN ? '▼'
                          : null;
                        const trendColor = trendAvg > 0 ? GOOD : BAD;
                        return (
                          <span
                            key={i}
                            style={{
                              ...getPhonemeStyle(score),
                              display: 'inline-block',
                              padding: '2px 5px',
                              fontWeight: 500,
                              fontSize: 12,
                              margin: 1,
                              minWidth: 14,
                              textAlign: 'center',
                              cursor: score !== null ? 'pointer' : 'default'
                            }}
                            title={score !== null ? `Score: ${(score * 100).toFixed(1)}%` : 'No score'}
                          >
                            {ph}
                            {trendArrow && (
                              <sup style={{ color: trendColor, marginLeft: 2, fontSize: 9 }}>{trendArrow}</sup>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {prosody && (
          <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.2)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            fontSize: 13
          }}>
            <span title="How much your pitch varied — higher is livelier, less monotone">
              Expression score: {Math.round((prosody.monotony_score ?? 0) * 100)}%
            </span>
            {prosody.rhythm_score != null && (
              <span title="How natural your rhythm of long and short syllables was">
                Rhythm score: {Math.round(prosody.rhythm_score * 100)}%
              </span>
            )}
            {prosody.boundary_score != null && (
              <span title="Did your voice rise for questions and fall for statements?">
                Sentence melody: {Math.round(prosody.boundary_score * 100)}%
              </span>
            )}
            {prosody.speaking_rate != null && (
              <span title="Approximate syllables per second">
                Speaking rate: {prosody.speaking_rate} syll/s
              </span>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
