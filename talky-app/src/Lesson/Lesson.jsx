import { ContactShadows, Environment, OrbitControls, Sky, useAnimations, useGLTF } from '@react-three/drei'
import { Suspense, forwardRef, useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast';

import Back from './Back.jsx';
import { Canvas } from '@react-three/fiber'
import { io } from 'socket.io-client';
import { useAuth0 } from '@auth0/auth0-react';
import { useMatch } from 'react-router-dom';

useGLTF.preload('/robot-draco.glb')

// Fallback used if the lesson's target phoneme has no mapped video yet
// (e.g. new phoneme added before the backend map is regenerated).
const DEFAULT_INTRO_VIDEO_ID = 'IwWw6Xe09O0';

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

const getPhonemeStyle = (score) => {
  if (score === null || score === undefined) {
    return { background: '#e5e7eb', color: '#6b7280' };
  }
  if (score >= 0.9) {
    return { background: '#bbf7d0', color: '#166534' };
  }
  if (score >= 0.7) {
    return { background: '#fef08a', color: '#92400e' };
  }
  return { background: '#fecaca', color: '#991b1b' };
};

// Builds a YouTube embed URL from a bare video ID (+ optional start offset in seconds).
// Kept separate from the lesson-fetch logic so the mapping itself can live entirely
// on the backend (see /scripts/build_phoneme_video_map.py) and just get shipped down
// as { intro_video_id, intro_video_start } on the lesson payload.
const buildEmbedUrl = (videoId, startSeconds) => {
  if (!videoId) return null;
  const s = Number.isFinite(startSeconds) ? Math.max(0, Math.floor(startSeconds)) : 0;
  const params = new URLSearchParams({ autoplay: '0' });
  if (s) params.set('start', String(s));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
};

export default function Lesson() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  // Auth0 is the source of truth for who's logged in — every other page
  // (App.jsx, Profile.jsx, Statistics.jsx) keys off user.sub || user.email.
  // This page used to read localStorage.getItem('user_id'/'userId'), which
  // nothing ever wrote, so every lesson fetch AND every progress save was
  // silently going to the 'demo' account instead of the real signed-in user.
  const { user, isAuthenticated, isLoading: authLoading } = useAuth0();
  const userId = isAuthenticated && user ? (user.sub || user.email) : 'demo';

  const [nextHover, setNextHover] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [cardData, setCardData] = useState(null);
  const [actions, setActions] = useState(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(1);
  const [isFinished, setIsFinished] = useState(false);
  const [doneSentence, setDoneSentence] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [robotPos, setRobotPos] = useState([-10, -1, 0]);
  const robotRef = useRef(null);
  const match = useMatch("/lessons/:id");
  const lessonId = match?.params?.id;
  const [showIntro, setShowIntro] = useState(true);
  // Resolved server-side from the lesson's target phoneme. Null while loading.
  const [introVideo, setIntroVideo] = useState(null); // { videoId, start, usedFallback }
  const [score, setScore] = useState(0);
  const [wordsToIPA, setWordsToIPA] = useState(null);
  const [currentWordsToIPA, setCurrentWordsToIPA] = useState(null);
  const [wordResults, setWordResults] = useState([]);
  // Utterance-level prosody scores from the server (null until a result arrives)
  const [prosody, setProsody] = useState(null);
  const wordScoresRef = useRef([]);
  const sentencePassedRef = useRef(false);

  // Audio + socket refs
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const accumChunksRef = useRef([]);
  const chunkIntervalRef = useRef(null);
  const pendingSessionRef = useRef(null); // holds { sentence, words_ipa, mode } until connect fires

  // On-device wav2vec2 (transformers.js / WebGPU) — when ready, we stream
  // logits to the backend instead of raw audio and the model never runs server-side.
  const workerRef = useRef(null);
  const workerReadyRef = useRef(false);
  const sessionModeRef = useRef('audio');   // 'logits' | 'audio', fixed per recording session
  const pendingChunksRef = useRef(0);       // chunks handed to the worker, logits not yet emitted
  const stopPendingRef = useRef(false);     // user stopped; waiting for worker to drain
  const stopTimeoutRef = useRef(null);
  const prosodyTimeoutRef = useRef(null);   // fallback disconnect if 'prosody' never arrives

  // Initialize socket once — listeners are stable across renders
  useEffect(() => {
    const socket = io(API_BASE, { autoConnect: false, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // After the transport connects, emit 'start' with session metadata
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
        return next;
      });
    });

    socket.on('result', (data) => {
      handleFinalResult(data);
    });

    // Prosody arrives after 'result' (pyin is slow); it's the last event of a
    // session, so the connection can be dropped once it lands.
    socket.on('prosody', (data) => {
      setProsody(data);
      if (prosodyTimeoutRef.current) {
        clearTimeout(prosodyTimeoutRef.current);
        prosodyTimeoutRef.current = null;
      }
      socket.disconnect();
    });

    return () => {
      socket.off('connect');
      socket.off('partial_result');
      socket.off('result');
      socket.off('prosody');
      socket.disconnect();
    };
  }, []);

  // Spin up the on-device wav2vec2 worker once. Model download + WebGPU init
  // happen in the background; until 'ready' fires, sessions fall back to
  // streaming raw audio (the server-side inference path).
  useEffect(() => {
    let worker;
    try {
      worker = new Worker(new URL('./wav2vec2Worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      console.warn('On-device wav2vec2 worker unavailable, streaming raw audio instead:', err);
      return undefined;
    }
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        workerReadyRef.current = true;
      } else if (msg.type === 'error') {
        workerReadyRef.current = false;
        console.warn('On-device wav2vec2 unavailable, streaming raw audio instead:', msg.error);
      } else if (msg.type === 'logits') {
        if (sessionModeRef.current === 'logits' && socketRef.current?.connected) {
          socketRef.current.emit('logits_chunk', { frames: msg.frames, data: msg.data.buffer });
        }
        pendingChunksRef.current -= 1;
        if (stopPendingRef.current && pendingChunksRef.current <= 0) emitStop();
      } else if (msg.type === 'chunk_error') {
        pendingChunksRef.current -= 1;
        if (stopPendingRef.current && pendingChunksRef.current <= 0) emitStop();
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  // Show expected phonemes as soon as the sentence changes
  useEffect(() => {
    if (wordsToIPA && currentSentenceIndex > 0) {
      setCurrentWordsToIPA(wordsToIPA[currentSentenceIndex - 1] || null);
      setWordResults([]);
    }
  }, [wordsToIPA, currentSentenceIndex]);

  // Fetch lesson data — waits for Auth0 to resolve so we fetch with the
  // real userId instead of firing once against 'demo' and never refetching.
  useEffect(() => {
    if (authLoading || !lessonId) return;

    fetch(`${API_BASE}/api/lessons?user_id=${encodeURIComponent(userId)}&lesson_id=${encodeURIComponent(lessonId)}`, {
      cache: 'no-store',
    })
      .then((response) => response.json())
      .then((data) => {
        setCardData(data.sentences ?? data);
        const ipas = data.words_to_ipas;
        if (!ipas || ipas.length === 0) {
          toast.error('Phoneme data failed to load. Please reload the page.');
        }
        setWordsToIPA(ipas);

        // The backend resolves the lesson's target phoneme to a curated
        // Glossika Phonics video (see build_phoneme_video_map.py). If that
        // lookup ever misses, fall back to a generic phonemes-overview video
        // rather than showing nothing.
        if (data.intro_video_id) {
          setIntroVideo({
            videoId: data.intro_video_id,
            start: data.intro_video_start || 0,
            usedFallback: false,
          });
        } else {
          setIntroVideo({ videoId: DEFAULT_INTRO_VIDEO_ID, start: 0, usedFallback: true });
          console.warn(`No intro video mapped for phoneme "${data.target_phoneme}", using fallback.`);
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        toast.error('Failed to load lesson. Please check your connection and reload.');
        setIntroVideo({ videoId: DEFAULT_INTRO_VIDEO_ID, start: 0, usedFallback: true });
      });
  }, [authLoading, userId, lessonId]);

  // TTS for current sentence
  useEffect(() => {
    if (!cardData || showIntro) return;
    const currentSentence = cardData[String(currentSentenceIndex)] || cardData[currentSentenceIndex] || '';
    if (!currentSentence) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(currentSentence);
      u.lang = 'en-US';
      const savedVoice = localStorage.getItem('ttsVoice');
      if (savedVoice) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === savedVoice);
        if (voice) u.voice = voice;
      }
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('TTS failed', err);
    }
  }, [cardData, currentSentenceIndex, showIntro]);

  const speakText = (text) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    const savedVoice = localStorage.getItem('ttsVoice');
    if (savedVoice) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === savedVoice);
      if (voice) utter.voice = voice;
    }
    window.speechSynthesis.speak(utter);
  };

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
    // Older servers bundle prosody into the result instead of sending a
    // separate 'prosody' event afterwards.
    if (data.prosody) setProsody(data.prosody);
    stopRecording();
    // Stay connected for the trailing 'prosody' event; give up after 20 s so a
    // dead server can't hold the socket open forever.
    if (prosodyTimeoutRef.current) clearTimeout(prosodyTimeoutRef.current);
    prosodyTimeoutRef.current = setTimeout(() => {
      prosodyTimeoutRef.current = null;
      socketRef.current?.disconnect();
    }, 20000);

    if (data.passed) {
      if (sentencePassedRef.current) return;
      sentencePassedRef.current = true;
      wordScoresRef.current.push(...extractWordScores(data.res));
      actions?.ThumbsUp?.play?.();
      speakText("Great job!");
      setScore(s => (s ?? 0) + data.score);
      setDoneSentence(true);
      actions?.Walking?.play?.();
      if (robotRef.current) {
        robotRef.current.translateZ(30 / 7);
        robotRef.current.updateMatrixWorld();
        const p = robotRef.current.position;
        setRobotPos([p.x, p.y, p.z]);
      }
      actions?.Idle?.play?.();
    } else {
      actions?.No?.play?.();
      setScore(s => Math.max(0, (s ?? 0) - (100 - data.score)));
      const feedbackMsg = String(data.feedback || 'No, try again.');
      setFeedbackText(feedbackMsg);
      speakText(feedbackMsg);
    }
  };

  const sendChunk = async (chunks, sampleRate) => {
    if (!chunks.length || !socketRef.current?.connected) return;
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const flat = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) { flat.set(c, offset); offset += c.length; }
    const resampled = await resampleTo16k(flat, sampleRate);
    // Raw audio always goes to the server: in audio mode it drives alignment,
    // in logits mode the server only buffers it to score prosody at the end.
    socketRef.current.emit('chunk', resampled.buffer);
    if (sessionModeRef.current === 'logits' && workerRef.current) {
      pendingChunksRef.current += 1;
      workerRef.current.postMessage({ type: 'chunk', audio: resampled });
    }
  };

  const emitStop = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (stopPendingRef.current) {
      stopPendingRef.current = false;
      socketRef.current?.emit('stop');
    }
  };

  // In logits mode chunks may still be inside the worker when the user stops;
  // wait for them to drain so the tail of the utterance is scored too.
  const requestStop = () => {
    if (sessionModeRef.current === 'logits' && pendingChunksRef.current > 0) {
      stopPendingRef.current = true;
      stopTimeoutRef.current = setTimeout(emitStop, 5000); // don't hang if the worker dies
    } else {
      socketRef.current?.emit('stop');
    }
  };

  const startRecording = async () => {
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
    setProsody(null);

    // Lock the pipeline for this session: on-device inference if the worker
    // finished loading, otherwise stream raw audio for server-side inference.
    sessionModeRef.current = workerReadyRef.current ? 'logits' : 'audio';
    pendingChunksRef.current = 0;
    stopPendingRef.current = false;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (prosodyTimeoutRef.current) {
      clearTimeout(prosodyTimeoutRef.current);
      prosodyTimeoutRef.current = null;
    }

    // Store session metadata so the 'connect' listener can emit 'start'
    const socket = socketRef.current;
    if (socket.connected) socket.disconnect();
    pendingSessionRef.current = { sentence, words_ipa, mode: sessionModeRef.current };
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

    // ScriptProcessorNode is deprecated but avoids needing a separate worklet file
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
      requestStop(); // ask server to finalize (after worker drains, in logits mode); disconnect happens in handleFinalResult
      stopRecording();
    } else {
      startRecording();
    }
  };

  const goToNextSentence = async () => {
    sentencePassedRef.current = false;
    setDoneSentence(false);
    if (cardData && cardData[(currentSentenceIndex + 1).toString()]) {
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

      fetch(`${API_BASE}/api/user/updateUserProgress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          lessonId: currentLessonId,
          addScore: (score / 700) || 0.1,
          wordScores: wordScoresRef.current
        })
      }).catch(err => console.error('Failed to update user progress:', err));

      try {
        await fetch(`${API_BASE}/api/user/generatenextlesson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, currentLessonId: currentLessonId }),
        });
      } catch (err) {
        console.error('Failed to generate next lesson:', err);
      }
    }
  }

  if (showIntro) {
    const embedUrl = introVideo ? buildEmbedUrl(introVideo.videoId, introVideo.start) : null;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        textAlign: 'center',
        padding: 24
      }}>
        <Back />
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Watch this example first</h2>
        {embedUrl ? (
          <iframe
            title="intro-video"
            src={embedUrl}
            width="640"
            height="360"
            style={{ borderRadius: 12, marginBottom: '2rem' }}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>Loading video...</div>
        )}
        <button
          onClick={() => setShowIntro(false)}
          style={{
            padding: '12px 24px',
            borderRadius: 25,
            border: 'none',
            background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
            color: 'white',
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
          }}
        >
          Start Lesson
        </button>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        textAlign: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉 Lesson Complete!</h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>Great job practicing your pronunciation!</p>
          <button
            onClick={() => window.location.href = '/app'}
            style={{
              padding: '12px 24px',
              borderRadius: 25,
              border: 'none',
              background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
              color: 'white',
              fontSize: '1.1rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      <Toaster position="top-center" />
      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [-15, 8, 10], fov: 50 }}
        shadows
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Sky distance={450000} sunPosition={[2, 1, 0]} inclination={0.45} azimuth={0.25} />
          <Environment preset="sunset" background={false} />

          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.01, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#6aa84f" roughness={1} metalness={0} />
          </mesh>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, -1.0, 0]} receiveShadow>
            <planeGeometry args={[30, 4]} />
            <meshStandardMaterial color="#333" roughness={0.9} metalness={0.1} />
          </mesh>

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

          <OrbitControls enablePan={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
        </Suspense>
      </Canvas>

      <Back />
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
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              width: '50%',
              maxWidth: 600,
              background: 'white',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              position: 'relative'
            }}>
              <button
                onClick={() => {
                  setFeedbackText('')
                  window.speechSynthesis.cancel()
                }}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
              <h3 style={{ marginTop: 0, marginBottom: 16, color: '#333' }}>Feedback</h3>
              <div style={{ color: '#555', lineHeight: 1.6 }}>{feedbackText}</div>
            </div>
          </div>
        )}

        {doneSentence && (
          <button
            aria-label="Next lesson"
            onMouseEnter={() => setNextHover(true)}
            onMouseLeave={() => setNextHover(false)}
            onClick={() => {
              goToNextSentence();
              window.speechSynthesis.cancel()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderRadius: 999,
              cursor: 'pointer',
              background: nextHover
                ? 'linear-gradient(90deg, #ff8a00 0%, #e52e71 100%)'
                : 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
              color: '#fff',
              fontWeight: 700,
              boxShadow: nextHover ? '0 10px 30px rgba(229,46,113,0.35)' : '0 8px 24px rgba(107,115,255,0.18)',
              transform: nextHover ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 180ms ease',
              backdropFilter: 'blur(6px)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Record toggle button */}
      <div style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 30 }}>
        <button
          onClick={toggleRecording}
          style={{
            padding: '10px 14px',
            borderRadius: 20,
            border: 'none',
            background: isRecording
              ? 'linear-gradient(90deg, #ff6b6b, #ff4444)'
              : 'linear-gradient(90deg,#6dd3ff,#6b73ff)',
            color: 'white',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: isRecording
              ? '0 0 0 3px rgba(255,100,100,0.4)'
              : '0 8px 20px rgba(0,0,0,0.15)',
            animation: isRecording ? 'pulse 1.2s infinite' : 'none',
          }}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>
        <style>{`
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 3px rgba(255,100,100,0.4); }
            50% { box-shadow: 0 0 0 8px rgba(255,100,100,0.1); }
          }
        `}</style>
      </div>

      {/* Current sentence + live phoneme display */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '12px 20px',
        borderRadius: 12,
        backdropFilter: 'blur(6px)'
      }}>
        <div>Say this sentence:</div>
        <div style={{ fontWeight: 'bold', marginTop: 4 }}>
          {cardData ? cardData[currentSentenceIndex.toString()] || 'End of lesson' : 'Loading...'}
        </div>

        {currentWordsToIPA && (
          <div style={{ margin: '12px 0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {currentWordsToIPA.map(({ word, phonemes }, wordIdx) => {
                const returnedWord = wordResults?.[wordIdx];
                return (
                  <div key={word + wordIdx} style={{
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: 6,
                    color: '#333',
                    background: '#f9f9f9',
                    minWidth: 70,
                    marginBottom: 4,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 2, textAlign: 'center', fontSize: 13 }}>{word}</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {phonemes.map((ph, i) => {
                        let score = null;
                        if (returnedWord && returnedWord.phonemes[i] && returnedWord.phonemes[i].phoneme === ph) {
                          score = returnedWord.phonemes[i].score;
                        }
                        return (
                          <span
                            key={i}
                            style={{
                              ...getPhonemeStyle(score),
                              display: 'inline-block',
                              padding: '2px 5px',
                              borderRadius: 4,
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
    </div>
  )
}