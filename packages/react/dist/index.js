"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserCaptureSession } from "@scanly/browser";
export function useScanly(options = {}) {
    const session = useMemo(() => new BrowserCaptureSession(options), []);
    const [outcome, setOutcome] = useState(null);
    const [scanning, setScanning] = useState(false);
    useEffect(() => {
        session.initialize();
        session.start();
        return () => session.dispose();
    }, [session]);
    const scanFile = useCallback(async (file, scanOptions = {}) => {
        setScanning(true);
        try {
            const next = await session.scanFile(file, scanOptions);
            setOutcome(next);
            return next;
        }
        finally {
            setScanning(false);
        }
    }, [session]);
    const cancel = useCallback(() => { session.cancel(); setScanning(false); }, [session]);
    const reset = useCallback(() => { session.cancel(); setScanning(false); setOutcome(null); }, [session]);
    return { session, outcome, scanning, scanFile, cancel, reset };
}
//# sourceMappingURL=index.js.map