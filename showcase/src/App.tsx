import { Layout } from "@stellar/design-system";
import styles from "./App.module.css";
import { Routes, Route, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import { FloatingNavbar } from "./components/FloatingNavbar";

const AppLayout: React.FC = () => {
  const location = useLocation();
  const [currentMode, setCurrentMode] = useState<
    "with-gasolina" | "without-gasolina"
  >("without-gasolina");

  // Sincronizar el estado con la ruta actual
  useEffect(() => {
    if (location.pathname === "/with-gasolina") {
      setCurrentMode("with-gasolina");
    } else {
      setCurrentMode("without-gasolina");
    }
  }, [location.pathname]);

  const handleModeChange = (mode: "with-gasolina" | "without-gasolina") => {
    setCurrentMode(mode);
    // Aquí puedes agregar lógica para cambiar el modelo o efectos
    console.log("Mode changed to:", mode);
  };

  return (
    <main style={{ position: "relative" }}>
      {/* Navbar flotante que aparece en todas las páginas */}
      <FloatingNavbar
        currentMode={currentMode}
        onModeChange={handleModeChange}
      />

      {/* Contenido principal con padding para respetar el navbar */}
      <div className={styles.mainContent} style={{ paddingTop: "160px" }}>
        <Outlet />
      </div>

      <Layout.Footer>
        <span>
          © {new Date().getFullYear()} Gasolina 3D. Licensed under la{" "}
          <a
            href="http://www.apache.org/licenses/LICENSE-2.0"
            target="_blank"
            rel="noopener noreferrer"
          >
            Apache License, Version 2.0
          </a>
          .
        </span>
      </Layout.Footer>
    </main>
  );
};

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        {/* <Route path="with-gasolina" element={<GasolinaPage />} /> */}
      </Route>
    </Routes>
  );
}
