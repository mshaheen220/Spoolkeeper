// Barcode reading for intake, from a live camera frame (components/
// CameraScanner, only allowed on https:// or localhost) or from a photo
// (the fallback for phones reaching the app over plain http:// on the LAN).

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/** Live camera scanning needs getUserMedia, which browsers only allow on https:// or localhost. */
export const canUseLiveCamera = () => typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

// Retail barcodes, plus QR (spool labels often carry one - usually a link)
// and Code 128 (batch labels), so those can be explained rather than ignored.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];

let detector: BarcodeDetectorLike | null | undefined;
/** The browser's own detector (Chrome on Mac/Android, some Safari) - far better with real-world, curved or sideways barcodes. */
function nativeDetector(): BarcodeDetectorLike | null {
  if (detector === undefined) {
    try {
      detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: FORMATS }) : null;
    } catch {
      detector = null;
    }
  }
  return detector;
}

type ZxingReader = { decodeFromCanvas(c: HTMLCanvasElement): { getText(): string } };
let zxing: Promise<ZxingReader> | null = null;
/** zxing (~400 KB, loaded on first use), told to try harder - including the barcode turned sideways. */
function zxingReader(): Promise<ZxingReader> {
  zxing ??= Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(([{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }]) => {
    const hints = new Map<number, unknown>([
      [DecodeHintType.TRY_HARDER, true],
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]],
    ]);
    return new BrowserMultiFormatReader(hints);
  });
  return zxing;
}

/** Read a barcode from a canvas (a camera frame or a photo); null if there isn't a readable one. */
export async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const native = nativeDetector();
  if (native) {
    try {
      const found = await native.detect(canvas);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      // Fall through to zxing.
    }
  }
  try {
    return (await zxingReader()).decodeFromCanvas(canvas).getText();
  } catch {
    return null; // zxing throws when it finds nothing
  }
}

/** Decode a barcode from a photo file. Large photos are scaled down - more pixels only slow the search. */
export async function decodeBarcode(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return decodeCanvas(canvas);
}

export type ScannedCode = { kind: "product"; digits: string } | { kind: "link"; url: string } | { kind: "other"; text: string };

/**
 * What a scanned code is: a retail product barcode (8-14 digits - the only
 * kind a filament database can look up), a QR link, or something else
 * (a batch or lot code).
 */
export function classifyCode(raw: string): ScannedCode {
  const text = raw.trim();
  if (/^\d{8,14}$/.test(text)) return { kind: "product", digits: text };
  if (/^https?:\/\/\S+$/i.test(text)) return { kind: "link", url: text };
  return { kind: "other", text };
}
