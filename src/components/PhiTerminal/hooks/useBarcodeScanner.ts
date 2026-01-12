import { useCallback, useRef, useState } from "react";

export type ScanResult = { text: string } | { error: string };

type BarcodeDetectorLike = {
  detect: (img: ImageBitmap) => Promise<Array<{ rawValue?: string }>>;
};

function hasBarcodeDetector(): boolean {
  return typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== "undefined";
}

async function getDetector(): Promise<BarcodeDetectorLike> {
  const BD = (window as unknown as { BarcodeDetector: new (x: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  return new BD({ formats: ["qr_code"] });
}

export function useBarcodeScanner() {
  const [active, setActive] = useState(false);
  const [supported] = useState<boolean>(hasBarcodeDetector());

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const start = useCallback(async (onResult: (r: ScanResult) => void) => {
    if (!supported) {
      onResult({ error: "QR scanning not supported on this device/browser. Use Paste or Import." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);

      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();
      videoRef.current = video;

      const detector = await getDetector();

      const loop = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        try {
          const bmp = await createImageBitmap(videoRef.current);
          const res = await detector.detect(bmp);
          bmp.close();
          const raw = res?.[0]?.rawValue?.trim();
          if (raw) {
            onResult({ text: raw });
            stop();
            return;
          }
        } catch {
          // keep scanning
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch {
      onResult({ error: "Camera permission denied or unavailable." });
      stop();
    }
  }, [stop, supported]);

  return { supported, active, start, stop };
}
