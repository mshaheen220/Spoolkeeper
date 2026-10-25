import { useEffect, useRef, useState } from "react";

interface Props {
  onCode: (code: string) => void;
  onClose: () => void;
}

/**
 * Live barcode scanner: streams the camera (the rear one on phones) into a
 * <video> and stops at the first barcode zxing reads.
 */
export function CameraScanner({ onCode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The parent's callback changes every render; keep the camera running regardless.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        // zxing is ~400 KB, so it's only loaded the first time someone scans.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result, _err, ctl) => {
            if (!result) return;
            ctl.stop();
            onCodeRef.current(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in the browser's address bar, or type the number."
            : name === "NotFoundError"
              ? "No camera found on this device. Type the number instead."
              : `Couldn't start the camera: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="space-y-2" role="region" aria-label="Barcode camera">
      {error ? (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-md bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline aria-label="Camera preview" />
          {/* Aiming guide: a retail barcode is wide and short. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-[15%] top-1/2 h-1/3 -translate-y-1/2 rounded border-2 border-accent-400/80" />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-400">{error ? "" : "Hold the barcode inside the box, about a hand's width away."}</p>
        <button type="button" className="btn" onClick={onClose}>
          Close camera
        </button>
      </div>
    </div>
  );
}
