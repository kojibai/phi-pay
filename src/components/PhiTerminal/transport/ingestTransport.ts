import { b64urlDecodeToString } from "../protocol/encode";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";
import { TerminalDB } from "../storage/terminalDB";
import { matchesInvoice } from "../protocol/settlement";
import type { IngestResult } from "./transportTypes";

type AnyPayload = PhiInvoiceV1 | PhiSettlementV1;

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeTextInput(text: string): string {
  return text.trim();
}

function tryExtractRParam(text: string): string | null {
  try {
    const url = new URL(text);
    const r = url.searchParams.get("r") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("r");
    return r ?? null;
  } catch {
    return null;
  }
}

function parsePayloadFromUnknown(u: unknown): AnyPayload | null {
  if (!isObj(u)) return null;
  const v = u["v"];
  if (v === "PHI-INVOICE-1") return u as PhiInvoiceV1;
  if (v === "PHI-SETTLEMENT-1") return u as PhiSettlementV1;
  return null;
}

function tryParseSvgMetadata(svgText: string): AnyPayload | null {
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const meta = doc.querySelector("metadata");
    const txt = meta?.textContent?.trim();
    if (txt) {
      const u = safeJsonParse(txt);
      const p = parsePayloadFromUnknown(u);
      if (p) return p;
    }

    // Also allow: <svg data-payload="...json...">
    const svg = doc.querySelector("svg");
    const dp = svg?.getAttribute("data-payload")?.trim();
    if (dp) {
      const u = safeJsonParse(dp);
      const p = parsePayloadFromUnknown(u);
      if (p) return p;
    }

    return null;
  } catch {
    return null;
  }
}

export async function decodePayloadFromText(textIn: string): Promise<AnyPayload | null> {
  const text = normalizeTextInput(textIn);

  // 1) URL with r=
  const r = tryExtractRParam(text);
  if (r) {
    const json = b64urlDecodeToString(r);
    const u = safeJsonParse(json);
    return parsePayloadFromUnknown(u);
  }

  // 2) raw JSON
  const u = safeJsonParse(text);
  const p = parsePayloadFromUnknown(u);
  if (p) return p;

  // 3) base64url JSON directly
  if (/^[A-Za-z0-9\-_]+$/.test(text) && text.length > 32) {
    try {
      const json = b64urlDecodeToString(text);
      const u2 = safeJsonParse(json);
      return parsePayloadFromUnknown(u2);
    } catch {
      // ignore
    }
  }

  return null;
}

export async function decodePayloadFromFile(file: File): Promise<AnyPayload | null> {
  const text = await file.text();

  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return tryParseSvgMetadata(text);
  }

  // JSON fallback
  const u = safeJsonParse(text);
  return parsePayloadFromUnknown(u);
}

export async function ingestPayload(payload: AnyPayload): Promise<IngestResult> {
  if (payload.v === "PHI-INVOICE-1") {
    await TerminalDB.putInvoice(payload, "OPEN");
    return { ok: true, kind: "invoice", invoice: payload, note: "Invoice saved." };
  }

  // settlement
  await TerminalDB.putSettlement(payload);
  const open = await TerminalDB.getOpenInvoices();
  const match = open.find((inv) => matchesInvoice(payload, inv));

  if (match) {
    await TerminalDB.setInvoiceStatus(match.invoiceId, "SETTLED");
    return { ok: true, kind: "settlement", settlement: payload, matchedInvoiceId: match.invoiceId, note: "✅ Settled (matched invoice)." };
  }

  return { ok: true, kind: "settlement", settlement: payload, note: "Settlement received (unmatched → Inbox)." };
}
