import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import Back from "./Back.jsx";

function Robot({ position, scale }) {
  const { scene } = useGLTF('/robot-draco.glb');
  return <primitive object={scene} position={position} scale={scale} />;
}

const Tree = ({ position, size }) => {
  const direction = new THREE.Vector3(...position).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);

  return (
    <group position={position} quaternion={quaternion}>
      {/* Trunk */}
      <mesh position={[0, 0.5 * size, 0]}>
        <cylinderGeometry args={[0.1 * size, 0.15 * size, 1 * size, 8]} />
        <meshStandardMaterial color="#8B6F47" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 1.2 * size, 0]}>
        <coneGeometry args={[0.5 * size, 1 * size, 8]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
    </group>
  );
};

function Planet() {
  const groupRef = useRef();
  const keysPressed = useRef({});

  const trees = useMemo(() => {
    const NUMTREES = 20;
    const r = 1.5;
    const treels = [];
    
    for(let i = 0; i < NUMTREES; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      treels.push({
        position: [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)],
        size: 0.1 + Math.random() * 0.15
      });
    }

    return treels;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysPressed.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    const speed = 0.02;

    if (keysPressed.current['d']) groupRef.current.rotation.z += speed;
    if (keysPressed.current['a']) groupRef.current.rotation.z -= speed;
    if (keysPressed.current['w']) groupRef.current.rotation.x -= speed;
    if (keysPressed.current['s']) groupRef.current.rotation.x += speed;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1.5, 100, 100]} />
        <meshStandardMaterial color="#66BB6A" />
      </mesh>
      {trees.map((tree, i) => (
        <Tree key={i} position={tree.position} size={tree.size} />
      ))}
    </group>
  );
}

function Game() {
  return (
    <div style={{ position: "fixed", inset: 0, margin: 0, padding: 0, overflow: "hidden" }}>
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [0, 2, 5], fov: 75 }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        
        <Robot position={[0, 1.5, 0]} scale={0.1} />
        <Planet />
        <OrbitControls />
      </Canvas>
      <Back />
    </div>
  );
}

export default Game;