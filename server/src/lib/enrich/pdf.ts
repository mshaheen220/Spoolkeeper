import { config } from "../../config";
import { HttpError } from "../http";

// Technical datasheets (TDS) are usually PDFs linked from the product page.
// Text is pulled out with unpdf (Mozilla's PDF.js) - no rendering, no OCR,
// so a scanned-image PDF simply yields no text.

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "User-Agent": config.userAgent, Accept: "application/pdf,*/*" },
    signal: AbortSignal.timeout(config.fetchTimeoutMs * 2),
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(502, `${new URL(url).host} returned HTTP ${res.status} for the datasheet`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES) throw new HttpError(502, "Datasheet PDF is too large");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_PDF_BYTES) throw new HttpError(502, "Datasheet PDF is too large");
  if (!isPdf(buf)) throw new HttpError(502, "That link didn't return a PDF");
  return buf;
}

/** PDFs start with "%PDF-". */
export const isPdf = (buf: Uint8Array) => buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

export async function pdfToText(buf: Uint8Array): Promise<string> {
  // unpdf is ESM-only; a dynamic import loads it from this CommonJS build.
  const { extractText, getDocumentProxy } = await import("unpdf");
  // PDF.js prints a warning per odd glyph in some embedded fonts; silence them.
  const pdf = await getDocumentProxy(buf, { verbosity: 0 });
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Fetch a PDF from the web and return its text. */
export async function readPdfText(url: string): Promise<string> {
  return pdfToText(await fetchPdfBytes(url));
}
