import type { PhiPortalSessionV1, PhiPortalMetaV1, PortalReceiptRowV1, PortalInvoiceStatus } from "../portal/portalTypes";
import type { PhiInvoiceV1 } from "../protocol/types";

const DB_NAME = "phi_portal_db";
const DB_VERSION = 1;

type SessionRow = { k: "current"; session: PhiPortalSessionV1 };
type ReceiptRow = { settlementId: string; createdAtMs: number; row: PortalReceiptRowV1 };
type InvoiceRow = { invoiceId: string; createdAtMs: number; status: PortalInvoiceStatus; invoice: PhiInvoiceV1 };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      db.createObjectStore("session", { keyPath: "k" });

      const receipts = db.createObjectStore("receipts", { keyPath: "settlementId" });
      receipts.createIndex("createdAtMs", "createdAtMs", { unique: false });

      const invoices = db.createObjectStore("invoices", { keyPath: "invoiceId" });
      invoices.createIndex("status", "status", { unique: false });
      invoices.createIndex("createdAtMs", "createdAtMs", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open PortalDB"));
  });
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IDB request error"));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDB();
  const t = db.transaction(["session", "receipts", "invoices"], mode);
  const out = await fn(t);
  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error ?? new Error("IDB tx error"));
    t.onabort = () => rej(t.error ?? new Error("IDB tx abort"));
  });
  db.close();
  return out;
}

export const PortalDB = {
  async getSession(): Promise<PhiPortalSessionV1 | null> {
    return tx("readonly", async (t) => {
      const row = await reqP((t.objectStore("session") as IDBObjectStore).get("current"));
      return (row as SessionRow | undefined)?.session ?? null;
    });
  },

  async putSession(session: PhiPortalSessionV1): Promise<void> {
    return tx("readwrite", async (t) => {
      const row: SessionRow = { k: "current", session };
      await reqP((t.objectStore("session") as IDBObjectStore).put(row));
    });
  },

  async clearAll(): Promise<void> {
    return tx("readwrite", async (t) => {
      await reqP((t.objectStore("session") as IDBObjectStore).clear());
      await reqP((t.objectStore("receipts") as IDBObjectStore).clear());
      await reqP((t.objectStore("invoices") as IDBObjectStore).clear());
    });
  },

  async putReceipt(row: PortalReceiptRowV1): Promise<void> {
    return tx("readwrite", async (t) => {
      const store = t.objectStore("receipts");
      const rec: ReceiptRow = { settlementId: row.settlementId, createdAtMs: Date.now(), row };
      await reqP(store.put(rec));
    });
  },

  async hasReceipt(settlementId: string): Promise<boolean> {
    return tx("readonly", async (t) => {
      const store = t.objectStore("receipts");
      const got = await reqP(store.get(settlementId));
      return !!got;
    });
  },

  async listReceipts(limit = 2000): Promise<PortalReceiptRowV1[]> {
    return tx("readonly", async (t) => {
      const store = t.objectStore("receipts");
      const rows = (await reqP(store.getAll())) as ReceiptRow[];
      rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
      return rows.slice(0, limit).map(r => r.row);
    });
  },

  async putInvoice(invoice: PhiInvoiceV1, status: PortalInvoiceStatus = "OPEN"): Promise<void> {
    return tx("readwrite", async (t) => {
      const store = t.objectStore("invoices");
      const row: InvoiceRow = { invoiceId: invoice.invoiceId, createdAtMs: Date.now(), status, invoice };
      await reqP(store.put(row));
    });
  },

  async setInvoiceStatus(invoiceId: string, status: PortalInvoiceStatus): Promise<void> {
    return tx("readwrite", async (t) => {
      const store = t.objectStore("invoices");
      const row = (await reqP(store.get(invoiceId))) as InvoiceRow | undefined;
      if (!row) return;
      row.status = status;
      await reqP(store.put(row));
    });
  },

  async getOpenInvoices(): Promise<PhiInvoiceV1[]> {
    return tx("readonly", async (t) => {
      const idx = t.objectStore("invoices").index("status");
      const rows = (await reqP(idx.getAll("OPEN"))) as InvoiceRow[];
      rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
      return rows.map(r => r.invoice);
    });
  },
};
