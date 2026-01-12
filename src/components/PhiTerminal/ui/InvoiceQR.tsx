import React, { useEffect, useState } from "react";
import * as QRCode from "qrcode";

export function InvoiceQR(props: {
  value: string;      // usually a URL
  size?: number;      // px
  label?: string;
}) {
  const size = props.size ?? 220;
  const [err, setErr] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setDataUrl(null);

    (async () => {
      try {
        const url = await QRCode.toDataURL(props.value, {
          margin: 1,
          errorCorrectionLevel: "H",
          width: size,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        });
        if (cancelled) return;
        setDataUrl(url);
      } catch (e) {
        if (cancelled) return;
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
    <div className="pt-qr">
      {props.label ? <div className="pt-muted">{props.label}</div> : null}
      {dataUrl ? (
        <img
          src={dataUrl}
          width={size}
          height={size}
          alt={props.label ?? "Invoice QR"}
          className="pt-qrImage"
        />
      ) : (
        <div className="pt-qrPlaceholder">Generating…</div>
      )}
    </div>
  );
}
