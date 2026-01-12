import type { PhiInvoiceV1, PhiSettlementV1 } from "../protocol/types";

type AnyPayload = PhiInvoiceV1 | PhiSettlementV1;

const CH = "phi_terminal_channel_v1";

export function postToLocalChannel(payload: AnyPayload) {
  try {
    const bc = new BroadcastChannel(CH);
    bc.postMessage(payload);
    bc.close();
  } catch {
    // BroadcastChannel unsupported – ignore
  }
}

export function listenLocalChannel(onPayload: (p: AnyPayload) => void): () => void {
  try {
    const bc = new BroadcastChannel(CH);
    const handler = (ev: MessageEvent) => {
      const p = ev.data as unknown;
      if (p && typeof p === "object" && (p as { v?: unknown }).v) {
        onPayload(p as AnyPayload);
      }
    };
    bc.addEventListener("message", handler);
    return () => {
      bc.removeEventListener("message", handler);
      bc.close();
    };
  } catch {
    return () => {};
  }
}
