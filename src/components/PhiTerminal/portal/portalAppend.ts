import { jcsCanonicalize } from "../crypto/jcs";
import { sha256Hex } from "../crypto/sha256";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";
import type { PhiPortalSessionV1, PortalReceiptRowV1 } from "./portalTypes";
import { addMicro, microToPhiString, parsePhiToMicro } from "./phiMath";

export async function rollRoot(prevRoot: string, settlementId: string, settlementHash: string): Promise<string> {
  return sha256Hex(`${prevRoot}:${settlementId}:${settlementHash}`);
}

export async function appendSettlementToSession(input: {
  session: PhiPortalSessionV1;
  settlement: PhiSettlementV1;

  // open invoices (if invoice-gated)
  openInvoices: PhiInvoiceV1[];

  // anti-spam rules
  allowDirectReceives: boolean;
}): Promise<{
  accepted: boolean;
  matchedInvoice: boolean;
  updatedSession: PhiPortalSessionV1;
  receiptRow?: PortalReceiptRowV1;
  note: string;
}> {
  const { session, settlement } = input;

  const meta = session.meta;

  // must be to merchant
  if (settlement.toPhiKey !== meta.merchantPhiKey) {
    return { accepted: false, matchedInvoice: false, updatedSession: session, note: "Settlement not addressed to this merchant." };
  }

  // invoice match?
  const invMatch = input.openInvoices.find(inv => inv.invoiceId === settlement.invoiceId && inv.nonce === settlement.nonce);
  const matchedInvoice = !!invMatch;

  if (!matchedInvoice && !input.allowDirectReceives) {
    return { accepted: false, matchedInvoice: false, updatedSession: session, note: "Direct receives disabled (no matching invoice)." };
  }

  const canon = jcsCanonicalize(settlement);
  const settlementHash = await sha256Hex(canon);

  const amtMicro = parsePhiToMicro(settlement.amount.phi);
  const nextTotalMicro = addMicro(meta.totalMicroPhi, amtMicro.toString());
  const nextTotalPhi = microToPhiString(BigInt(nextTotalMicro));

  const nextRoot = await rollRoot(meta.rollingRoot, settlement.settlementId, settlementHash);

  const receiptRow: PortalReceiptRowV1 = Object.freeze({
    v: "PHI-PORTAL-RECEIPTROW-1",
    settlementId: settlement.settlementId,
    settlementHash,
    receivedAtMs: Date.now(),

    invoiceId: settlement.invoiceId,
    matchedInvoice,

    amountPhi: settlement.amount.phi,
    amountMicroPhi: amtMicro.toString(),

    fromPhiKey: settlement.fromPhiKey,
    toPhiKey: settlement.toPhiKey,

    raw: settlement,
  });

  const updatedSession: PhiPortalSessionV1 = Object.freeze({
    ...session,
    meta: Object.freeze({
      ...meta,
      status: meta.status === "ARMED" ? "OPEN" : meta.status, // once receiving starts, treat as open
      receiveCount: meta.receiveCount + 1,
      totalMicroPhi: nextTotalMicro,
      totalPhi: nextTotalPhi,
      rollingRoot: nextRoot,
      lastSettlementId: settlement.settlementId,
    }),
  });

  return {
    accepted: true,
    matchedInvoice,
    updatedSession,
    receiptRow,
    note: matchedInvoice ? "✅ Accepted (invoice matched)." : "✅ Accepted (direct receive).",
  };
}
