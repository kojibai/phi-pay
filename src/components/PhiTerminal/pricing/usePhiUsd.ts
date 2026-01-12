import { useEffect, useMemo, useRef, useState } from "react";
import { useKaiTicker } from "../../../hooks/useKaiTicker";
import { DEFAULT_ISSUANCE_POLICY, quotePhiForUsd } from "../../../utils/phi-issuance";
import type { SigilMetadataLite } from "../../../utils/valuation";

const CACHE_KEY = "phi-terminal:phi-usd";
const FALLBACK_META = { ip: { expectedCashflowPhi: [] } } as unknown as SigilMetadataLite;

export type PhiUsdStatus = "live" | "cached" | "unavailable";

export type PhiUsdRate = {
  phiPerUsd: number | null;
  usdPerPhi: number | null;
  lastUpdated: number | null;
  status: PhiUsdStatus;
};

function readCache(): PhiUsdRate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PhiUsdRate;
    if (!parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(rate: PhiUsdRate) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rate));
  } catch {
    // ignore
  }
}

function computeRate(nowPulse: number, usdSample = 100): { phiPerUsd: number; usdPerPhi: number } | null {
  try {
    const sample = Math.max(1, Math.round(usdSample));
    const q = quotePhiForUsd(
      {
        meta: FALLBACK_META,
        nowPulse: Math.floor(nowPulse),
        usd: sample,
        currentStreakDays: 0,
        lifetimeUsdSoFar: 0,
        plannedHoldBeats: 0,
      },
      DEFAULT_ISSUANCE_POLICY,
    );
    if (!Number.isFinite(q.phiPerUsd) || q.phiPerUsd <= 0) return null;
    if (!Number.isFinite(q.usdPerPhi) || q.usdPerPhi <= 0) return null;
    return { phiPerUsd: q.phiPerUsd, usdPerPhi: q.usdPerPhi };
  } catch {
    return null;
  }
}

export function usePhiUsd(): PhiUsdRate {
  const { pulse } = useKaiTicker();
  const [rate, setRate] = useState<PhiUsdRate>(() => {
    const cached = readCache();
    if (cached?.usdPerPhi && cached?.phiPerUsd) {
      return { ...cached, status: "cached" };
    }
    return { phiPerUsd: null, usdPerPhi: null, lastUpdated: null, status: "unavailable" };
  });

  const lastPulseRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (pulse == null) return;
    const now = Date.now();
    const pulseInt = Math.floor(pulse);
    if (lastPulseRef.current === pulseInt && now - lastUpdateRef.current < 1500) return;
    lastPulseRef.current = pulseInt;
    lastUpdateRef.current = now;

    const next = computeRate(pulseInt);
    if (!next) return;
    const updated: PhiUsdRate = {
      phiPerUsd: next.phiPerUsd,
      usdPerPhi: next.usdPerPhi,
      lastUpdated: now,
      status: "live",
    };
    setRate(updated);
    writeCache(updated);
  }, [pulse]);

  useEffect(() => {
    if (rate.status !== "unavailable") return;
    const cached = readCache();
    if (cached?.usdPerPhi && cached?.phiPerUsd) {
      setRate({ ...cached, status: "cached" });
    }
  }, [rate.status]);

  return useMemo(() => rate, [rate]);
}
