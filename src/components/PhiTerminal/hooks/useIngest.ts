import { useEffect } from "react";
import { b64urlDecodeToString } from "../protocol/encode";
import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";
import { TerminalDB } from "../storage/terminalDB";
import { matchesInvoice } from "../protocol/settlement";

type AnyPayload = PhiInvoiceV1 | PhiSettlementV1;

function safeParse(json: string): AnyPayload | null {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    if (obj.v === "PHI-SETTLEMENT-1") return obj as PhiSettlementV1;
    if (obj.v === "PHI-INVOICE-1") return obj as PhiInvoiceV1;
    return null;
  } catch {
    return null;
  }
}

export function useIngestFromURL(onToast?: (msg: string) => void) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("r") || new URLSearchParams(window.location.hash.replace(/^#/, "")).get("r");
    if (!r) return;

    const json = b64urlDecodeToString(r);
    const payload = safeParse(json);
    if (!payload) return;

    (async () => {
      if (payload.v === "PHI-INVOICE-1") {
        await TerminalDB.putInvoice(payload, "OPEN");
        onToast?.("Invoice imported.");
        return;
      }

      // Settlement ingest + auto-settle matching invoice
      await TerminalDB.putSettlement(payload);
      const open = await TerminalDB.getOpenInvoices();
      const match = open.find(inv => matchesInvoice(payload, inv));
      if (match) {
        await TerminalDB.setInvoiceStatus(match.invoiceId, "SETTLED");
        onToast?.("✅ Settled (matched invoice).");
      } else {
        onToast?.("Settlement received (unmatched → inbox).");
      }

      // clean URL so it doesn't re-import on refresh
      url.searchParams.delete("r");
      window.history.replaceState({}, "", url.toString());
    })();
  }, [onToast]);
}
