import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AmountPad } from "../ui/AmountPad";
import { createInvoice } from "../protocol/invoice";
import { b64urlEncodeString } from "../protocol/encode";
import { TerminalDB } from "../storage/terminalDB";
import { InvoiceQR } from "../ui/InvoiceQR";
import { ScanSheet } from "../ui/ScanSheet";
import { decodePayloadFromText, decodePayloadFromFile, ingestPayload } from "../transport/ingestTransport";
import { Pill } from "../ui/Pill";
import { listenLocalChannel } from "../transport/broadcastChannelTransport";
import { deriveSettlementFromSendSigilFileForInvoices, markSendSigilUsedFromMeta } from "../transport/sigilSettlement";

export function ChargeView(props: {
  merchantPhiKey: string;
  merchantLabel?: string;
  defaultAmountPhi: string;
}) {
  const [amountPhi, setAmountPhi] = useState<string>(props.defaultAmountPhi);
  const [memo, setMemo] = useState<string>("");
  const [activeInvoiceUrl, setActiveInvoiceUrl] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [status, setStatus] = useState<"READY" | "WAITING" | "SETTLED">("READY");
  const [scanOpen, setScanOpen] = useState(false);

  const invoiceJsonUrl = useMemo(() => {
    if (!activeInvoiceUrl) return null;
    return activeInvoiceUrl;
  }, [activeInvoiceUrl]);

  const buildInvoice = useCallback(async () => {
    // createdPulse is optional in your world; this terminal stays protocol-correct without requiring it.
    const createdPulse = 0;

    const inv = await createInvoice({
      merchantPhiKey: props.merchantPhiKey,
      merchantLabel: props.merchantLabel,
      amountPhi,
      memo: memo.trim() || undefined,
      createdPulse,
    });

    await TerminalDB.putInvoice(inv, "OPEN");

    const r = b64urlEncodeString(JSON.stringify(inv));
    const url = `${window.location.origin}${window.location.pathname}?r=${r}`;

    setActiveInvoiceId(inv.invoiceId);
    setActiveInvoiceUrl(url);
    setStatus("WAITING");
  }, [amountPhi, memo, props.merchantLabel, props.merchantPhiKey]);

  const reset = useCallback(() => {
    setActiveInvoiceUrl(null);
    setActiveInvoiceId(null);
    setStatus("READY");
  }, []);

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
  }, []);

  const ingestText = useCallback(async (text: string) => {
    const payload = await decodePayloadFromText(text);
    if (!payload) return;

    const res = await ingestPayload(payload);
    if (res.ok && res.kind === "settlement" && res.matchedInvoiceId && res.matchedInvoiceId === activeInvoiceId) {
      setStatus("SETTLED");
    }
    if (res.ok && res.kind === "invoice") {
      // ignore
    }
  }, [activeInvoiceId]);

  const ingestFile = useCallback(async (file: File) => {
    const payload = await decodePayloadFromFile(file);
    if (payload) {
      const res = await ingestPayload(payload);
      if (res.ok && res.kind === "settlement" && res.matchedInvoiceId && res.matchedInvoiceId === activeInvoiceId) {
        setStatus("SETTLED");
      }
      return;
    }

    const invoiceHint = activeInvoiceId ? await TerminalDB.getInvoice(activeInvoiceId) : null;
    const openInvoices = invoiceHint ? [invoiceHint] : await TerminalDB.getOpenInvoices();
    const derived = await deriveSettlementFromSendSigilFileForInvoices(file, openInvoices, activeInvoiceId ?? undefined);
    if (!derived) return;
    markSendSigilUsedFromMeta(derived.meta);
    const res = await ingestPayload(derived.settlement);
    if (res.ok && res.kind === "settlement" && res.matchedInvoiceId && res.matchedInvoiceId === activeInvoiceId) {
      setStatus("SETTLED");
    }
  }, [activeInvoiceId]);

  useEffect(() => {
    const off = listenLocalChannel(async (payload) => {
      if (payload.v !== "PHI-SETTLEMENT-1") return;
      const res = await ingestPayload(payload);
      if (res.ok && res.kind === "settlement" && res.matchedInvoiceId && res.matchedInvoiceId === activeInvoiceId) {
        setStatus("SETTLED");
      }
    });
    return () => off();
  }, [activeInvoiceId]);

  return (
    <div className="pt-split">
      <div className="pt-card pt-scroll">
        <div className="pt-cardInner">
          <div className="pt-h1">Charge</div>

          <div className="pt-amount">{amountPhi} Φ</div>
          <div className="pt-amountSub">
            {status === "READY" && "Set amount, then request payment."}
            {status === "WAITING" && "Customer scans to pay. Receipt settles this invoice."}
            {status === "SETTLED" && "✅ Settled. Receipt stored offline."}
          </div>

          <div className="pt-pillRow">
            {status === "READY" ? <Pill tone="neutral" text="Ready" /> : null}
            {status === "WAITING" ? <Pill tone="aqua" text="Waiting" /> : null}
            {status === "SETTLED" ? <Pill tone="ok" text="Settled" /> : null}
          </div>

          <div className="pt-divider" />

          <div className="pt-row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="pt-muted" style={{ fontWeight: 800, marginBottom: 6 }}>Memo (optional)</div>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Coffee • Kai Café"
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(242,255,252,0.92)",
                  padding: "12px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
          </div>

          <AmountPad value={amountPhi} mode="phi" onChange={setAmountPhi} />

          <div className="pt-actions">
            <button className="pt-btn primary" type="button" onClick={buildInvoice} disabled={status !== "READY" && status !== "SETTLED"}>
              {status === "READY" ? "Request Φ" : "New Charge"}
            </button>

            <button className="pt-btn" type="button" onClick={() => setScanOpen(true)} disabled={status === "READY"}>
              Scan Receipt
            </button>

            <label className="pt-btn" style={{ cursor: "pointer" }}>
              Import Receipt/File
              <input
                type="file"
                accept=".json,.svg,application/json,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) void ingestFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button className="pt-btn bad" type="button" onClick={reset} disabled={status === "READY"}>
              Reset
            </button>
          </div>

          {activeInvoiceId ? (
            <div className="pt-kv">
              <div className="pt-k">Invoice</div>
              <div className="pt-v">{activeInvoiceId}</div>
              <div className="pt-k">To</div>
              <div className="pt-v">{props.merchantPhiKey}</div>
            </div>
          ) : null}
        </div>

        {invoiceJsonUrl ? (
          <div className="pt-qrBox">
            <InvoiceQR value={invoiceJsonUrl} label="Scan to Pay (Invoice)" />
          </div>
        ) : null}
      </div>

      <div className="pt-card pt-scroll">
        <div className="pt-cardInner">
          <div className="pt-h1">Share</div>
          <div className="pt-muted" style={{ marginTop: 6 }}>
            This terminal is sovereign: the invoice is a verifiable payload, and the receipt is the proof.
          </div>

          <div className="pt-divider" />

          <div className="pt-actions">
            <button
              className="pt-btn"
              type="button"
              disabled={!invoiceJsonUrl}
              onClick={() => invoiceJsonUrl ? void copy(invoiceJsonUrl) : undefined}
            >
              Copy Pay Link
            </button>
            <button
              className="pt-btn"
              type="button"
              disabled={!invoiceJsonUrl}
              onClick={() => invoiceJsonUrl ? void navigator.share?.({ text: invoiceJsonUrl }) : undefined}
            >
              Share
            </button>
          </div>

          <div className="pt-divider" />

          <div className="pt-muted" style={{ fontWeight: 900, marginBottom: 6 }}>Ingest (paste)</div>
          <div className="pt-muted">
            If a customer sends you a receipt link / JSON, paste it via “Scan Receipt”.
          </div>
        </div>
      </div>

      <ScanSheet
        open={scanOpen}
        title="Ingest Receipt"
        onClose={() => setScanOpen(false)}
        onScannedText={async (text) => {
          await ingestText(text);
          setScanOpen(false);
        }}
      />
    </div>
  );
}
