#include <jni.h>
#include <cstdint>
#include <limits>
#include <string>
#include <string_view>
#include <vector>
#include "scanly/core.h"

namespace {
jclass result_class(JNIEnv *env) { return env->FindClass("io/scanly/sdk/NativeResult"); }

void throw_scanly(JNIEnv *env, scanly_status_t status)
{
    auto klass = env->FindClass("io/scanly/sdk/ScanlyException");
    if (klass != nullptr) {
        env->ThrowNew(klass, scanly_status_message(status));
        env->DeleteLocalRef(klass);
    }
}

jstring utf8_string(JNIEnv *env, const char *data, size_t size)
{
    if (data == nullptr)
        return nullptr;

    // NewStringUTF consumes JNI modified UTF-8 and terminates at NUL. The C
    // ABI carries an explicit UTF-8 length, so decode it to UTF-16 instead.
    std::u16string output;
    output.reserve(size);
    const auto *bytes = reinterpret_cast<const uint8_t *>(data);
    size_t index = 0;
    while (index < size) {
        uint32_t codepoint = 0;
        size_t continuation_count = 0;
        const uint8_t lead = bytes[index];
        if (lead < 0x80U) {
            codepoint = lead;
        } else if ((lead & 0xE0U) == 0xC0U) {
            codepoint = lead & 0x1FU;
            continuation_count = 1;
        } else if ((lead & 0xF0U) == 0xE0U) {
            codepoint = lead & 0x0FU;
            continuation_count = 2;
        } else if ((lead & 0xF8U) == 0xF0U) {
            codepoint = lead & 0x07U;
            continuation_count = 3;
        } else {
            output.push_back(u'\uFFFD');
            ++index;
            continue;
        }

        if (index + continuation_count >= size) {
            output.push_back(u'\uFFFD');
            break;
        }
        bool valid = true;
        for (size_t offset = 1; offset <= continuation_count; ++offset) {
            const uint8_t continuation = bytes[index + offset];
            if ((continuation & 0xC0U) != 0x80U) {
                valid = false;
                break;
            }
            codepoint = (codepoint << 6U) | (continuation & 0x3FU);
        }
        const uint32_t minimum = continuation_count == 1 ? 0x80U : continuation_count == 2 ? 0x800U : continuation_count == 3 ? 0x10000U : 0U;
        if (!valid || codepoint < minimum || codepoint > 0x10FFFFU || (codepoint >= 0xD800U && codepoint <= 0xDFFFU)) {
            output.push_back(u'\uFFFD');
            ++index;
            continue;
        }
        index += continuation_count + 1;
        if (codepoint <= 0xFFFFU) {
            output.push_back(static_cast<char16_t>(codepoint));
        } else {
            codepoint -= 0x10000U;
            output.push_back(static_cast<char16_t>(0xD800U + (codepoint >> 10U)));
            output.push_back(static_cast<char16_t>(0xDC00U + (codepoint & 0x3FFU)));
        }
    }
    if (output.size() > static_cast<size_t>(std::numeric_limits<jsize>::max())) {
        throw_scanly(env, SCANLY_STATUS_OUT_OF_MEMORY);
        return nullptr;
    }
    return env->NewString(reinterpret_cast<const jchar *>(output.data()), static_cast<jsize>(output.size()));
}

jstring required_utf8_string(JNIEnv *env, const char *data, size_t size)
{
    if (data != nullptr) return utf8_string(env, data, size);
    if (size != 0) {
        throw_scanly(env, SCANLY_STATUS_INTERNAL_ERROR);
        return nullptr;
    }
    static constexpr jchar empty = 0;
    return env->NewString(&empty, 0);
}
}

extern "C" JNIEXPORT jlong JNICALL Java_io_scanly_sdk_NativeBridge_create(JNIEnv *env, jobject)
{
    scanly_context_options_t options{};
    scanly_context_options_init(&options);
    options.backend = SCANLY_BACKEND_ZXING_CPP;
    scanly_context_t *context = nullptr;
    const auto status = scanly_context_create(&options, &context);
    if (status != SCANLY_STATUS_OK) { throw_scanly(env, status); return 0; }
    return reinterpret_cast<jlong>(context);
}

extern "C" JNIEXPORT void JNICALL Java_io_scanly_sdk_NativeBridge_destroy(JNIEnv *, jobject, jlong handle)
{
    scanly_context_destroy(reinterpret_cast<scanly_context_t *>(handle));
}

