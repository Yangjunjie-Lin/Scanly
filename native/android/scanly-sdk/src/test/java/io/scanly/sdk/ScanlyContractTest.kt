package io.scanly.sdk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanlyContractTest {
    @Test fun publicFormatContract() {
        assertEquals(8, ScanlyBarcodeFormat.entries.size)
        assertEquals(0xff, ScanlyOptions.Balanced.formatMask)
    }

    @Test fun typedErrors() {
        assertEquals(ScanlyErrorCode.INVALID_INPUT, ScanlyException("invalid_input").code)
        assertEquals(ScanlyErrorCode.INTERNAL_ERROR, ScanlyException("future_error").code)
    }

    @Test fun ABISetIsStable() {
        assertTrue(ScanlyBarcodeFormat.entries.all { it.nativeFlag > 0 })
    }

    @Test fun invalidOptionsRemainRepresentableForTypedNativeValidation() {
        assertEquals(0, ScanlyOptions(emptySet(), 0).formatMask)
    }
}
