import { jcsCanonicalize } from "../crypto/jcs";
import { sha256Hex } from "../crypto/sha256";
import { randomNonce } from "./encode";
import type { PhiInvoiceV1, PhiKey } from "./types";

export async function createInvoice(input: {
  merchantPhiKey: PhiKey;
  merchantLabel?: string;
  amountPhi: string; // decimal string
  memo?: string;
  createdPulse: number;
  expiresPulse?: number;
}): Promise<PhiInvoiceV1> {
  const core = {
    v: "PHI-INVOICE-1" as const,
    canon: "JCS" as const,
    hashAlg: "sha256" as const,
    createdPulse: input.createdPulse,
    merchantPhiKey: input.merchantPhiKey,
    amount: { phi: input.amountPhi },
    ...(input.expiresPulse != null ? { expiresPulse: input.expiresPulse } : {}),
    ...(input.merchantLabel != null ? { merchantLabel: input.merchantLabel } : {}),
    ...(input.memo != null ? { memo: input.memo } : {}),
    nonce: randomNonce(16),
  };

  const canon = jcsCanonicalize(core);
  const invoiceId = await sha256Hex(canon);

  return Object.freeze({ ...core, invoiceId });
}
