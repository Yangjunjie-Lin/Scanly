import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scanly — Browser QR Decoder",
  description:
    "Decode QR codes with camera or image upload. Heuristic image preprocessing runs fully in your browser — no uploads, no accounts.",
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
