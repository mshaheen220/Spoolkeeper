// Decode a barcode from a photo. A photo (<input capture>) rather than a
// live camera stream, because getUserMedia needs HTTPS and the app is
// reached over plain http:// on the LAN.

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmap): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const RETAIL_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export async function decodeBarcode(file: Blob): Promise<string | null> {
  // The browser's own detector (Chrome on Android, Safari 17+ on some
  // devices) is faster and better with blurry phone photos when present.
  if (window.BarcodeDetector) {
    try {
      const bitmap = await createImageBitmap(file);
      const found = await new window.BarcodeDetector({ formats: RETAIL_FORMATS }).detect(bitmap);
      bitmap.close();
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      // Fall through to zxing.
    }
  }
  // zxing is ~400 KB, so it's only loaded the first time someone scans.
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const url = URL.createObjectURL(file);
  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return result.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
