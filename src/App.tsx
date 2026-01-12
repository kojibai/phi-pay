import React, { useEffect, useMemo, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PortalView } from "./components/PhiTerminal/PhiTerminal";
import "./components/PhiTerminal/terminal.css";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  background: "#0A1216",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  padding: "16px",
  boxSizing: "border-box"
};

const panelStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "980px",
  minHeight: "calc(100vh - 32px)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  borderRadius: "20px",
  overflow: "hidden",
  background: "#0A1216"
};

const badgeBase: React.CSSProperties = {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  padding: "10px 14px",
  borderRadius: "999px",
  background: "rgba(15, 24, 30, 0.9)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#F2FFFC",
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  zIndex: 10
};

export default function App() {
  const {
    offlineReady: offlineReadyState,
    needRefresh,
    updateServiceWorker
  } = useRegisterSW();

  const [offlineReady, setOfflineReady] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  useEffect(() => {
    if (offlineReadyState) {
      setOfflineReady(true);
    }
  }, [offlineReadyState]);

  const showUpdate = needRefresh && !dismissedUpdate;

  const offlineBadge = useMemo(() => {
    if (!offlineReady) return null;
    return (
      <div style={badgeBase} role="status" aria-live="polite">
        <span>Offline Ready</span>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "#37FFE4",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }, [offlineReady]);

  const updateBadge = useMemo(() => {
    if (!showUpdate) return null;
    return (
      <div style={badgeBase} role="status" aria-live="polite">
        <span>Update available</span>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          style={{
            background: "#37FFE4",
            border: "none",
            color: "#081015",
            fontWeight: 700,
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: "999px"
          }}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setDismissedUpdate(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "#F2FFFC",
            cursor: "pointer"
          }}
        >
          Later
        </button>
      </div>
    );
  }, [showUpdate, updateServiceWorker]);

  return (
    <div style={shellStyle}>
      <div style={panelStyle}>
        <PortalView />
      </div>
      {offlineBadge}
      {updateBadge}
    </div>
  );
}
