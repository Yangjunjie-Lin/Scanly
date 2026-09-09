import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scanly — Browser QR Decoder",
  description:
    "Scan supported barcodes with the Scanly SDK v2.0.1 Stable camera runtime or local image input — local-only, with no uploads or accounts.",
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
