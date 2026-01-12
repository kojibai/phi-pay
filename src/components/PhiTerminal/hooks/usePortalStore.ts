import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalDB } from "../storage/portalDB";
import type { PhiPortalSessionV1, PortalReceiptRowV1 } from "../portal/portalTypes";

export function usePortalStore() {
  const [session, setSession] = useState<PhiPortalSessionV1 | null>(null);
  const [receipts, setReceipts] = useState<PortalReceiptRowV1[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await PortalDB.getSession();
    const r = await PortalDB.listReceipts(2000);
    setSession(s);
    setReceipts(r);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const stats = useMemo(() => {
    return {
      status: session?.meta.status ?? "LOCKED",
      receiveCount: session?.meta.receiveCount ?? 0,
      totalPhi: session?.meta.totalPhi ?? "0",
      rollingRoot: session?.meta.rollingRoot ?? "",
      allowDirectReceives: session?.meta.allowDirectReceives ?? false,
      merchantPhiKey: session?.meta.merchantPhiKey ?? "",
      merchantLabel: session?.meta.merchantLabel ?? "",
      portalId: session?.meta.portalId ?? "",
    };
  }, [session]);

  return { loading, session, receipts, stats, refresh, setSession };
}
