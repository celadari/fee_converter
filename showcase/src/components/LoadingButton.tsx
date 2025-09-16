import React, { useState } from "react";

interface LoadingButtonProps {
  onPress?: () => void;
  onRelease?: () => void;
  onSuccess?: () => void;
}

type ButtonState = "idle" | "loading" | "success" | "error";

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  onPress,
  onRelease,
  onSuccess,
}) => {
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const [isPressed, setIsPressed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressInterval, setProgressInterval] =
    useState<NodeJS.Timeout | null>(null);

  const handleMouseDown = () => {
    setIsPressed(true);
    setButtonState("loading");
    setProgress(0);
    onPress?.();

    // Iniciar el efecto de termómetro solo mientras esté presionado
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // Si llega al 100%, automáticamente simular resultado
          clearInterval(interval);
          setProgressInterval(null);

          // Simular resultado inmediatamente
          setTimeout(() => {
            const isSuccess = Math.random() > 0.3;
            setButtonState(isSuccess ? "success" : "error");

            // Llamar callback de éxito si es exitoso
            if (isSuccess) {
              onSuccess?.();
            }

            // Resetear después de 2 segundos
            setTimeout(() => {
              setButtonState("idle");
              setProgress(0);
            }, 2000);
          }, 100);

          return 100;
        }
        return prev + 2; // Incrementa 2% cada 50ms (2 segundos total)
      });
    }, 50);

    setProgressInterval(interval);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
    onRelease?.();

    // Limpiar el intervalo inmediatamente al soltar
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }

    // Solo mostrar resultado si no llegó al 100%
    if (progress < 100) {
      // Simular resultado después de un breve delay
      setTimeout(() => {
        // Mock: 70% probabilidad de éxito, 30% de error
        const isSuccess = Math.random() > 0.3;
        setButtonState(isSuccess ? "success" : "error");

        // Llamar callback de éxito si es exitoso
        if (isSuccess) {
          onSuccess?.();
        }

        // Resetear después de 2 segundos
        setTimeout(() => {
          setButtonState("idle");
          setProgress(0);
        }, 2000);
      }, 100);
    }
  };

  const handleMouseLeave = () => {
    if (isPressed) {
      setIsPressed(false);
      setButtonState("idle");
      setProgress(0);

      // Limpiar el intervalo
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
    }
  };

  const getButtonContent = () => {
    switch (buttonState) {
      case "loading":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                borderRadius: "50%",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${progress}%`,
                  background: "linear-gradient(to bottom, #60A5FA, #3B82F6)",
                  transition: "height 0.1s ease",
                  borderRadius: "50%",
                }}
              />
            </div>
            <span style={{ fontSize: "16px", fontWeight: "600" }}>
              {Math.round(progress)}%
            </span>
          </div>
        );
      case "success":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "#10B981" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span style={{ fontSize: "16px", fontWeight: "600" }}>¡Éxito!</span>
          </div>
        );
      case "error":
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "#EF4444" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span style={{ fontSize: "16px", fontWeight: "600" }}>Error</span>
          </div>
        );
      default:
        return (
          <span style={{ fontSize: "16px", fontWeight: "600" }}>
            Mantén presionado
          </span>
        );
    }
  };

  const getButtonStyles = () => {
    const baseStyles: React.CSSProperties = {
      padding: "16px 32px",
      borderRadius: "16px",
      fontWeight: "600",
      color: "white",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      cursor: "pointer",
      transition: "all 0.3s ease",
      transform: isPressed ? "scale(0.95)" : "scale(1)",
      minWidth: "200px",
      minHeight: "60px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(10px)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      userSelect: "none",
      outline: "none",
    };

    switch (buttonState) {
      case "loading":
        return {
          ...baseStyles,
          background: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
          boxShadow: "0 8px 32px rgba(59, 130, 246, 0.4)",
        };
      case "success":
        return {
          ...baseStyles,
          background: "linear-gradient(135deg, #10B981, #059669)",
          boxShadow: "0 8px 32px rgba(16, 185, 129, 0.4)",
        };
      case "error":
        return {
          ...baseStyles,
          background: "linear-gradient(135deg, #EF4444, #DC2626)",
          boxShadow: "0 8px 32px rgba(239, 68, 68, 0.4)",
        };
      default:
        return {
          ...baseStyles,
          background: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
          boxShadow: "0 8px 32px rgba(139, 92, 246, 0.4)",
        };
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <button
        style={{
          ...getButtonStyles(),
          position: "relative",
          overflow: "hidden",
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        disabled={
          buttonState === "loading" ||
          buttonState === "success" ||
          buttonState === "error"
        }
      >
        {/* Efecto de llenado del botón como termómetro */}
        {buttonState === "loading" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${progress}%`,
              height: "100%",
              background: "linear-gradient(135deg, #60A5FA, #3B82F6)",
              transition: "width 0.1s ease",
              zIndex: 1,
            }}
          />
        )}

        {/* Contenido del botón */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {getButtonContent()}
        </div>
      </button>
    </div>
  );
};
