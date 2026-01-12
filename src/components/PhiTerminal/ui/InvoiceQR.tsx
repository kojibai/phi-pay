import React, { useEffect, useRef, useState } from "react";
import * as QRCode from "qrcode";

export function InvoiceQR(props: {
  value: string;      // usually a URL
  size?: number;      // px
  label?: string;
}) {
  const size = props.size ?? 280;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);

    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = size;
        canvas.height = size;

        await QRCode.toCanvas(canvas, props.value, {
          margin: 1,
          errorCorrectionLevel: "M",
          width: size,
        });

        if (cancelled) return;
      } catch (e) {
        setErr((e as Error)?.message ?? "QR render failed");
      }
    })();

    return () => { cancelled = true; };
  }, [props.value, size]);

  if (err) {
    return (
      <div className="pt-muted">
        QR failed: {err}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {props.label ? <div className="pt-muted">{props.label}</div> : null}
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.92)",
        }}
      />
    </div>
  );
}
