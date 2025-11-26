import * as THREE from 'three'
import { Suspense, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations, Sky, Environment, ContactShadows } from '@react-three/drei'

function Cube(props) {
  const ref = useRef()
  const [hovered, hover] = useState(false)
  const [clicked, click] = useState(false)
  useFrame((state, delta) => (ref.current.rotation.x += delta))

  return (
    <mesh
      {...props}
      ref={ref}
      scale={clicked ? 1.5 : 1}
      onClick={(event) => click(!clicked)}
      onPointerOver={(event) => hover(true)}
      onPointerOut={(event) => hover(false)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? 'green' : 'orange'} />
    </mesh>
  )
}

useGLTF.preload('/robot-draco.glb')

function Model(props) {
  const { scene, animations } = useGLTF('/robot-draco.glb')
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    console.log('Available actions:', Object.keys(actions))
    if (actions.Idle) {
      actions.Idle.play()
    } else if (Object.keys(actions).length > 0) {
      const firstAction = Object.values(actions)[0]
      firstAction.play()
    }
    scene.traverse((obj) => obj.isMesh && (obj.receiveShadow = obj.castShadow = true))
  }, [actions, scene, animations])

  return <primitive object={scene} {...props} />
}


export default function TestCube() {
  const [nextHover, setNextHover] = useState(false)
  const [isRecordingBackend, setIsRecordingBackend] = useState(false)
  const [backendFilename, setBackendFilename] = useState(null)
  const [cardData, setCardData] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/lessons")
      .then((response) => response.json())
      .then((data) => {
        const parsedData = JSON.parse(data);
        setCardData(parsedData);
      })
      .catch((error) => console.error("Error fetching data:", error));
  }, []);

  const startBackendRecording = async (seconds = 5) => {
    setIsRecordingBackend(true)
    setBackendFilename(null)
    try {
      const res = await fetch('http://localhost:8080/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: cardData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Record failed')
      setBackendFilename(data.filename)
      console.log('Recorded on server:', data.filename)
    } catch (err) {
      console.error('Backend record error:', err)
      alert('Record failed: ' + err.message)
    } finally {
      setIsRecordingBackend(false)
    }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [0, 1.6, 3], fov: 50 }}
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

          {/* soft contact shadow under model */}
          <ContactShadows position={[0, -1, 0]} opacity={0.6} width={4} height={4} blur={2} far={2} />

          <Model position={[0, -1, 0]} scale={0.5} rotation={[0, 0, 0]} />

          <OrbitControls enablePan={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
        </Suspense>
      </Canvas>

      <div
        style={{
          position: 'absolute',
          right: 24,
          bottom: 24,
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        {/* next button */}
        <button
          aria-label="Next lesson"
          onMouseEnter={() => setNextHover(true)}
          onMouseLeave={() => setNextHover(false)}
          onClick={() => console.log('Next pressed')}
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
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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
    </div>
  )
}
