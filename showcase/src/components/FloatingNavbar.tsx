import { Layout } from "@stellar/design-system";
import { useState, useEffect } from "react";
import ConnectAccount from "./ConnectAccount";

interface FloatingNavbarProps {
  currentMode: "with-gasolina" | "without-gasolina";
  onModeChange: (mode: "with-gasolina" | "without-gasolina") => void;
}

export function FloatingNavbar({
  currentMode,
  onModeChange,
}: FloatingNavbarProps) {
  const [isMobile, setIsMobile] = useState(false);

  console.log(currentMode);
  console.log(onModeChange);
  console.log(isMobile);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        backgroundColor: "transparent",
        zIndex: 2,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.15)",
        transition: "all 0.3s ease",
        width: "100vw",
      }}
    >
      {/* Logo de Stellar */}
      <div
        style={{
          display: "flex",
          justifyContent: "start",
          gap: "24px",
          alignItems: "center",
        }}
      >
        <Layout.Header projectId="" projectTitle="" />
      </div>

      {/* Connect Account */}
      <div
        style={{
          display: "flex",
          alignItems: "end",
        }}
      >
        <ConnectAccount />
      </div>
    </div>
  );
}
