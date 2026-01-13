import React, { useEffect, useMemo } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PortalView } from "./components/PhiTerminal/PhiTerminal";
import { PayView } from "./components/PhiTerminal/views/PayView";
import "./components/PhiTerminal/terminal.css";

const shellStyle: React.CSSProperties = {
  height: "100dvh",
  width: "100%",
  background: "#0A1216",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  padding: 0,
  boxSizing: "border-box",
  overflow: "hidden"
};

const panelStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  minHeight: "100%",
  boxShadow: "none",
  borderRadius: 0,
  overflow: "hidden",
  background: "#0A1216"
};

const versionBadgeStyle: React.CSSProperties = {
  position: "fixed",
  right: "20px",
  bottom: "20px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 12px",
  borderRadius: "999px",
  border: "1px solid rgba(159, 178, 191, 0.35)",
  background: "rgba(10, 18, 22, 0.85)",
  backdropFilter: "blur(6px)",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)",
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#9FB2BF",
  textDecoration: "none",
  opacity: 0.9,
  zIndex: 200
};

export default function App() {
  const appVersion = "v1.0.0";
  const {
    needRefresh,
    updateServiceWorker
  } = useRegisterSW();

  useEffect(() => {
    if (needRefresh) {
      void updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  const hasInvoiceParam = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const r = url.searchParams.get("r") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("r");
      return Boolean(r);
    } catch {
      return false;
    }
  }, []);

  return (
    <div style={shellStyle}>
      <div style={panelStyle}>
        {hasInvoiceParam ? <PayView /> : <PortalView />}
      </div>
      <a
        href="https://github.com/kojibai/phi-pay"
        style={versionBadgeStyle}
        target="_blank"
        rel="noreferrer"
      >
        {appVersion}
      </a>
    </div>
  );
}
