import React from "react";
import { normalizePhiInput, normalizeUsdInput, type UnitMode } from "../pricing/amountModel";
import { PhiGlyph } from "./PhiGlyph";

function addDigit(current: string, d: string, mode: UnitMode): string {
  if (!/^\d$/.test(d)) return current;
  const next = current === "0" ? d : current + d;
  return mode === "usd" ? normalizeUsdInput(next) : normalizePhiInput(next);
}

function addDot(current: string, mode: UnitMode): string {
  if (current.includes(".")) return current;
  const next = current + ".";
  return mode === "usd" ? normalizeUsdInput(next) : normalizePhiInput(next);
}

function backspace(current: string): string {
  if (current.length <= 1) return "0";
  const next = current.slice(0, -1);
  return next === "" || next === "-" ? "0" : next;
}

function normalize(current: string, mode: UnitMode): string {
  return mode === "usd" ? normalizeUsdInput(current) : normalizePhiInput(current);
}

export function AmountPad(props: {
  value: string;
  mode: UnitMode;
  onChange: (nextValue: string) => void;
  quick?: string[];
}) {
  const quick = props.quick ?? (props.mode === "usd" ? ["5", "10", "25", "50", "100"] : ["9", "18", "36", "72", "144"]);

  return (
    <div className="pt-pad">
      <div className="pt-padQuick">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            className="pt-padQuickBtn"
            onClick={() => props.onChange(normalize(q, props.mode))}
          >
            {props.mode === "usd" ? (
              `$${q}`
            ) : (
              <>
                <PhiGlyph className="pt-phiIcon pt-phiIcon--inline" />
                {q}
              </>
            )}
          </button>
        ))}
        <button
          type="button"
          className="pt-padQuickBtn pt-padQuickClear"
          onClick={() => props.onChange("0")}
        >
          Clear
        </button>
      </div>

      <div className="pt-padGrid">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <button
            key={d}
            type="button"
            className="pt-padBtn"
            onClick={() => props.onChange(addDigit(props.value, d, props.mode))}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className="pt-padBtn"
          onClick={() => props.onChange(addDot(props.value, props.mode))}
        >
          .
        </button>
        <button
          type="button"
          className="pt-padBtn"
          onClick={() => props.onChange(addDigit(props.value, "0", props.mode))}
        >
          0
        </button>
        <button
          type="button"
          className="pt-padBtn"
          onClick={() => props.onChange(backspace(props.value))}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
