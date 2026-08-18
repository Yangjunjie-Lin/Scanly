import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scanly — Browser QR Decoder",
  description:
    "Scan supported barcodes with the Scanly SDK v2 Beta 1 real-time camera runtime or local image upload — no uploads, no accounts.",
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
