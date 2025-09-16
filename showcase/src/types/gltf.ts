import * as THREE from "three";

export interface GLTFNodes {
  [key: string]: THREE.Mesh;
}

export interface GLTFMaterials {
  [key: string]: THREE.Material;
}

export interface GLTFResult {
  nodes: GLTFNodes;
  materials: GLTFMaterials;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

// Tipos específicos para Datsun
export interface DatsunGLTFResult extends GLTFResult {
  nodes: {
    Cylinder007_alloy_0_1: THREE.Mesh;
    Cylinder007_alloy_0_2: THREE.Mesh;
    Cylinder007_alloy_0_3: THREE.Mesh;
    Cylinder007_alloy_0_4: THREE.Mesh;
    Cylinder007_alloy_0_5: THREE.Mesh;
    Cylinder007_alloy_0_6: THREE.Mesh;
    Cylinder007_alloy_0_7: THREE.Mesh;
    Cylinder007_alloy_0_8: THREE.Mesh;
    Cylinder007_alloy_0_9: THREE.Mesh;
    Cylinder007_alloy_0_10: THREE.Mesh;
    Cylinder007_alloy_0_11: THREE.Mesh;
    Cylinder007_alloy_0_12: THREE.Mesh;
  };
  materials: {
    alloy: THREE.Material;
    headlights: THREE.Material;
    black_paint: THREE.Material;
    tire: THREE.Material;
    black_matte: THREE.Material;
    chrome: THREE.Material;
    license: THREE.Material;
    orange_glass: THREE.Material;
    glass: THREE.Material;
    paint: THREE.Material;
    red_glass: THREE.Material;
    stickers: THREE.Material;
  };
}

// Tipos específicos para Cobra
export interface CobraGLTFResult extends GLTFResult {
  nodes: {
    Material2: THREE.Mesh;
    Material2007: THREE.Mesh;
    Material2009: THREE.Mesh;
    Material2010: THREE.Mesh;
    Material2012: THREE.Mesh;
    Material2018: THREE.Mesh;
    Material2029: THREE.Mesh;
    Material2037: THREE.Mesh;
    Material2040: THREE.Mesh;
    Material2066: THREE.Mesh;
    Material2067: THREE.Mesh;
    Material2068: THREE.Mesh;
    Material2071: THREE.Mesh;
    Material2078: THREE.Mesh;
    Material2079: THREE.Mesh;
    Material3004: THREE.Mesh;
  };
  materials: {
    PaletteMaterial001: THREE.Material;
    Suede_Green: THREE.Material;
    PaletteMaterial002: THREE.Material;
    PaletteMaterial003: THREE.Material;
    PaletteMaterial004: THREE.Material;
    Translucent_Glass_Corrugated: THREE.Material;
    PaletteMaterial005: THREE.Material;
    Metal_Silver: THREE.Material;
    PaletteMaterial006: THREE.Material;
    MT__15_2: THREE.Material;
    MT__15: THREE.Material;
    MT__15_1_0: THREE.Material;
    MT__15_1: THREE.Material;
    Groundcover_BarkChips: THREE.Material;
    Groundcover_Rock_Crushed_Multi_1: THREE.Material;
    MT__15__1: THREE.Material;
  };
}
