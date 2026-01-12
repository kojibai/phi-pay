import React, { useEffect } from "react";

export function Toast(props: { text: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!props.text) return;
    const t = window.setTimeout(() => props.onDone(), 2800);
    return () => window.clearTimeout(t);
  }, [props.text, props.onDone]);

  if (!props.text) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 86,
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          maxWidth: 560,
          width: "100%",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,18,22,0.92)",
          color: "rgba(242,255,252,0.92)",
          padding: "12px 14px",
          fontWeight: 800,
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
        onClick={props.onDone}
      >
        {props.text}
      </div>
    </div>
  );
}
