import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, Sky, useAnimations, useGLTF } from '@react-three/drei'
import { Suspense, forwardRef, useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast';

import Back from './Back.jsx';
import { useMatch } from 'react-router-dom';
import { io } from 'socket.io-client';

import { speakText, stopSpeech } from '../tts.js';

useGLTF.preload('/robot-draco.glb')

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

// To ensure that tainted data is validated before being used to construct a client-side request URL
const VALID_USER_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const getValidUserId = (key) => {
  const id = localStorage.getItem(key) || 'demo';
  return VALID_USER_ID.test(id) ? id : 'demo';
};

export default function Lesson() {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
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
  const videoUrl = "https://youtu.be/IwWw6Xe09O0?t=31";
  const [score, setScore] = useState(0);
  const [wordsToIPA, setWordsToIPA] = useState(null);
  const [currentWordsToIPA, setCurrentWordsToIPA] = useState(null);
  const [wordResults, setWordResults] = useState([]);
  const wordScoresRef = useRef([]);
  const skipNextSentenceSpeechRef = useRef(false);

  const encouragementPhrases = [
    'Nice work.',
    'Great job.',
    'You got it.',
    'Keep going.'
  ];

  const retryPhrases = [
    'Let us try that again.',
    'Almost there.',
    'Give that one more try.',
    'You are close.'
  ];

  const pickPhrase = (phrases) => {
    if (!phrases || phrases.length === 0) return '';

    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);

    return phrases[array[0] % phrases.length];
  };
  
  const speakSentence = (sentence) => {
    stopSpeech();
    return speakText(sentence).catch((err) => {
      console.warn('TTS failed', err);
    });
  };

  // Audio + socket refs
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const accumChunksRef = useRef([]);
  const chunkIntervalRef = useRef(null);
  const pendingSessionRef = useRef(null); // holds { sentence, words_ipa } until connect fires

  const toEmbed = (u) => {
    try {
      if (!u) return null;
      const url = new URL(u);
      const v = url.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (url.hostname === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
      return u;
    } catch (e) { console.error("Error parsing URL:", e); return null; }
  }

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

    return () => {
      socket.off('connect');
      socket.off('partial_result');
      socket.off('result');
      socket.disconnect();
    };
  }, []);

  // Show expected phonemes as soon as the sentence changes
  useEffect(() => {
    if (wordsToIPA && currentSentenceIndex > 0) {
      setCurrentWordsToIPA(wordsToIPA[currentSentenceIndex - 1] || null);
      setWordResults([]);
    }
  }, [wordsToIPA, currentSentenceIndex]);

  // Fetch lesson data
  useEffect(() => {
    const userId = getValidUserId('user_id');
    fetch(`${API_BASE}/api/lessons?user_id=${encodeURIComponent(userId)}&lesson_id=${encodeURIComponent(lessonId)}`)
      .then((response) => response.json())
      .then((data) => {
        setCardData(data.sentences ?? data);
        const ipas = data.words_to_ipas;
        if (!ipas || ipas.length === 0) {
          toast.error('Phoneme data failed to load. Please reload the page.');
        }
        setWordsToIPA(ipas);
      })
      .catch((error) => console.error("Error fetching data:", error));
  }, [API_BASE, lessonId]);

  // TTS for current sentence
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

  // display percent progress for each phoneme
  

  const startBackendRecording = async () => {
    setIsRecordingBackend(true)
    setBackendFilename(null)
    stopSpeech();
    try {
      const res = await fetch(`${API_BASE}/api/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: cardData[currentSentenceIndex.toString()], expected_ipa: expectedIPAs[currentSentenceIndex - 1] }),
      })
      const data = await res.json()
      console.log('Backend record response:', data)
      if (!res.ok) throw new Error(data.error || 'Record failed')

      setBackendFilename(data.filename)
      setReturnedWordsToIPA(data.res.map(({word, phonemes}) => ({
        word, phonemes
      })));
      setCurrentWordsToIPA(wordsToIPA[currentSentenceIndex - 1] || null);
      if (data.passed) {
        wordScoresRef.current.push(...extractWordScores(data.res));
        actions?.ThumbsUp?.play?.();
        setScore(score => (score ?? 0) + data.score);
        speakSentence(pickPhrase(encouragementPhrases));
        setDoneSentence(true);
        actions?.Walking?.play?.();
        // Move robot forward along its facing
        if (robotRef.current) {
          robotRef.current.translateZ(30 / 7);
          robotRef.current.updateMatrixWorld();
          const p = robotRef.current.position;
          setRobotPos([p.x, p.y, p.z]);
        }
        actions?.Idle?.play?.();
      } else {
        actions && actions.No.play();
        // reduce score
        setScore(score => Math.max(0, (score ?? 0) - (100 - data.score)));
        // give feedback (text to speech)
        console.log('Feedback data:', data)
        const feedbackMsg = Array.isArray(data.feedback)
          ? data.feedback.map(f => (typeof f === 'string' ? f : `${f.word || ''} ${f.issue || ''}`.trim())).join(' ')
          : String(data.feedback || 'No, try again.')
        setFeedbackText(feedbackMsg)
        speakSentence(`${pickPhrase(retryPhrases)} ${feedbackMsg}`)
      }
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
      socketRef.current?.emit('stop'); // ask server to finalize; disconnect happens in handleFinalResult
      stopRecording();
    } else {
      startRecording();
    }
  };

  const goToNextSentence = async () => {
    sentencePassedRef.current = false;
    setDoneSentence(false);
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

      const userId = getValidUserId('userId');
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
        {videoUrl ? (
          <iframe
            title="intro-video"
            src={toEmbed(videoUrl)}
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
          onClick={() => {
            const currentSentence = cardData?.[String(currentSentenceIndex)] || cardData?.[currentSentenceIndex] || '';
            skipNextSentenceSpeechRef.current = true;
            setShowIntro(false);
            if (currentSentence) {
              speakSentence(currentSentence);
            }
          }}
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

        {/* next button - only show when finished*/}
        {doneSentence && (
          <button
            aria-label="Next lesson"
            onMouseEnter={() => setNextHover(true)}
            onMouseLeave={() => setNextHover(false)}
            onClick={() => {
              goToNextSentence();
              stopSpeech()
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
      </div>
    </div>
  )
}
