import { Canvas } from "@react-three/fiber";
import {
  Center,
  AccumulativeShadows,
  RandomizedLight,
  Environment,
  OrbitControls,
} from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
//  import { useControls, button } from 'leva'
import { DatsunModel } from "./DatsunModel";
import { CurvedGasolinaText } from "./CurvedGasolinaText";
//  import { Effects } from './Effects'

interface Scene3DProps {
  className?: string;
  shouldZoom?: boolean;
}

// Componente interno para manejar la animación de zoom de la cámara
function CameraController({ shouldZoom }: { shouldZoom: boolean }) {
  const { camera } = useThree();
  const [isAnimating, setIsAnimating] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 4, y: 0, z: 6 });
  const currentPosition = useRef({ x: 4, y: 0, z: 6 });

  useEffect(() => {
    console.log("CameraController: shouldZoom cambió a:", shouldZoom);
    setIsAnimating(true);
    if (shouldZoom) {
      // Posición más cercana al auto
      setTargetPosition({ x: 1, y: 0.5, z: 2 });
      console.log("Objetivo: acercar a [1, 0.5, 2]");
    } else {
      // Volver a la posición original
      setTargetPosition({ x: 4, y: 0, z: 6 });
      console.log("Objetivo: alejar a [4, 0, 6]");
    }
  }, [shouldZoom]);

  useFrame(() => {
    if (isAnimating) {
      // Interpolación suave hacia la posición objetivo
      const lerpFactor = 0.05;

      currentPosition.current.x +=
        (targetPosition.x - currentPosition.current.x) * lerpFactor;
      currentPosition.current.y +=
        (targetPosition.y - currentPosition.current.y) * lerpFactor;
      currentPosition.current.z +=
        (targetPosition.z - currentPosition.current.z) * lerpFactor;

      camera.position.set(
        currentPosition.current.x,
        currentPosition.current.y,
        currentPosition.current.z,
      );

      // Mirar hacia el centro del auto
      camera.lookAt(0, 0, 0);

      // Verificar si hemos llegado cerca de la posición objetivo
      const distance = Math.sqrt(
        Math.pow(targetPosition.x - currentPosition.current.x, 2) +
          Math.pow(targetPosition.y - currentPosition.current.y, 2) +
          Math.pow(targetPosition.z - currentPosition.current.z, 2),
      );

      if (distance < 0.1) {
        setIsAnimating(false);
      }
    }
  });

  return null;
}

export function Scene3D({ className, shouldZoom }: Scene3DProps) {
  //   const { color, realism, importanceSampling } = useControls({
  //     color: '#ff9621',
  //     realism: true,
  //     importanceSampling: true,
  //     screenshot: button(() => {
  //       const link = document.createElement('a')
  //       link.setAttribute('download', 'canvas.png')
  //       link.setAttribute('href', document.querySelector('canvas')?.toDataURL('image/png').replace('image/png', 'image/octet-stream') || '')
  //       link.click()
  //     })
  //   })
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        gl={{ antialias: false, preserveDrawingBuffer: true }}
        shadows
        camera={{ position: [4, 0, 6], fov: 35 }}
      >
        <CameraController shouldZoom={shouldZoom || false} />

        <group position={[0, -0.75, 0]}>
          <Center top>
            <DatsunModel color={"#ff9621"} />
          </Center>
          <AccumulativeShadows>
            <RandomizedLight position={[2, 5, 5]} />
          </AccumulativeShadows>
        </group>
        <OrbitControls
          makeDefault
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2}
        />

        {/* Texto curvado alrededor del auto como contenedor */}
        <CurvedGasolinaText />

        {/* {realism && <Effects importanceSampling={importanceSampling} />} */}
        <Environment preset="dawn" background blur={1} />
      </Canvas>
    </div>
  );
}
