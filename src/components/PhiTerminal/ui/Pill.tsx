import React from "react";

export type PillTone = "neutral" | "ok" | "bad" | "warn" | "aqua" | "gold";

export function Pill(props: { tone?: PillTone; text: string }) {
  const tone = props.tone ?? "neutral";
  const style: React.CSSProperties = {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(242,255,252,0.78)",
  };

  if (tone === "ok") {
    style.border = "1px solid rgba(0,255,160,0.25)";
    style.background = "rgba(0,255,160,0.07)";
    style.color = "rgba(0,255,160,0.95)";
  } else if (tone === "bad") {
    style.border = "1px solid rgba(255,80,80,0.25)";
    style.background = "rgba(255,80,80,0.07)";
    style.color = "rgba(255,140,140,0.95)";
  } else if (tone === "warn") {
    style.border = "1px solid rgba(255,190,80,0.22)";
    style.background = "rgba(255,190,80,0.08)";
    style.color = "rgba(255,210,140,0.95)";
  } else if (tone === "aqua") {
    style.border = "1px solid rgba(55,255,228,0.25)";
    style.background = "rgba(55,255,228,0.08)";
    style.color = "rgba(55,255,228,0.95)";
  } else if (tone === "gold") {
    style.border = "1px solid rgba(255,231,160,0.20)";
    style.background = "rgba(255,231,160,0.07)";
    style.color = "rgba(255,231,160,0.95)";
  }

  return <span style={style}>{props.text}</span>;
}
