import React from "react";

export type PillTone = "neutral" | "ok" | "bad" | "warn" | "aqua" | "gold";

export function Pill(props: { tone?: PillTone; text: string }) {
  const tone = props.tone ?? "neutral";
  return <span className={`pt-pill pt-pill--${tone}`}>{props.text}</span>;
}
