import React from "react";
import { PortalView } from "./components/PhiTerminal";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./components/PhiTerminal/terminal.css";

const statusStyles: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  background: "rgba(10, 18, 22, 0.9)",
  border: "1px solid rgba(111, 255, 220, 0.25)",
  padding: "8px 12px",
  borderRadius: 12,
  color: "#F2FFFC",
  fontSize: 12,
  zIndex: 10,
  display: "flex",
  gap: 8,
  alignItems: "center"
};

export default function App() {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered() {
      // no-op; indicator handles status
    }
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0A1216", color: "#F2FFFC" }}>
      <PortalView />

      {(offlineReady || needRefresh) && (
        <div style={statusStyles}>
          <span>{needRefresh ? "Update available" : "Offline ready"}</span>
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              style={{
                background: "#6FFFDc",
                color: "#0A1216",
                border: "none",
                borderRadius: 8,
                padding: "4px 8px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Update
            </button>
          )}
        </div>
      )}
    </div>
  );
}
