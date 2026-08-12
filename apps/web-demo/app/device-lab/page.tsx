import type { Metadata } from "next";
import DeviceLab from "../../components/DeviceLab";

export const metadata: Metadata = { title: "Scanly Device Lab", description: "Physical camera diagnostics and fail-closed evidence collection harness." };

export default function DeviceLabPage() {
  return <main><DeviceLab /><p className="small"><a href="/">Return to the regular demo</a></p></main>;
}
