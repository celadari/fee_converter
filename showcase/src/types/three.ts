// Tipos adicionales para Three.js y React Three Fiber
import * as THREE from 'three'

export interface GLTFNodes {
  [key: string]: THREE.Mesh
}

export interface GLTFMaterials {
  [key: string]: THREE.Material
}

export interface GLTFResult {
  nodes: GLTFNodes
  materials: GLTFMaterials
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}
