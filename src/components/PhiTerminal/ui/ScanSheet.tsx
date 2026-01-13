import React, { useMemo, useState } from "react";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";

export function ScanSheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  onScannedText: (text: string) => void;
}) {
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const scanner = useBarcodeScanner();

  const overlayStyle: React.CSSProperties = useMemo(() => ({
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 60,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: 12,
  }), []);

  const sheetStyle: React.CSSProperties = useMemo(() => ({
    width: "min(720px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,18,22,0.98)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
  }), []);

  if (!props.open) return null;

  return (
    <div style={overlayStyle} onClick={props.onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ fontWeight: 900, letterSpacing: "0.02em" }}>{props.title}</div>
          <div style={{ marginTop: 4, color: "rgba(242,255,252,0.72)", fontSize: 13.65 }}>
            Scan a receipt QR, or paste a receipt link / JSON / base64url payload.
          </div>
        </div>

        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="pt-btn primary"
              type="button"
              disabled={scanner.active}
              onClick={() => scanner.start((r) => {
                if ("text" in r) {
                  setMsg("Scanned.");
                  props.onScannedText(r.text);
                } else {
                  setMsg(r.error);
                }
              })}
            >
              {scanner.supported ? (scanner.active ? "Scanning…" : "Scan QR") : "Scan Unsupported"}
            </button>
            <button className="pt-btn" type="button" onClick={() => { scanner.stop(); props.onClose(); }}>
              Close
            </button>
          </div>

          {msg ? (
            <div className="pt-muted">{msg}</div>
          ) : null}

          <div className="pt-divider" />

          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Paste receipt URL or JSON here…"
            style={{
              width: "100%",
              minHeight: 120,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(242,255,252,0.92)",
              padding: 12,
              fontSize: 13.65,
              lineHeight: 1.35,
              outline: "none",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="pt-btn ok"
              type="button"
              disabled={manual.trim().length < 8}
              onClick={() => props.onScannedText(manual.trim())}
            >
              Ingest Pasted
            </button>
            <button className="pt-btn" type="button" onClick={() => setManual("")}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
