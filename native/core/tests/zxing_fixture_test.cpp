#include "scanly/core.h"

#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#ifndef SCANLY_REPOSITORY_ROOT
#error SCANLY_REPOSITORY_ROOT is required
#endif

struct Fixture {
    const char *file;
    uint32_t width;
    uint32_t height;
    std::vector<std::pair<uint32_t, std::string>> expected;
};

std::vector<uint8_t> read_bytes(const std::string& relative)
{
    std::ifstream stream(std::string(SCANLY_REPOSITORY_ROOT) + "/" + relative, std::ios::binary);
    assert(stream.good());
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}

int main()
{
    const Fixture fixtures[] = {
        {"fixtures/native/data-matrix-01.y8", 80, 80, {{SCANLY_FORMAT_DATA_MATRIX, "(01)09506000134352(17)271231(10)DM01"}}},
        {"fixtures/native/pdf417-01.y8", 372, 93, {{SCANLY_FORMAT_PDF417, "SCANLY-PDF417-DOCUMENT-01-DATA"}}},
        {"fixtures/native/code-128-01.y8", 1012, 200, {{SCANLY_FORMAT_CODE_128, "(01)09506000134352(17)271231(10)C01"}}},
        {"fixtures/native/ean-13-01.y8", 452, 220, {{SCANLY_FORMAT_EAN_13, "5901234100007"}}},
        {"fixtures/native/ean-8-01.y8", 324, 220, {{SCANLY_FORMAT_EAN_8, "96385005"}}},
        {"fixtures/native/upc-a-01.y8", 452, 220, {{SCANLY_FORMAT_UPC_A, "036000291407"}}},
        {"fixtures/native/upc-e-01.y8", 268, 220, {{SCANLY_FORMAT_UPC_E, "04252614"}}},
        {"fixtures/native/qr-code-01.y8", 610, 610, {{SCANLY_FORMAT_QR_CODE, "SCANLY_CLEAR_TEXT"}}},
        {"fixtures/native/mixed-01.y8", 1300, 820, {
            {SCANLY_FORMAT_QR_CODE, "SCANLY-MIXED-QR-1"},
            {SCANLY_FORMAT_CODE_128, "(01)09506000134352(17)271231(10)C01"},
        }},
    };

    scanly_context_options_t context_options{};
    scanly_context_options_init(&context_options);
    context_options.backend = SCANLY_BACKEND_ZXING_CPP;
    scanly_context_t *context = nullptr;
    assert(scanly_context_create(&context_options, &context) == SCANLY_STATUS_OK);

    for (const auto& fixture : fixtures) {
        auto bytes = read_bytes(fixture.file);
        scanly_decode_options_t options{};
        scanly_decode_options_init(&options);
        options.format_mask = SCANLY_FORMAT_MASK_ALL;
        options.max_results = 4;
        scanly_result_set_t *results = nullptr;
        assert(scanly_decode_y_plane(context, bytes.data(), bytes.size(), fixture.width, fixture.height, fixture.width, 1, &options, &results) == SCANLY_STATUS_OK);
        assert(results != nullptr && scanly_result_set_count(results) == fixture.expected.size());
        std::vector<std::pair<uint32_t, std::string>> observed;
        for (size_t index = 0; index < scanly_result_set_count(results); ++index) {
            scanly_result_view_t view{};
            scanly_result_view_init(&view);
            assert(scanly_result_get(results, index, &view) == SCANLY_STATUS_OK);
            observed.emplace_back(view.format, std::string(view.payload_utf8, view.payload_len));
            assert(view.corner_count == 4);
            assert(view.bounding_box.x >= 0 && view.bounding_box.y >= 0);
            assert(view.bounding_box.x + view.bounding_box.width <= fixture.width + 2.0);
            assert(view.bounding_box.y + view.bounding_box.height <= fixture.height + 2.0);
        }
        for (const auto& expected : fixture.expected) {
            if (std::find(observed.begin(), observed.end(), expected) == observed.end()) {
                std::cerr << fixture.file << " expected format=" << expected.first << " payload=" << expected.second << " observed:";
                for (const auto& value : observed) std::cerr << " [format=" << value.first << " payload=" << value.second << "]";
                std::cerr << '\n';
                assert(false);
            }
        }
        scanly_result_set_destroy(results);
    }

    scanly_context_destroy(context);
    std::cout << "scanly_native_zxing_fixture_test: PASS (9 fixtures / 8 formats, including multi-result)\n";
    return 0;
}
