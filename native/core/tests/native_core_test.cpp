#include "scanly/core.h"

#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

namespace {

scanly_context_t *create_context()
{
    scanly_context_options_t options{};
    options.struct_size = sizeof(options);
    options.abi_version = SCANLY_CORE_ABI_VERSION;
    options.backend = SCANLY_BACKEND_FIXTURE;
    scanly_context_t *context = nullptr;
    assert(scanly_context_create(&options, &context) == SCANLY_STATUS_OK);
    assert(context != nullptr);
    return context;
}

std::vector<uint8_t> fixture()
{
    /* SCANLYFX, count=2, QR("HELLO"), Code128("BINARY") + raw bytes. */
    return {
        'S', 'C', 'A', 'N', 'L', 'Y', 'F', 'X', 2,
        static_cast<uint8_t>(SCANLY_FORMAT_QR_CODE), 5, 3, 'H', 'E', 'L', 'L', 'O', 1, 2, 3,
        static_cast<uint8_t>(SCANLY_FORMAT_CODE_128), 6, 6, 'B', 'I', 'N', 'A', 'R', 'Y', 0, 0x01, 0x00, 0xff, 0x42, 0x7f,
    };
}

std::vector<uint8_t> rgba_fixture(const std::vector<uint8_t>& source, bool bgra)
{
    std::vector<uint8_t> image(source.size() * 4U, 0xff);
    for (size_t index = 0; index < source.size(); ++index) {
        image[index * 4U + 0U] = source[index];
        image[index * 4U + 1U] = source[index];
        image[index * 4U + 2U] = source[index];
        image[index * 4U + 3U] = bgra ? 0x7f : 0xff;
    }
    return image;
}

void check_result(const scanly_result_view_t& result, uint32_t format, const char *payload)
{
    assert(result.format == format);
    assert(result.corner_count == 4);
    assert(result.corner_points != nullptr);
    assert(result.payload_len == std::strlen(payload));
    assert(std::memcmp(result.payload_utf8, payload, result.payload_len) == 0);
    assert(result.bounding_box.width >= 0.0 && result.bounding_box.height >= 0.0);
    assert(result.engine_id_len > 0);
}

} // namespace

int main()
{
    assert(std::string(scanly_status_message(SCANLY_STATUS_INVALID_INPUT)) == "invalid_input");
    auto context = create_context();
    auto source = fixture();
    auto rgba = rgba_fixture(source, false);

    scanly_decode_options_t options{};
    options.struct_size = sizeof(options);
    options.abi_version = SCANLY_CORE_ABI_VERSION;
    options.format_mask = SCANLY_FORMAT_MASK_ALL;
    options.max_results = SCANLY_CORE_MAX_RESULTS;
    scanly_result_set_t *results = nullptr;
    assert(scanly_decode_rgba(context, rgba.data(), rgba.size(), static_cast<uint32_t>(source.size()), 1, rgba.size(), &options, &results) == SCANLY_STATUS_OK);
    assert(scanly_result_set_count(results) == 2);
    scanly_result_set_destroy(results);

    auto bgra = rgba_fixture(source, true);
    const scanly_image_view_t bgra_view{
        sizeof(scanly_image_view_t), bgra.data(), bgra.size(), static_cast<uint32_t>(source.size()), 1,
        bgra.size(), 4, SCANLY_PIXEL_BGRA, 0
    };
    results = nullptr;
    assert(scanly_decode(context, &bgra_view, &options, &results) == SCANLY_STATUS_OK);
    assert(scanly_result_set_count(results) == 2);
    scanly_result_set_destroy(results);

    /* The fixture is luminance-encoded; exercise a padded Y plane path. */
    std::vector<uint8_t> y_plane(4 * 32, 0);
    std::memcpy(y_plane.data(), source.data(), source.size());
    assert(scanly_decode_y_plane(context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &results) == SCANLY_STATUS_OK);
    assert(scanly_result_set_count(results) == 2);
    scanly_result_view_t first{};
    scanly_result_view_init(&first);
    assert(scanly_result_get(results, 0, &first) == SCANLY_STATUS_OK);
    check_result(first, SCANLY_FORMAT_QR_CODE, "HELLO");
    assert(first.raw_bytes_len == 3 && first.raw_bytes[1] == 2);
    scanly_result_view_t second{};
    scanly_result_view_init(&second);
    assert(scanly_result_get(results, 1, &second) == SCANLY_STATUS_OK);
    check_result(second, SCANLY_FORMAT_CODE_128, "BINARY");
    assert(second.raw_bytes_len == 6 && second.raw_bytes[3] == 0xff);

    scanly_engine_diagnostic_view_t diagnostic{};
    scanly_engine_diagnostic_view_init(&diagnostic);
    assert(scanly_result_set_engine_diagnostics(results, &diagnostic) == SCANLY_STATUS_OK);
    assert(diagnostic.status == SCANLY_ENGINE_SUCCESS && diagnostic.result_count == 2);
    std::fill(y_plane.begin(), y_plane.end(), 0);
    check_result(first, SCANLY_FORMAT_QR_CODE, "HELLO");
    scanly_result_set_destroy(results);

    std::memcpy(y_plane.data(), source.data(), source.size());

    options.format_mask = SCANLY_FORMAT_QR_CODE;
    results = nullptr;
    assert(scanly_decode_y_plane(context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &results) == SCANLY_STATUS_OK);
    assert(scanly_result_set_count(results) == 1);
    assert(scanly_result_get(results, 0, &first) == SCANLY_STATUS_OK);
    check_result(first, SCANLY_FORMAT_QR_CODE, "HELLO");
    scanly_result_set_destroy(results);

    scanly_cancel_token_t *token = nullptr;
    assert(scanly_cancel_token_create(&token) == SCANLY_STATUS_OK);
    scanly_cancel_token_cancel(token);
    options.format_mask = SCANLY_FORMAT_MASK_ALL;
    options.cancel_token = token;
    results = nullptr;
    assert(scanly_decode_y_plane(context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &results) == SCANLY_STATUS_CANCELLED);
    assert(results == nullptr);
    scanly_cancel_token_destroy(token);

    /* Result storage is independent of the context lifetime. */
    options.cancel_token = nullptr;
    assert(scanly_decode_y_plane(context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &results) == SCANLY_STATUS_OK);
    scanly_context_destroy(context);
    assert(scanly_result_set_count(results) == 2);
    scanly_result_set_destroy(results);

    /* Distinct contexts can decode concurrently. */
    std::vector<std::thread> workers;
    for (int worker = 0; worker < 4; ++worker) {
        workers.emplace_back([&]() {
            auto thread_context = create_context();
            for (int iteration = 0; iteration < 100; ++iteration) {
                scanly_result_set_t *thread_results = nullptr;
                assert(scanly_decode_y_plane(thread_context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &thread_results) == SCANLY_STATUS_OK);
                scanly_result_set_destroy(thread_results);
            }
            scanly_context_destroy(thread_context);
        });
    }
    for (auto& worker : workers) worker.join();

    /* Repeated lifecycle smoke test used by native memory CI. */
    for (int iteration = 0; iteration < 10'000; ++iteration) {
        auto loop_context = create_context();
        scanly_result_set_t *loop_results = nullptr;
        assert(scanly_decode_y_plane(loop_context, y_plane.data(), y_plane.size(), 32, 4, 32, 1, &options, &loop_results) == SCANLY_STATUS_OK);
        scanly_result_set_destroy(loop_results);
        scanly_context_destroy(loop_context);
    }

    std::cout << "scanly_native_core_test: PASS\n";
    return 0;
}
