#include "scanly/core.h"

#include <cassert>
#include <cstdint>
#include <iostream>
#include <limits>
#include <vector>

int main()
{
    scanly_context_t *context = nullptr;
    scanly_context_options_t context_options{};
    context_options.struct_size = sizeof(context_options);
    context_options.abi_version = SCANLY_CORE_ABI_VERSION;
    context_options.backend = SCANLY_BACKEND_FIXTURE;
    assert(scanly_context_create(&context_options, &context) == SCANLY_STATUS_OK);

    scanly_decode_options_t options{};
    options.struct_size = sizeof(options);
    options.abi_version = SCANLY_CORE_ABI_VERSION;
    options.format_mask = SCANLY_FORMAT_MASK_ALL;
    options.max_results = 1;
    std::vector<uint8_t> bytes(32, 0);
    scanly_result_set_t *results = reinterpret_cast<scanly_result_set_t *>(0x1);

    assert(scanly_decode_y_plane(context, nullptr, 0, 1, 1, 1, 1, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 0, 1, 1, 1, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 2, 2, 2, 0, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);
    assert(scanly_decode_y_plane(context, bytes.data(), 3, 2, 2, 2, 1, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 2, 2, 2, 1, &options, &results) == SCANLY_STATUS_DECODE_FAILED);
    assert(results != nullptr);
    scanly_engine_diagnostic_view_t diagnostic{};
    scanly_engine_diagnostic_view_init(&diagnostic);
    assert(scanly_result_set_engine_diagnostics(results, &diagnostic) == SCANLY_STATUS_OK);
    assert(diagnostic.status == SCANLY_ENGINE_NOT_FOUND);
    scanly_result_set_destroy(results);
    results = nullptr;

    scanly_image_view_t image{};
    image.struct_size = sizeof(image);
    image.data = bytes.data();
    image.data_len = bytes.size();
    image.width = 1;
    image.height = 1;
    image.row_stride = 1;
    image.pixel_stride = 1;
    image.pixel_format = SCANLY_PIXEL_Y;
    image.rotation_degrees = 45;
    assert(scanly_decode(context, &image, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);

    options.format_mask = 0;
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 1, 1, 1, 1, &options, &results) == SCANLY_STATUS_UNSUPPORTED_FORMAT);
    assert(results == nullptr);
    options.format_mask = UINT32_MAX;
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 1, 1, 1, 1, &options, &results) == SCANLY_STATUS_UNSUPPORTED_FORMAT);
    assert(results == nullptr);
    options.format_mask = SCANLY_FORMAT_MASK_ALL;
    options.max_results = SCANLY_CORE_MAX_RESULTS + 1U;
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 1, 1, 1, 1, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);

    options.max_results = 1;
    assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), 2, 2, std::numeric_limits<size_t>::max(), 1, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);

    image.rotation_degrees = 0;
    image.width = std::numeric_limits<uint32_t>::max();
    image.height = std::numeric_limits<uint32_t>::max();
    image.row_stride = std::numeric_limits<size_t>::max();
    assert(scanly_decode(context, &image, &options, &results) == SCANLY_STATUS_INVALID_INPUT);
    assert(results == nullptr);

    for (int iteration = 0; iteration < 256; ++iteration) {
        scanly_context_t *cycle_context = nullptr;
        scanly_context_options_t cycle_options{};
        cycle_options.struct_size = sizeof(cycle_options);
        cycle_options.abi_version = SCANLY_ABI_VERSION;
        cycle_options.backend = SCANLY_BACKEND_FIXTURE;
        assert(scanly_context_create(&cycle_options, &cycle_context) == SCANLY_STATUS_OK);
        scanly_context_destroy(cycle_context);
    }

    scanly_context_destroy(context);
    std::cout << "scanly_native_malformed_test: PASS\n";
    return 0;
}
