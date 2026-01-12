import React, { useMemo, useState } from "react";
import "./terminal.css";
import { ChargeView } from "./views/ChargeView";
import { InboxView } from "./views/InboxView";
import { HistoryView } from "./views/HistoryView";
import { SettingsView } from "./views/SettingsView";
import { Toast } from "./ui/Toast";
import { PhiGlyph } from "./ui/PhiGlyph";
import { useIngestFromURL } from "./hooks/useIngest";
export { PortalView } from "./views/PortalView";

export type PhiTerminalProps = {
  merchantPhiKey: string;
  merchantLabel?: string;
  defaultAmountPhi?: string; // e.g. "144"
};

type Tab = "charge" | "inbox" | "history" | "settings";

export function PhiTerminal(props: PhiTerminalProps) {
  const [tab, setTab] = useState<Tab>("charge");
  const [toast, setToast] = useState<string | null>(null);

  useIngestFromURL((m) => setToast(m));

  const header = useMemo(() => {
    return (
      <div className="pt-header">
        <div className="pt-brand">
          <div className="pt-logo">
            <PhiGlyph className="pt-phiIcon pt-phiIcon--logo" />
          </div>
          <div className="pt-brandText">
            <div className="pt-title">
              <PhiGlyph className="pt-phiIcon pt-phiIcon--title" /> Terminal
            </div>
            <div className="pt-subtitle">{props.merchantLabel ?? "Merchant"}</div>
          </div>
        </div>
        <div className="pt-headPills">
          <div className="pt-pill pt-pill--glow" title={props.merchantPhiKey}>
            <PhiGlyph className="pt-phiIcon pt-phiIcon--pill" /> Key{" "}
            <span className="pt-pillMono">{props.merchantPhiKey.slice(0, 6)}…{props.merchantPhiKey.slice(-6)}</span>
          </div>
        </div>
      </div>
    );
  }, [props.merchantPhiKey, props.merchantLabel]);

  return (
    <div className="pt-shell">
      {header}

      <div className="pt-body">
        {tab === "charge" && <ChargeView merchantPhiKey={props.merchantPhiKey} merchantLabel={props.merchantLabel} defaultAmountPhi={props.defaultAmountPhi ?? "0"} />}
        {tab === "inbox" && <InboxView />}
        {tab === "history" && <HistoryView />}
        {tab === "settings" && <SettingsView />}
      </div>

      <div className="pt-tabs">
        <button className={tab === "charge" ? "pt-tab active" : "pt-tab"} onClick={() => setTab("charge")}>Charge</button>
        <button className={tab === "inbox" ? "pt-tab active" : "pt-tab"} onClick={() => setTab("inbox")}>Inbox</button>
        <button className={tab === "history" ? "pt-tab active" : "pt-tab"} onClick={() => setTab("history")}>History</button>
        <button className={tab === "settings" ? "pt-tab active" : "pt-tab"} onClick={() => setTab("settings")}>Settings</button>
      </div>

      <Toast text={toast} onDone={() => setToast(null)} />
    </div>
  );
}