extern "C" JNIEXPORT jobjectArray JNICALL Java_io_scanly_sdk_NativeBridge_decodeYPlane(
    JNIEnv *env, jobject, jlong handle, jobject buffer, jint data_len, jint width, jint height,
    jint row_stride, jint pixel_stride, jint format_mask, jint max_results)
{
    auto *data = static_cast<uint8_t *>(env->GetDirectBufferAddress(buffer));
    const jlong capacity = env->GetDirectBufferCapacity(buffer);
    if (handle == 0 || data == nullptr || data_len < 0 || capacity < 0 || static_cast<jlong>(data_len) > capacity) {
        throw_scanly(env, SCANLY_STATUS_INVALID_INPUT);
        return nullptr;
    }
    scanly_decode_options_t options{};
    scanly_decode_options_init(&options);
    options.format_mask = static_cast<uint32_t>(format_mask);
    options.max_results = static_cast<uint32_t>(max_results);
    scanly_result_set_t *results = nullptr;
    const auto status = scanly_decode_y_plane(reinterpret_cast<scanly_context_t *>(handle), data,
        static_cast<size_t>(data_len), static_cast<uint32_t>(width), static_cast<uint32_t>(height),
        static_cast<size_t>(row_stride), static_cast<size_t>(pixel_stride), &options, &results);
    if (status != SCANLY_STATUS_OK) { scanly_result_set_destroy(results); throw_scanly(env, status); return nullptr; }

    jclass klass = result_class(env);
    if (klass == nullptr) { scanly_result_set_destroy(results); return nullptr; }
    jmethodID ctor = env->GetMethodID(klass, "<init>", "(Ljava/lang/String;[BI[DDDDDDIILjava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");
    if (ctor == nullptr) { scanly_result_set_destroy(results); return nullptr; }
    const auto count = scanly_result_set_count(results);
    jobjectArray array = env->NewObjectArray(static_cast<jsize>(count), klass, nullptr);
    if (array == nullptr) { scanly_result_set_destroy(results); return nullptr; }
    for (size_t index = 0; index < count; ++index) {
        scanly_result_view_t view{};
        scanly_result_view_init(&view);
        if (scanly_result_get(results, index, &view) != SCANLY_STATUS_OK) continue;
        jstring payload = required_utf8_string(env, view.payload_utf8, view.payload_len);
        jbyteArray raw = env->NewByteArray(static_cast<jsize>(view.raw_bytes_len));
        if (payload == nullptr || raw == nullptr) break;
        if (view.raw_bytes_len > 0)
            env->SetByteArrayRegion(raw, 0, static_cast<jsize>(view.raw_bytes_len), reinterpret_cast<const jbyte *>(view.raw_bytes));
        jdoubleArray corners = env->NewDoubleArray(static_cast<jsize>(view.corner_count * 2));
        if (corners == nullptr) break;
        std::vector<jdouble> points; points.reserve(view.corner_count * 2);
        for (uint32_t point = 0; point < view.corner_count; ++point) { points.push_back(view.corner_points[point].x); points.push_back(view.corner_points[point].y); }
        env->SetDoubleArrayRegion(corners, 0, static_cast<jsize>(points.size()), points.data());
        jstring metadata = utf8_string(env, view.structured_metadata_json, view.structured_metadata_json_len);
        jstring engine = utf8_string(env, view.engine_id, view.engine_id_len);
        jstring diagnostics = utf8_string(env, view.diagnostics_json, view.diagnostics_json_len);
        jobject result = env->NewObject(klass, ctor, payload, raw, static_cast<jint>(view.format), corners,
            view.bounding_box.x, view.bounding_box.y, view.bounding_box.width, view.bounding_box.height,
            view.orientation_degrees, static_cast<jint>(view.checksum_status), static_cast<jint>(view.flags),
            metadata, engine, diagnostics);
        env->SetObjectArrayElement(array, static_cast<jsize>(index), result);
        env->DeleteLocalRef(payload);
        env->DeleteLocalRef(raw);
        env->DeleteLocalRef(corners);
        if (metadata != nullptr) env->DeleteLocalRef(metadata);
        if (engine != nullptr) env->DeleteLocalRef(engine);
        if (diagnostics != nullptr) env->DeleteLocalRef(diagnostics);
        if (result != nullptr) env->DeleteLocalRef(result);
        if (env->ExceptionCheck()) break;
    }
    scanly_result_set_destroy(results);
    return array;
}
