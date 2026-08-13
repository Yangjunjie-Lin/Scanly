package io.scanly.sdk

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.nio.ByteBuffer

@RunWith(AndroidJUnit4::class)
class NativeSmokeTest {
    @Test fun nativeLibraryCreatesAndDestroysContext() {
        ScanlyDecoder().use { assertEquals(8, ScanlyBarcodeFormat.entries.size) }
    }

    @Test fun sharedNativeFixturesIncludeMultiResultParity() {
        val assets = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.assets
        val manifest = JSONObject(assets.open("manifest.json").bufferedReader().use { it.readText() })
        val fixtures = manifest.getJSONArray("fixtures")
        assertEquals(9, fixtures.length())
        ScanlyDecoder().use { decoder ->
            repeat(fixtures.length()) { fixtureIndex ->
                val fixture = fixtures.getJSONObject(fixtureIndex)
                val fileName = fixture.getString("file").substringAfterLast('/')
                val source = assets.open(fileName).use { it.readBytes() }
                val buffer = ByteBuffer.allocateDirect(source.size).apply { put(source); flip() }
                val results = decoder.decodeYPlane(
                    buffer,
                    fixture.getInt("width"),
                    fixture.getInt("height"),
                    fixture.getInt("rowStride"),
                    fixture.getInt("pixelStride"),
                )
                assertEquals(fixture.getString("id"), fixture.getInt("expectedResultCount"), results.size)
                val expected = fixture.getJSONArray("requiredResults")
                repeat(expected.length()) { resultIndex ->
                    val result = expected.getJSONObject(resultIndex)
                    assertTrue(fixture.getString("id"), results.any {
                        it.format.wireName == result.getString("format") && it.payload == result.getString("payload")
                    })
                }
                assertTrue(fixture.getString("id"), results.all {
                    it.cornerPoints.size == 4 && it.boundingBox.x >= 0 && it.boundingBox.y >= 0 &&
                        it.boundingBox.x + it.boundingBox.width <= fixture.getInt("width") + 2.0 &&
                        it.boundingBox.y + it.boundingBox.height <= fixture.getInt("height") + 2.0
                })
            }
        }
    }
}
