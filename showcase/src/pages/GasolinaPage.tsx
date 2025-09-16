import React, { useState } from "react";
import { Scene3D } from "../components/Scene3D";

const GasolinaPage: React.FC = () => {
  const [shouldZoom, setShouldZoom] = useState(false);

  const handleZoomClick = () => {
    console.log("Botón clickeado, shouldZoom actual:", shouldZoom);
    setShouldZoom(!shouldZoom);
  };

  return (
    <>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          margin: 0,
          padding: 0,
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      >
        <Scene3D className="fullscreen-scene" shouldZoom={shouldZoom} />
      </div>

      {/* Botón de zoom centrado */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <button
          onClick={handleZoomClick}
          style={{
            padding: "16px 32px",
            borderRadius: "16px",
            fontWeight: "600",
            color: "white",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            background: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
            boxShadow: "0 8px 32px rgba(139, 92, 246, 0.6)",
            backdropFilter: "blur(10px)",
            fontSize: "18px",
            minWidth: "220px",
            minHeight: "70px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            outline: "none",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow =
              "0 12px 40px rgba(139, 92, 246, 0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 8px 32px rgba(139, 92, 246, 0.6)";
          }}
        >
          {shouldZoom ? "Pagar sin XLM - Dale Gas" : "Reiniciar"}
        </button>
      </div>
    </>
  );
};

export default GasolinaPage;
