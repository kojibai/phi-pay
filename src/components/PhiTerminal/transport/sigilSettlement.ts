import { toScaled6 } from "../../../utils/phi-precision";
import { base64DecodeUtf8 } from "../../verifier/utils/base64";
import { markConfirmedByNonce } from "../../../utils/sendLedger";
import { createSettlement } from "../protocol/settlement";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";

type SigilTransferPayload = {
  amountPhi?: string | number;
  sourcePhiKey?: string | null;
  message?: string | null;
};

type SigilMeta = Record<string, unknown>;

type SigilSettlementMatch = {
  settlement: PhiSettlementV1;
  invoice: PhiInvoiceV1;
  meta: SigilMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonish(text: string): SigilMeta | null {
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

function readAmountFromMeta(meta: SigilMeta): string | null {
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

function readPhiKeyFromMeta(meta: SigilMeta): string | null {
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

function readCanonicalHashFromMeta(meta: SigilMeta): string | null {
  const candidate = meta.childOfHash ?? meta.canonicalHash ?? meta.parentHash ?? meta.hash;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function readTransferNonceFromMeta(meta: SigilMeta): string | null {
  if (typeof meta.transferNonce === "string" && meta.transferNonce.trim()) {
    return meta.transferNonce.trim();
  }
  if (isRecord(meta.sendLock) && typeof meta.sendLock.nonce === "string" && meta.sendLock.nonce.trim()) {
    return meta.sendLock.nonce.trim();
  }
  return null;
}

export function markSendSigilUsedFromMeta(meta: SigilMeta): void {
  const canonical = readCanonicalHashFromMeta(meta);
  const nonce = readTransferNonceFromMeta(meta);
  if (!canonical || !nonce) return;
  markConfirmedByNonce(canonical, nonce);
}

function extractSigilMetaCandidatesFromSvg(svgText: string): SigilMeta[] {
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const nodes = Array.from(doc.querySelectorAll("metadata"));
    const parsed = nodes
      .map((node) => parseJsonish(node.textContent ?? ""))
      .filter((candidate): candidate is SigilMeta => !!candidate);
    if (parsed.length) return parsed;

    const svg = doc.querySelector("svg");
    const dp = svg?.getAttribute("data-payload");
    const payload = dp ? parseJsonish(dp) : null;
    return payload ? [payload] : [];
  } catch {
    return [];
  }
}

function extractMetaFromJsonText(jsonText: string): SigilMeta[] {
  const parsed = parseJsonish(jsonText);
  if (!parsed) return [];
  if (typeof parsed.v === "string") return [];
  if (isRecord(parsed.meta)) return [parsed.meta as SigilMeta];
  return [parsed];
}

async function extractMetaFromFile(file: File): Promise<SigilMeta[]> {
  const text = await file.text();

  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return extractSigilMetaCandidatesFromSvg(text);
  }

  if (file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) {
    return extractMetaFromJsonText(text);
  }

  if (file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip")) {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files);
      const metas: SigilMeta[] = [];
      for (const entry of entries) {
        if (entry.dir) continue;
        if (entry.name.toLowerCase().endsWith(".svg")) {
          const svgText = await entry.async("text");
          metas.push(...extractSigilMetaCandidatesFromSvg(svgText));
        }
        if (entry.name.toLowerCase().endsWith(".json")) {
          const jsonText = await entry.async("text");
          metas.push(...extractMetaFromJsonText(jsonText));
        }
      }
      return metas;
    } catch {
      return [];
    }
  }

  return [];
}

function amountMatchesInvoice(amountPhi: string, invoice: PhiInvoiceV1): boolean {
  try {
    const invoiceScaled = toScaled6(invoice.amount.phi);
    const sendScaled = toScaled6(amountPhi);
    return sendScaled === invoiceScaled;
  } catch {
    return false;
  }
}

async function deriveSettlementFromMeta(
  meta: SigilMeta,
  invoice: PhiInvoiceV1
): Promise<PhiSettlementV1 | null> {
  const amountPhi = readAmountFromMeta(meta);
  const fromPhiKey = readPhiKeyFromMeta(meta);
  if (!amountPhi || !fromPhiKey) return null;
  if (!amountMatchesInvoice(amountPhi, invoice)) return null;
  return createSettlement({
    invoice,
    fromPhiKey,
    toPhiKey: invoice.merchantPhiKey,
    amountPhi,
    memo: invoice.memo,
    proof: { kind: "sigil-send", meta },
  });
}

export async function deriveSettlementFromSendSigilFileForInvoice(
  file: File,
  invoice: PhiInvoiceV1
): Promise<{ settlement: PhiSettlementV1; meta: SigilMeta } | null> {
  const metas = await extractMetaFromFile(file);
  for (const meta of metas) {
    const settlement = await deriveSettlementFromMeta(meta, invoice);
    if (settlement) return { settlement, meta };
  }
  return null;
}

export async function deriveSettlementFromSendSigilFileForInvoices(
  file: File,
  invoices: PhiInvoiceV1[],
  invoiceIdHint?: string
): Promise<SigilSettlementMatch | null> {
  const metas = await extractMetaFromFile(file);
  if (!metas.length) return null;
  const scopedInvoices = invoiceIdHint
    ? invoices.filter((inv) => inv.invoiceId === invoiceIdHint)
    : invoices;
  if (!scopedInvoices.length) return null;

  for (const meta of metas) {
    const amountPhi = readAmountFromMeta(meta);
    const fromPhiKey = readPhiKeyFromMeta(meta);
    if (!amountPhi || !fromPhiKey) continue;
    const matches = scopedInvoices.filter((inv) => amountMatchesInvoice(amountPhi, inv));
    if (matches.length !== 1) continue;
    const invoice = matches[0];
    const settlement = await createSettlement({
      invoice,
      fromPhiKey,
      toPhiKey: invoice.merchantPhiKey,
      amountPhi,
      memo: invoice.memo,
      proof: { kind: "sigil-send", meta },
    });
    return { settlement, invoice, meta };
  }

  return null;
}
