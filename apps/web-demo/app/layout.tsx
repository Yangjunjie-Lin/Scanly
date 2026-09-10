import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scanly — Browser QR Decoder",
  description:
    "Scan supported barcodes locally with Scanly SDK v2.1.0. URL safety intelligence is a separate, optional opt-in; barcode images and camera frames are never uploaded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
