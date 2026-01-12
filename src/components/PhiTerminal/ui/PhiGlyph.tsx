import React from "react";

export function PhiGlyph(props: { className?: string; title?: string }) {
  return (
    <img
      className={props.className ?? "pt-phiIcon"}
      src="/phi.svg"
      alt={props.title ?? "Φ"}
    />
  );
}
