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

export default function App() {
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
    </div>
  );
}
