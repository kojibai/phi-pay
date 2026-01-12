import type { PhiPortalSessionV1, PhiPortalSettlementV1 } from "./portalTypes";

export function closePortalSession(input: {
  session: PhiPortalSessionV1;
  receipts: PhiPortalSettlementV1["receipts"];
  ownerCloseProof?: unknown;
  closedPulse?: number;
}): PhiPortalSettlementV1 {
  const meta = input.session.meta;

  const closedAtMs = Date.now();

  const settlement: PhiPortalSettlementV1 = Object.freeze({
    v: "PHI-PORTAL-SETTLEMENT-1",
    canon: "JCS",
    hashAlg: "sha256",

    portalId: meta.portalId,
    merchantPhiKey: meta.merchantPhiKey,
    merchantLabel: meta.merchantLabel,

    openedAtMs: meta.openedAtMs,
    closedAtMs,
    openedPulse: meta.openedPulse,
    closedPulse: input.closedPulse,

    receiveCount: meta.receiveCount,
    totalMicroPhi: meta.totalMicroPhi,
    totalPhi: meta.totalPhi,

    rollingRoot: meta.rollingRoot,

    receipts: input.receipts,

    ownerCloseProof: input.ownerCloseProof,
  });

  return settlement;
}
