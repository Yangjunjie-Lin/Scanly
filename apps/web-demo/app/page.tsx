import QRTool from "../components/QRTool";

export default function Page() {
  return (
    <main className="row" style={{ flexDirection: "column", gap: 14 }}>
      <header className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Scanly</h1>
          <div className="small">
            Browser-side Scanly SDK v2.0.0 barcode scanner with bounded frame scheduling, temporal confirmation, and multi-layer decoder fallbacks. Camera or
            upload — processing stays on your device.
          </div>
        </div>
        <div className="badge">
          <span>Local-only · no server upload</span>
        </div>
      </header>

      <QRTool />

      <footer className="small" style={{ opacity: 0.7 }}>
        Privacy: images never leave your browser. Tip: for difficult codes use Upload mode. See{" "}
        <a href="https://github.com/Yangjunjie-Lin/Scanly" style={{ textDecoration: "underline" }}>
          docs
        </a>{" "}
        for benchmark details.
      </footer>
    </main>
  );
}
