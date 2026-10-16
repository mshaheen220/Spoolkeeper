import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { LabelData } from "../api/labels";
import { colorBackground } from "../lib/colors";

/** QR code as an SVG string (no margin - the label provides its own padding). */
function useQrSvg(text: string): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return svg;
}

/**
 * One spool label at its real printed size, in millimetres. Always black on
 * white whatever the app theme, since that's what comes off the printer.
 * Layout: QR on the left (scan to open the spool's page), then color name,
 * brand/material/finish, temperatures (✓ = calibrated) and the Spool #.
 */
export function SpoolLabel({ label, widthMm, heightMm, stripe }: { label: LabelData; widthMm: number; heightMm: number; stripe: boolean }) {
  const qr = useQrSvg(label.url);
  const pad = Math.max(0.8, heightMm * 0.05);
  const qrSize = heightMm - pad * 2;
  const stripeW = stripe ? Math.max(1.5, widthMm * 0.035) : 0;
  // Text scales with label height so a taller label just gets bigger text.
  const big = heightMm * 0.16;
  const small = heightMm * 0.115;
  const temps = [
    label.nozzle && `N ${label.nozzle.text}${label.nozzle.tuned ? "✓" : ""}`,
    label.bed && `B ${label.bed.text}${label.bed.tuned ? "✓" : ""}`,
  ].filter(Boolean);

  return (
    <div
      className="spool-label"
      role="img"
      aria-label={`Label for spool ${label.spoolId}: ${label.brand} ${label.material} ${label.colorName ?? ""}`}
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: `${pad}mm`,
        paddingRight: stripe ? 0 : `${pad}mm`,
        display: "flex",
        gap: `${pad * 1.2}mm`,
        background: "#ffffff",
        color: "#000000",
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ width: `${qrSize}mm`, height: `${qrSize}mm`, flexShrink: 0 }} dangerouslySetInnerHTML={qr ? { __html: qr } : undefined} />
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", lineHeight: 1.1 }}>
        <div style={{ fontSize: `${big}mm`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label.colorName ?? label.material}
        </div>
        <div style={{ fontSize: `${small}mm`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[label.brand, label.material, ...label.finishes.filter((f) => f !== "Basic")].join(" · ")}
        </div>
        <div style={{ fontSize: `${small}mm`, display: "flex", justifyContent: "space-between", gap: "1mm", whiteSpace: "nowrap" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{temps.join("  ")}</span>
          <span style={{ fontWeight: 700 }}>#{label.spoolId}</span>
        </div>
      </div>
      {stripe && (
        <div
          aria-hidden
          style={{
            width: `${stripeW}mm`,
            flexShrink: 0,
            marginTop: `-${pad}mm`,
            marginBottom: `-${pad}mm`,
            background:
              label.colorHexes && label.colorHexes.length >= 2
                ? `linear-gradient(${label.colorHexes.join(", ")})`
                : colorBackground(label.colorHex, null, null),
          }}
        />
      )}
    </div>
  );
}
