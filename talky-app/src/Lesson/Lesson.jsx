import { Suspense, useRef, useState, useEffect, forwardRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations, Sky, Environment, ContactShadows } from '@react-three/drei'
import Back from './Back.jsx';

useGLTF.preload('/robot-draco.glb')

const Model = forwardRef(function Model(props, ref) {
  const { scene, animations } = useGLTF('/robot-draco.glb');
  const robot = scene.getObjectByName('Robot');
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


export default function Lesson({maxLessonId}) {
  const [nextHover, setNextHover] = useState(false)
  const [isRecordingBackend, setIsRecordingBackend] = useState(false)
  const [backendFilename, setBackendFilename] = useState(null)
  const [cardData, setCardData] = useState(null);
  const [actions, setActions] = useState(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(1);
  const [isFinished, setIsFinished] = useState(false);
  const [doneSentence, setDoneSentence] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [robotPos, setRobotPos] = useState([-10, -1, 0]);
  const robotRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  // Fetch lesson data
  useEffect(() => {
    fetch(`${API_BASE}/api/lessons`)
      .then((response) => response.json())
      .then((data) => {
        const parsedData = JSON.parse(data);
        setCardData(parsedData);
        console.log('Fetched lesson data:', parsedData);
      })
      .catch((error) => console.error("Error fetching data:", error));
  }, []);

  // Speak the first sentence
  useEffect(() => {
    if (cardData) {
      try{
        const currentSentence = cardData[currentSentenceIndex];
        console.log("cardData", cardData);
        const utterance = new SpeechSynthesisUtterance(currentSentence);
        window.speechSynthesis.speak(utterance);
      } catch(e){
        const currentSentence = cardData[currentSentenceIndex.toString()];
        const utterance = new SpeechSynthesisUtterance(currentSentence);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [cardData, currentSentenceIndex]);

  const startBackendRecording = async (seconds = 5) => {
    setIsRecordingBackend(true)
    setBackendFilename(null)
    try {
      const res = await fetch(`${API_BASE}/api/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: cardData[currentSentenceIndex.toString()] }),
      })
      const data = await res.json()
      console.log('Backend record response:', data)
      if (!res.ok) throw new Error(data.error || 'Record failed')
      setBackendFilename(data.filename)
      if (data.passed) {
        actions?.ThumbsUp?.play?.();
        const utter = new SpeechSynthesisUtterance("Great job!");
        window.speechSynthesis.speak(utter);
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
        console.log("no")
        actions && actions.No.play();
        // give feedback (text to speech)
        console.log('Feedback data:', data)
        const feedbackMsg = Array.isArray(data.feedback)
          ? data.feedback.map(f => (typeof f === 'string' ? f : `${f.word || ''} ${f.issue || ''}`.trim())).join(' ')
          : String(data.feedback || 'No, try again.')
        setFeedbackText(feedbackMsg)
        const utter = new SpeechSynthesisUtterance(feedbackMsg)
        window.speechSynthesis.speak(utter)
      }
    } catch (err) {
      console.error('Backend record error:', err)
      alert('Record failed: ' + err.message)
    } finally {
      setIsRecordingBackend(false)
    }
  }

  const goToNextSentence = async () => {
    setDoneSentence(false);
    if (cardData && cardData[(currentSentenceIndex + 1).toString()]) {
      setCurrentSentenceIndex(prev => prev + 1);
      if (actions) {
        Object.values(actions).forEach(action => action.stop());
        actions.Idle && actions.Idle.play();
      }
    } else {
      console.log('No more sentences');
      setIsFinished(true);
      if (actions) {
        Object.values(actions).forEach(action => action.stop());
        actions.Dance && actions.Dance.play();
      }

      const currentLessonId = parseInt(window.location.pathname.split('/').pop());
      const isLastLesson = currentLessonId === maxLessonId;
      if (isLastLesson) {
        try {
          await fetch(`${API_BASE}/api/generate-next-lesson`, { method: 'POST' });
          console.log('Next lesson generated');
        } catch (err) {
          console.error('Failed to generate next lesson:', err);
        }
      }
    }
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
            onClick={() => window.location.href = '/'}
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
      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [-15, 8, 10], fov: 50 }}
        shadows
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Sky distance={450000} sunPosition={[2, 1, 0]} inclination={0.45} azimuth={0.25} />
          <Environment preset="sunset" background={false} />

          {/* sun */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

          {/* ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.01, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#6aa84f" roughness={1} metalness={0} />
          </mesh>

          {/* road and finish flag */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, -1.0, 0]} receiveShadow>
            <planeGeometry args={[30, 4]} />
            <meshStandardMaterial color="#333" roughness={0.9} metalness={0.1} />
          </mesh>

          <group position={[20, -1, 0]}>
            {/* pole */}
            <mesh position={[0, 1, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 2, 8]} />
              <meshStandardMaterial color="#444" />
            </mesh>
            {/* flag */}
            <mesh position={[0, 1.7, 0.45]} rotation={[0, Math.PI / 2, 0]} castShadow>
              <planeGeometry args={[1, 0.6]} />
              <meshStandardMaterial color="#e53935" side={2} />
            </mesh>
          </group>
          {/* soft contact shadow under model */}
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

      {/* feedback modal */}
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

        {/* next button - only show when finished*/}
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

      {/* record button */}
      <div style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 30 }}>
        <button
          onClick={() => startBackendRecording(5)}
          disabled={isRecordingBackend}
          style={{
            padding: '10px 14px',
            borderRadius: 20,
            border: 'none',
            background: isRecordingBackend ? '#ff6b6b' : 'linear-gradient(90deg,#6dd3ff,#6b73ff)',
            color: 'white',
            fontWeight: 700,
            cursor: isRecordingBackend ? 'default' : 'pointer',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}
        >
          {isRecordingBackend ? 'Recording...' : 'Record'}
        </button>
        {backendFilename && (
          <div style={{ marginTop: 8, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            Saved: {backendFilename}
          </div>
        )}
      </div>

      {/* Current sentence display */}
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
      </div>
    </div>
  )
}