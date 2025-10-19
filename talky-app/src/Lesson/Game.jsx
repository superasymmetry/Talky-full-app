import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

// Basic rotating box component
function RotatingBox({ position = [0, 0.7, 0], color = "#7c3aed" }) {
  const ref = useRef();
  // rotate the box each frame
  useFrame((state, delta) => {
    ref.current.rotation.x += delta * 0.6;
    ref.current.rotation.y += delta * 0.8;
  });

  return (
    <mesh ref={ref} position={position} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

// Ground / shadow receiver
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#111827" metalness={0} roughness={1} />
    </mesh>
  );
}

// Small HUD using <Html> from drei
function SceneHUD() {
  return (
    <Html position={[0, 2.2, 0]} center>
      <div className="bg-white/80 text-sm rounded-xl px-3 py-1 shadow-lg backdrop-blur">
        <strong className="block">react-three-fiber demo</strong>
        <span className="text-xs opacity-80">click + drag to orbit</span>
      </div>
    </Html>
  );
}

// Default export: single-file React component ready to drop in any app
export default function OneFileThreeFiber() {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="w-[90vw] h-[80vh] max-w-4xl rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5">
        <Canvas
          shadows
          camera={{ position: [3, 2, 5], fov: 50 }}
          style={{ background: "linear-gradient(#0f172a, #020617)" }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.25} />
          <directionalLight
            castShadow
            position={[5, 8, 5]}
            intensity={1}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={50}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />

          {/* Scene objects */}
          <RotatingBox position={[0, 0.8, 0]} color="#06b6d4" />
          <RotatingBox position={[-2, 0.7, -1]} color="#f97316" />
          <RotatingBox position={[2, 0.6, 1]} color="#a78bfa" />

          <Ground />

          {/* Camera controls */}
          <OrbitControls enablePan={true} enableZoom={true} />

          {/* Simple HUD */}
          <SceneHUD />
        </Canvas>
      </div>
    </div>
  );
}
