import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";

export type IngestResult =
  | {
      ok: true;
      kind: "invoice";
      invoice: PhiInvoiceV1;
      note: string;
    }
  | {
      ok: true;
      kind: "settlement";
      settlement: PhiSettlementV1;
      matchedInvoiceId?: string;
      note: string;
    }
  | {
      ok: false;
      kind: "error";
      note: string;
    };
