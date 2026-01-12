import { jcsCanonicalize } from "../crypto/jcs";
import { sha256Hex } from "../crypto/sha256";
import type { PhiInvoiceV1, PhiSettlementV1, PhiKey } from "./types";

export async function createSettlement(input: {
  invoice: PhiInvoiceV1;
  fromPhiKey: PhiKey;
  toPhiKey: PhiKey; // should match invoice.merchantPhiKey
  amountPhi: string;
  memo?: string;
  proof?: unknown;
  txRef?: string;
  receivedPulse?: number;
}): Promise<PhiSettlementV1> {
  const core = {
    v: "PHI-SETTLEMENT-1" as const,
    canon: "JCS" as const,
    hashAlg: "sha256" as const,
    receivedPulse: input.receivedPulse,
    invoiceId: input.invoice.invoiceId,
    nonce: input.invoice.nonce,
    fromPhiKey: input.fromPhiKey,
    toPhiKey: input.toPhiKey,
    amount: { phi: input.amountPhi },
    memo: input.memo,
    proof: input.proof,
    txRef: input.txRef,
  };

  const canon = jcsCanonicalize(core);
  const settlementId = await sha256Hex(canon);
  return Object.freeze({ ...core, settlementId });
}

export function matchesInvoice(settlement: PhiSettlementV1, invoice: PhiInvoiceV1): boolean {
  return settlement.invoiceId === invoice.invoiceId && settlement.nonce === invoice.nonce;
}
