import type { Canon, HashAlg, PhiInvoiceV1, PhiSettlementV1, PhiKey } from "../protocol/types";

export type PortalStatus = "ARMED" | "OPEN" | "CLOSED";

export type PortalInvoiceStatus = "OPEN" | "SETTLED" | "CANCELED";

export type PhiPortalMetaV1 = Readonly<{
  v: "PHI-PORTAL-1";
  canon: Canon;
  hashAlg: HashAlg;

  portalId: string;

  merchantPhiKey: PhiKey;
  merchantLabel?: string;
  kaiSignature?: string;

  status: PortalStatus;

  openedAtMs: number;
  openedPulse?: number;

  closedAtMs?: number;
  closedPulse?: number;

  receiveCount: number;

  // fixed-point microPhi total for exact addition, plus a display string
  totalMicroPhi: string; // bigint decimal string
  totalPhi: string;

  // rolling commitment over all accepted receipts
  rollingRoot: string; // hex
  lastSettlementId?: string;

  allowDirectReceives: boolean; // if false, only invoice-matched settlements are accepted

  // anchor glyph info
  anchorName?: string;
  anchorHash?: string; // sha256 hex of anchor file text
  anchorKind?: "svg" | "json";
}>;

export type PhiPortalSessionV1 = Readonly<{
  v: "PHI-PORTAL-SESSION-1";
  meta: PhiPortalMetaV1;

  // In-session invoices (optional, but recommended)
  invoices: ReadonlyArray<Readonly<{
    invoice: PhiInvoiceV1;
    status: PortalInvoiceStatus;
  }>>;
}>;

export type PortalReceiptRowV1 = Readonly<{
  v: "PHI-PORTAL-RECEIPTROW-1";
  settlementId: string;
  settlementHash: string; // sha256(canon(settlement))
  receivedAtMs: number;

  invoiceId?: string;
  matchedInvoice: boolean;

  amountPhi: string;
  amountMicroPhi: string;

  fromPhiKey: PhiKey;
  toPhiKey: PhiKey;

  raw: PhiSettlementV1;
}>;

export type PhiPortalSettlementV1 = Readonly<{
  v: "PHI-PORTAL-SETTLEMENT-1";
  canon: Canon;
  hashAlg: HashAlg;

  portalId: string;
  merchantPhiKey: PhiKey;
  merchantLabel?: string;

  openedAtMs: number;
  closedAtMs: number;
  openedPulse?: number;
  closedPulse?: number;

  receiveCount: number;
  totalMicroPhi: string;
  totalPhi: string;

  rollingRoot: string;

  // Full list (can be large). If you want, you can flip to blob mode later.
  receipts: ReadonlyArray<PortalReceiptRowV1>;

  // Optional owner close proof (plug in your presence verifier)
  ownerCloseProof?: unknown;
}>;
