export type HashAlg = "sha256";
export type Canon = "JCS";

export type PhiKey = string;        // e.g. your base58 address
export type KaiSignature = string;  // hex

export type TerminalMoney = {
  phi: string; // decimal as string (avoid float)
};

export type InvoiceStatus = "OPEN" | "SETTLED" | "EXPIRED" | "CANCELED";

export type PhiInvoiceV1 = Readonly<{
  v: "PHI-INVOICE-1";
  canon: Canon;
  hashAlg: HashAlg;

  invoiceId: string;        // sha256(canon(invoiceCore))
  createdPulse: number;     // optional if you have it available in-app
  expiresPulse?: number;

  merchantPhiKey: PhiKey;
  merchantLabel?: string;

  amount: TerminalMoney;
  memo?: string;

  // Anti-spam / auto-settle guard:
  // customer settlement MUST echo this nonce
  nonce: string; // 16–32 bytes base64url
}>;

export type PhiSettlementV1 = Readonly<{
  v: "PHI-SETTLEMENT-1";
  canon: Canon;
  hashAlg: HashAlg;

  settlementId: string;     // sha256(canon(settlementCore))
  receivedPulse?: number;

  invoiceId: string;
  nonce: string;

  fromPhiKey: PhiKey;
  toPhiKey: PhiKey;

  amount: TerminalMoney;

  // Optional: your existing proof capsule / kvpf wrapper
  proof?: unknown;

  // Optional: if you have an on-chain tx hash / stream key id
  txRef?: string;

  memo?: string;
}>;
