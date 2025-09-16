import React from "react";

interface CarStatsProps {
  isVisible: boolean;
}

interface StatItem {
  label: string;
  value: string;
  unit?: string;
  icon: string;
}

export const CarStats: React.FC<CarStatsProps> = ({ isVisible }) => {
  const stats: StatItem[] = [
    {
      label: "Velocidad Máxima",
      value: "180",
      unit: "km/h",
      icon: "🏁",
    },
    {
      label: "Aceleración 0-100",
      value: "8.5",
      unit: "s",
      icon: "⚡",
    },
    {
      label: "Potencia",
      value: "150",
      unit: "HP",
      icon: "🔥",
    },
    {
      label: "Consumo",
      value: "12.5",
      unit: "L/100km",
      icon: "⛽",
    },
    {
      label: "Peso",
      value: "1,200",
      unit: "kg",
      icon: "⚖️",
    },
    {
      label: "Año",
      value: "1972",
      icon: "📅",
    },
  ];

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: "60px",
        top: "50%",
        transform: "translateY(-50%)",
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(20px)",
        borderRadius: "20px",
        padding: "32px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
        minWidth: "280px",
        zIndex: 1000,
        animation: "slideInFromRight 0.8s ease-out",
      }}
    >
      <div
        style={{
          marginBottom: "24px",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            color: "#ff9621",
            fontSize: "24px",
            fontWeight: "700",
            margin: "0 0 8px 0",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)",
          }}
        >
          Datsun 240K GT
        </h3>
        <p
          style={{
            color: "rgba(255, 255, 255, 0.7)",
            fontSize: "14px",
            margin: 0,
            fontWeight: "500",
          }}
        >
          Especificaciones Técnicas
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {stats.map((stat, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "12px 16px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`,
            }}
          >
            <div
              style={{
                fontSize: "24px",
                minWidth: "32px",
                textAlign: "center",
              }}
            >
              {stat.icon}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  fontSize: "12px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {stat.label}
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    fontWeight: "700",
                  }}
                >
                  {stat.value}
                </span>
                {stat.unit && (
                  <span
                    style={{
                      color: "#ff9621",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    {stat.unit}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateY(-50%) translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
