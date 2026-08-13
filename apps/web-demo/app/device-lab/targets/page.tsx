import groundTruth from "../../../../../device-lab/test-targets/ground-truth.json";

/* Raw test pixels are intentional: image optimization can resample barcode modules. */
/* eslint-disable @next/next/no-img-element */

export default function DeviceTargetsPage() {
  return <main><header className="card"><h1>Beta 4 screen test targets</h1><p className="small">Expected values come from fixed Ground Truth, not observed decoder output. Printing or displaying this page is not test evidence.</p><p><a className="btn" href="/device-targets/qr-basic.png">Open basic QR alone</a> <a className="btn" href="/device-lab">Return to Device Lab</a></p></header><div className="targetGrid">{groundTruth.targets.map((target) => <section className="targetCard" key={target.targetId}><h2>{target.targetId}</h2><img src={`/device-targets/${target.targetId}.png`} alt={`${target.targetId} ${target.format}`} /><dl><dt>Format</dt><dd>{target.format}</dd><dt>Payload</dt><dd className="mono">{target.payload}</dd><dt>Creation source</dt><dd>{target.creationSource}</dd></dl></section>)}</div></main>;
}
