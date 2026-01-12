// apps/phi-terminal-pwa/src/App.tsx
import React from "react";
import { PhiTerminal } from "../../src/components/PhiTerminal/PhiTerminal";

export default function App() {
  return (
    <PhiTerminal
      merchantPhiKey={"YOUR_MERCHANT_PHIKEY"}
      merchantLabel={"Kai Café"}
      defaultAmountPhi={"144"}
    />
  );
}
