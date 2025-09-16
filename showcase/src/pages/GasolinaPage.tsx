import React from "react";
import { Scene3D } from "../components/Scene3D";

const GasolinaPage: React.FC = () => {
  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 1
    }}>
      <Scene3D className="fullscreen-scene" />
    </div>
  );
};

export default GasolinaPage;
