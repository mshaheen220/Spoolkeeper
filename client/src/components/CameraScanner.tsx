import { useEffect, useRef, useState } from "react";
import { decodeCanvas } from "../lib/barcode";

interface Props {
  onCode: (code: string) => void;
  /** A photo chosen instead (sharper than a webcam - e.g. one taken on your phone). */
  onPhoto: (file: File) => void;
  onClose: () => void;
}

/** After this long without a read, show what usually helps. */
const HINT_AFTER_MS = 6000;

/**
 * Live barcode scanner. There's no shutter button: it reads the camera a few
 * times a second and stops at the first barcode it finds. The camera is
 * asked for a high resolution, since small spool barcodes need the pixels.
 */
export function CameraScanner({ onCode, onPhoto, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [showHints, setShowHints] = useState(false);
  // The parent's callback changes every render; keep the camera running regardless.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const hintTimer = setTimeout(() => setShowHints(true), HINT_AFTER_MS);

    const scan = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        const code = await decodeCanvas(canvas);
        if (stopped) return;
        if (code) {
          stopped = true;
          stream?.getTracks().forEach((t) => t.stop());
          onCodeRef.current(code);
          return;
        }
      }
      timer = setTimeout(() => void scan(), 200);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setLive(true);
        void scan();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site (the camera icon in the address bar), use a photo, or type the number."
            : name === "NotFoundError"
              ? "No camera found on this device. Use a photo or type the number."
              : `Couldn't start the camera: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearTimeout(hintTimer);
      stream?.getTracks().forEach((t) => t.stop());
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
          <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-2/5 -translate-y-1/2 rounded border-2 border-accent-400/80" />
          <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/60 px-3 py-1 text-center text-xs text-white" role="status">
            {live ? (
              <>
                <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Looking for a barcode - it reads on its own, no button needed
              </>
            ) : (
              "Starting camera…"
            )}
          </p>
        </div>
      )}
      {showHints && !error && (
        <div className="rounded-md border border-ink-700 p-2 text-xs text-ink-300">
          <p className="font-medium">Not finding it?</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-ink-400">
            <li>Use the barcode with numbers under it (12-13 digits). It's usually on the box or bag; the label on the spool itself often only has a batch code or QR code.</li>
            <li>Move it back until it's sharp - laptop cameras can't focus up close. Fill about half the box.</li>
            <li>Hold it flat, out of glare. A barcode on the curved spool side is hard to read.</li>
            <li>Or take a photo with your phone and use it here, or type the number in the box above.</li>
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="btn cursor-pointer">
          Use a photo instead
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPhoto(f);
            }}
          />
        </label>
        <button type="button" className="btn" onClick={onClose}>
          Close camera
        </button>
      </div>
    </div>
  );
}
