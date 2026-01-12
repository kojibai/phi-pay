import React from "react";

function clampPhiString(s: string): string {
  // Keep only digits + single dot, limit to 6 decimals, remove leading zeros safely.
  const raw = s.replace(/[^\d.]/g, "");
  const parts = raw.split(".");
  const a = parts[0] ?? "";
  const b = parts[1] ?? "";
  const int = a.replace(/^0+(?=\d)/, "");
  const dec = b.slice(0, 6);
  return parts.length > 1 ? `${int || "0"}.${dec}` : (int || "0");
}

function addDigit(current: string, d: string): string {
  if (!/^\d$/.test(d)) return current;
  return clampPhiString(current === "0" ? d : current + d);
}

function addDot(current: string): string {
  if (current.includes(".")) return current;
  return current + ".";
}

function backspace(current: string): string {
  if (current.length <= 1) return "0";
  const next = current.slice(0, -1);
  return next === "" || next === "-" ? "0" : next;
}

function normalize(current: string): string {
  return clampPhiString(current);
}

export function AmountPad(props: {
  valuePhi: string;
  onChange: (nextPhi: string) => void;
  quick?: string[];
}) {
  const quick = props.quick ?? ["9", "18", "36", "72", "144", "288"];

  const btn: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(242,255,252,0.92)",
    padding: "14px 0",
    fontWeight: 900,
    fontSize: 18,
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginTop: 12,
  };

  const quickRow: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  };

  const quickBtn: React.CSSProperties = {
    borderRadius: 999,
    border: "1px solid rgba(55,255,228,0.22)",
    background: "rgba(55,255,228,0.07)",
    color: "rgba(55,255,228,0.95)",
    padding: "8px 12px",
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  return (
    <div>
      <div style={quickRow}>
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            style={quickBtn}
            onClick={() => props.onChange(normalize(q))}
          >
            {q} Φ
          </button>
        ))}
        <button
          type="button"
          style={{
            ...quickBtn,
            borderColor: "rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(242,255,252,0.78)",
          }}
          onClick={() => props.onChange("0")}
        >
          Clear
        </button>
      </div>

      <div style={grid}>
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <button key={d} type="button" style={btn} onClick={() => props.onChange(addDigit(props.valuePhi, d))}>
            {d}
          </button>
        ))}
        <button type="button" style={btn} onClick={() => props.onChange(addDot(props.valuePhi))}>
          .
        </button>
        <button type="button" style={btn} onClick={() => props.onChange(addDigit(props.valuePhi, "0"))}>
          0
        </button>
        <button type="button" style={btn} onClick={() => props.onChange(backspace(props.valuePhi))}>
          ⌫
        </button>
      </div>
    </div>
  );
}
