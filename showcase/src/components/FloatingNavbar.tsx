import { Button, Icon, Layout } from "@stellar/design-system";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleWithGasolina = () => {
    onModeChange("with-gasolina");
    navigate("/with-gasolina");
  };

  const handleWithoutGasolina = () => {
    onModeChange("without-gasolina");
    navigate("/");
  };

  return (
    <div
      style={{
        position: "fixed",
        backgroundColor: "transparent",
        zIndex: 1000,
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
        <Button
          variant={currentMode === "with-gasolina" ? "primary" : "tertiary"}
          size={isMobile ? "md" : "lg"}
          onClick={handleWithGasolina}
          style={{
            borderRadius: isMobile ? "20px" : "30px",
            padding: isMobile ? "8px 16px" : "12px 24px",
            fontWeight: "600",
            transition: "all 0.3s ease",
            background:
              currentMode === "with-gasolina"
                ? "linear-gradient(135deg, #ff9621, #ff6b35)"
                : "transparent",
            color: currentMode === "with-gasolina" ? "white" : "#666",
            border:
              currentMode === "with-gasolina"
                ? "none"
                : "1px solid rgba(0, 0, 0, 0.1)",
            boxShadow:
              currentMode === "with-gasolina"
                ? "0 6px 20px rgba(255, 150, 33, 0.4)"
                : "none",
            fontSize: isMobile ? "12px" : "14px",
            minWidth: isMobile ? "100px" : "140px",
          }}
        >
          <Icon.Car01
            size={isMobile ? "sm" : "md"}
            style={{ marginRight: isMobile ? "6px" : "10px" }}
          />
          {isMobile ? "With" : "With Gasolina"}
        </Button>

        <Button
          variant={currentMode === "without-gasolina" ? "primary" : "tertiary"}
          size={isMobile ? "md" : "lg"}
          onClick={handleWithoutGasolina}
          style={{
            borderRadius: isMobile ? "20px" : "30px",
            padding: isMobile ? "8px 16px" : "12px 24px",
            fontWeight: "600",
            transition: "all 0.3s ease",
            background:
              currentMode === "without-gasolina"
                ? "linear-gradient(135deg, #667eea, #764ba2)"
                : "transparent",
            color: currentMode === "without-gasolina" ? "white" : "#666",
            border:
              currentMode === "without-gasolina"
                ? "none"
                : "1px solid rgba(0, 0, 0, 0.1)",
            boxShadow:
              currentMode === "without-gasolina"
                ? "0 6px 20px rgba(102, 126, 234, 0.4)"
                : "none",
            fontSize: isMobile ? "12px" : "14px",
            minWidth: isMobile ? "100px" : "140px",
          }}
        >
          <Icon.Car01
            size={isMobile ? "sm" : "md"}
            style={{ marginRight: isMobile ? "6px" : "10px" }}
          />
          {isMobile ? "Without" : "Without Gasolina"}
        </Button>
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
