import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pill } from "../ui/Pill";
import { b64urlDecodeToString } from "../protocol/encode";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";
import { decodePayloadFromFile } from "../transport/ingestTransport";
import { createSettlement, matchesInvoice } from "../protocol/settlement";
import { postToLocalChannel } from "../transport/broadcastChannelTransport";
import { toScaled6 } from "../../../utils/phi-precision";
import { base64DecodeUtf8 } from "../../verifier/utils/base64";

type PayStatus = "WAITING" | "SETTLED" | "ERROR";

type SigilTransferPayload = {
  amountPhi?: string | number;
  sourcePhiKey?: string | null;
};

function parseInvoiceFromUrl(url: string): PhiInvoiceV1 | null {
  try {
    const parsed = new URL(url);
    const r = parsed.searchParams.get("r") ?? new URLSearchParams(parsed.hash.replace(/^#/, "")).get("r");
    if (!r) return null;
    const json = b64urlDecodeToString(r);
    const payload = JSON.parse(json) as { v?: string };
    if (payload && payload.v === "PHI-INVOICE-1") return payload as PhiInvoiceV1;
    return null;
  } catch {
    return null;
  }
}

function shortKey(key: string) {
  if (!key) return "";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonish(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readAmountFromMeta(meta: Record<string, unknown>): string | null {
  const direct = meta.childAllocationPhi ?? meta.branchBasePhi;
  if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const phiTransfer = isRecord(meta.phiTransfer) ? (meta.phiTransfer as SigilTransferPayload) : null;
  if (phiTransfer?.amountPhi != null) return String(phiTransfer.amountPhi);

  const transfers = Array.isArray(meta.transfers) ? meta.transfers : [];
  for (let i = transfers.length - 1; i >= 0; i -= 1) {
    const t = transfers[i];
    if (!isRecord(t)) continue;
    const payload = isRecord(t.payload) ? t.payload : null;
    if (!payload) continue;
    const mime = typeof payload.mime === "string" ? payload.mime : "";
    const encoded = typeof payload.encoded === "string" ? payload.encoded : "";
    if (!mime || !encoded) continue;
    if (!/^application\/vnd\.kairos-exhale/i.test(mime)) continue;
    try {
      const json = base64DecodeUtf8(encoded);
      const obj = JSON.parse(json) as { kind?: string; amountPhi?: string | number };
      if (obj?.kind === "exhale" && obj.amountPhi != null) {
        return String(obj.amountPhi);
      }
    } catch {
      // ignore payload decode errors
    }
  }

  return null;
}

function readPhiKeyFromMeta(meta: Record<string, unknown>): string | null {
  const phiTransfer = isRecord(meta.phiTransfer) ? (meta.phiTransfer as SigilTransferPayload) : null;
  const candidates = [
    phiTransfer?.sourcePhiKey,
    meta.sourcePhiKey,
    meta.userPhiKey,
    meta.phiKey,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function extractSigilMetaCandidates(svgText: string): Record<string, unknown>[] {
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const nodes = Array.from(doc.querySelectorAll("metadata"));
    const parsed = nodes
      .map((node) => parseJsonish(node.textContent ?? ""))
      .filter((candidate): candidate is Record<string, unknown> => !!candidate);
    if (parsed.length) return parsed;

    const svg = doc.querySelector("svg");
    const dp = svg?.getAttribute("data-payload");
    const payload = dp ? parseJsonish(dp) : null;
    return payload ? [payload] : [];
  } catch {
    return [];
  }
}

async function deriveSettlementFromMeta(
  meta: Record<string, unknown>,
  invoice: PhiInvoiceV1
): Promise<PhiSettlementV1 | null> {
  const amountPhi = readAmountFromMeta(meta);
  const fromPhiKey = readPhiKeyFromMeta(meta);
  if (!amountPhi || !fromPhiKey) return null;
  try {
    const invoiceScaled = toScaled6(invoice.amount.phi);
    const sendScaled = toScaled6(amountPhi);
    if (sendScaled !== invoiceScaled) {
      return null;
    }
  } catch {
    return null;
  }
  return createSettlement({
    invoice,
    fromPhiKey,
    toPhiKey: invoice.merchantPhiKey,
    amountPhi,
    memo: invoice.memo,
    proof: { kind: "sigil-send", meta },
  });
}

async function deriveSettlementFromSigilText(
  svgText: string,
  invoice: PhiInvoiceV1
): Promise<PhiSettlementV1 | null> {
  const candidates = extractSigilMetaCandidates(svgText);
  for (const meta of candidates) {
    const settlement = await deriveSettlementFromMeta(meta, invoice);
    if (settlement) return settlement;
  }
  return null;
}

async function deriveSettlementFromFile(
  file: File,
  invoice: PhiInvoiceV1
): Promise<PhiSettlementV1 | null> {
  const payload = await decodePayloadFromFile(file);
  if (payload && payload.v === "PHI-SETTLEMENT-1") return payload;

  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const svgText = await file.text();
    return deriveSettlementFromSigilText(svgText, invoice);
  }

  if (file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) {
    try {
      const jsonText = await file.text();
      const parsed = parseJsonish(jsonText);
      if (parsed && parsed.v === "PHI-SETTLEMENT-1") return parsed as PhiSettlementV1;
      if (parsed && isRecord(parsed.meta)) {
        const settlement = await deriveSettlementFromMeta(parsed.meta, invoice);
        if (settlement) return settlement;
      }
      if (parsed) {
        const settlement = await deriveSettlementFromMeta(parsed, invoice);
        if (settlement) return settlement;
      }
    } catch {
      return null;
    }
  }

  if (file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip")) {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files);
      for (const entry of entries) {
        if (entry.dir) continue;
        if (entry.name.toLowerCase().endsWith(".svg")) {
          const svgText = await entry.async("text");
          const settlement = await deriveSettlementFromSigilText(svgText, invoice);
          if (settlement) return settlement;
        }
        if (entry.name.toLowerCase().endsWith(".json")) {
          const jsonText = await entry.async("text");
          const parsed = parseJsonish(jsonText);
          if (parsed && parsed.v === "PHI-SETTLEMENT-1") return parsed as PhiSettlementV1;
          if (parsed && isRecord(parsed.meta)) {
            const settlement = await deriveSettlementFromMeta(parsed.meta, invoice);
            if (settlement) return settlement;
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function PayView() {
  const [invoice, setInvoice] = useState<PhiInvoiceV1 | null>(null);
  const [status, setStatus] = useState<PayStatus>("WAITING");
  const [msg, setMsg] = useState<string | null>(null);
  const [receivedSettlement, setReceivedSettlement] = useState<PhiSettlementV1 | null>(null);

  useEffect(() => {
    const inv = parseInvoiceFromUrl(window.location.href);
    if (!inv) {
      setStatus("ERROR");
      setMsg("Missing or invalid invoice link.");
      return;
    }
    setInvoice(inv);
  }, []);

  const amountDisplay = useMemo(() => {
    if (!invoice) return "—";
    return `${invoice.amount.phi} Φ`;
  }, [invoice]);

  const handleReceiptFile = useCallback(async (file: File) => {
    if (!invoice) {
      setMsg("Invoice not loaded.");
      setStatus("ERROR");
      return;
    }
    const payload = await deriveSettlementFromFile(file, invoice);
    if (!payload) {
      setMsg("Could not parse the send sigil file.");
      setStatus("ERROR");
      return;
    }
    if (!matchesInvoice(payload, invoice)) {
      setMsg("Send sigil does not match this invoice.");
      setStatus("ERROR");
      return;
    }
    if (payload.toPhiKey !== invoice.merchantPhiKey) {
      setMsg("Send sigil is addressed to a different merchant.");
      setStatus("ERROR");
      return;
    }

    postToLocalChannel(payload);
    setReceivedSettlement(payload);
    setStatus("SETTLED");
    setMsg("Send sigil received. Payment closed and forwarded.");
  }, [invoice]);

  const tone = status === "SETTLED" ? "ok" : status === "ERROR" ? "warn" : "neutral";

  return (
    <div className="pt-pay">
      <div className="pt-card pt-payCard">
        <div className="pt-cardInner">
          <div className="pt-payHeader">
            <div className="pt-h1">Pay Invoice</div>
            <Pill tone={tone as any} text={status} />
          </div>

          {invoice ? (
            <div className="pt-payInvoice">
              <div className="pt-payRow">
                <span className="pt-muted">Merchant</span>
                <span>{invoice.merchantLabel || shortKey(invoice.merchantPhiKey) || "Merchant"}</span>
              </div>
              <div className="pt-payRow">
                <span className="pt-muted">Amount</span>
                <span>{amountDisplay}</span>
              </div>
              {invoice.memo ? (
                <div className="pt-payRow">
                  <span className="pt-muted">Memo</span>
                  <span>{invoice.memo}</span>
                </div>
              ) : null}
              <div className="pt-payRow">
                <span className="pt-muted">Invoice</span>
                <span>{shortKey(invoice.invoiceId)}</span>
              </div>
            </div>
          ) : null}

          <div className="pt-divider" />

          <div className="pt-payActions">
            <div className="pt-payHint">
              Upload the send sigil generated by VerifierStamper to close this payment.
            </div>
            <label className="pt-btn primary" style={{ cursor: "pointer" }}>
              Upload Send Sigil
              <input
                type="file"
                accept=".svg,.json,.zip,application/json,application/zip,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) void handleReceiptFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {receivedSettlement ? (
              <div className="pt-payReceipt">
                <div className="pt-muted">Receipt</div>
                <div>{shortKey(receivedSettlement.settlementId)}</div>
              </div>
            ) : null}
          </div>

          {msg ? <div className="pt-statusMessage">{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
