import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const CurvedGasolinaText: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  // Configuración del cilindro
  const radius = 12; // Radio del cilindro alrededor del auto
  const textCount = 12; // Número de instancias
  const colors = [
    "#ff6b35",
    "#7b1fa2",
    "#00acc1",
    "#ffa726",
    "#e53935",
    "#ffb300",
    "#4caf50",
    "#9c27b0",
  ];

  // Crear geometría de cubo para simular letras
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.2), []);

  useFrame((state) => {
    if (groupRef.current) {
      // Rotación lenta del grupo completo
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: textCount }, (_, i) => {
        const angle = (i / textCount) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 0.5 + Math.sin(i * 0.3) * 1; // Centrado en la altura del auto con variación sutil

        return (
          <mesh
            key={i}
            position={[x, y, z]}
            geometry={boxGeometry}
            rotation={[0, angle + Math.PI / 2, 0]}
          >
            <meshBasicMaterial
              color={colors[i % colors.length]}
              transparent
              opacity={0.4}
            />
          </mesh>
        );
      })}

      {/* Cubos adicionales en la parte superior */}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 2.5; // Altura del techo del auto

        return (
          <mesh
            key={`top-${i}`}
            position={[x, y, z]}
            geometry={boxGeometry}
            rotation={[0, angle + Math.PI / 2, 0]}
          >
            <meshBasicMaterial
              color={colors[i % colors.length]}
              transparent
              opacity={0.3}
            />
          </mesh>
        );
      })}

      {/* Cubos adicionales en la parte inferior */}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = -1; // Altura de las ruedas del auto

        return (
          <mesh
            key={`bottom-${i}`}
            position={[x, y, z]}
            geometry={boxGeometry}
            rotation={[0, angle + Math.PI / 2, 0]}
          >
            <meshBasicMaterial
              color={colors[i % colors.length]}
              transparent
              opacity={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
};
