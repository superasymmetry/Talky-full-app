import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls, Stage, CameraShake, useAnimations } from '@react-three/drei'

useGLTF.preload('/robot-draco.glb') // Should match the file you're actually using

function PersonModel(props) {
  const { scene, animations } = useGLTF('/robot-draco.glb') // Use the same file
  const { actions } = useAnimations(animations, scene)
  
  useEffect(() => {
    if (actions.Idle) {
      actions.Idle.play()
    }
    scene.traverse((obj) => obj.isMesh && (obj.receiveShadow = obj.castShadow = true))
  }, [actions, scene])
  
  return <primitive object={scene} {...props} />
}

function Person3D({ className = "" }) {
  return (
    <div className={`w-full h-64 ${className}`}>
      <Canvas shadows camera={{ fov: 50 }}>
        <Suspense fallback={null}>
          <Stage contactShadow={{ opacity: 1, blur: 2 }}>
            <PersonModel />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
        
        <CameraShake
          maxYaw={0.1}
          maxPitch={0.05}
          maxRoll={0.05}
          yawFrequency={0.05}
          pitchFrequency={0.2}
          rollFrequency={0.2}
          intensity={1}
          decayRate={0.65}
        />
      </Canvas>
    </div>
  )
}

export default Person3D