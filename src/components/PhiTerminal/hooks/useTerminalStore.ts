import { useCallback, useEffect, useMemo, useState } from "react";
import { TerminalDB } from "../storage/terminalDB";

type InvoiceRow = Awaited<ReturnType<typeof TerminalDB.listInvoices>>[number];
type SettlementRow = Awaited<ReturnType<typeof TerminalDB.listSettlements>>[number];

export function useTerminalStore() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [inv, setl] = await Promise.all([
      TerminalDB.listInvoices(80),
      TerminalDB.listSettlements(200),
    ]);
    setInvoices(inv);
    setSettlements(setl);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openInvoices = useMemo(
    () => invoices.filter((r) => r.status === "OPEN"),
    [invoices]
  );

  const unsettledCount = openInvoices.length;

  const unmatchedSettlements = useMemo(() => {
    const invoiceIds = new Set(invoices.map((r) => r.invoiceId));
    // Unmatched = settlement references unknown invoiceId
    return settlements.filter((s) => !invoiceIds.has(s.settlement.invoiceId));
  }, [invoices, settlements]);

  return {
    loading,
    invoices,
    settlements,
    openInvoices,
    unsettledCount,
    unmatchedSettlements,
    refresh,
  };
}
