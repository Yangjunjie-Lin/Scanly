#include "scanly/core.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <new>
#include <string>
#include <utility>
#include <vector>

#if defined(SCANLY_ENABLE_ZXING_CPP)
#include <Barcode.h>
#include <BarcodeFormat.h>
#include <Content.h>
#include <ImageView.h>
#include <ReadBarcode.h>
#include <ReaderOptions.h>
#endif

namespace {

constexpr uint32_t kKnownFormatMask = SCANLY_FORMAT_MASK_ALL;
constexpr uint32_t kDefaultMaxResults = 16;
constexpr uint32_t kMaximumDimension = 65'535;
constexpr uint64_t kMaximumPixels = 100'000'000;
constexpr std::array<uint8_t, 8> kFixtureMagic{{'S', 'C', 'A', 'N', 'L', 'Y', 'F', 'X'}};

struct OwnedResult {
    uint32_t format = 0;
    uint32_t format_class = SCANLY_FORMAT_CLASS_UNKNOWN;
    uint32_t flags = 0;
    uint32_t checksum_status = SCANLY_CHECKSUM_UNKNOWN;
    std::array<scanly_point_t, 4> corners{};
    uint32_t corner_count = 0;
    scanly_bbox_t bounding_box{};
    double orientation_degrees = 0.0;
    std::string payload;
    std::vector<uint8_t> raw_bytes;
    std::string symbology_identifier;
    std::string structured_metadata_json;
    std::string engine_id;
    std::string engine_version;
    std::string diagnostics_json;
};

struct OwnedDiagnostic {
    uint32_t status = SCANLY_ENGINE_NOT_FOUND;
    uint64_t elapsed_us = 0;
    uint32_t attempt_count = 1;
    uint32_t result_count = 0;
    std::string engine_id;
    std::string engine_version;
    std::string error_code;
    std::string message;
    std::string diagnostics_json;
};

struct BackendResult {
    scanly_status_t status = SCANLY_STATUS_DECODE_FAILED;
    std::vector<OwnedResult> results;
    OwnedDiagnostic diagnostic;
    std::string diagnostics_json;
};

struct ValidatedInput {
    const scanly_image_view_t *image = nullptr;
    scanly_decode_options_t options{};
};

bool checked_add(size_t left, size_t right, size_t *out)
{
    if (out == nullptr || left > std::numeric_limits<size_t>::max() - right)
        return false;
    *out = left + right;
    return true;
}

bool checked_multiply(size_t left, size_t right, size_t *out)
{
    if (out == nullptr || (left != 0 && right > std::numeric_limits<size_t>::max() / left))
        return false;
    *out = left * right;
    return true;
}

bool is_cancelled(const scanly_cancel_token_t *token);

const char *non_null_data(const std::string& value)
{
    return value.empty() ? nullptr : value.data();
}

const uint8_t *non_null_data(const std::vector<uint8_t>& value)
{
    return value.empty() ? nullptr : value.data();
}

scanly_format_class_t format_class(uint32_t format)
{
    switch (format) {
    case SCANLY_FORMAT_QR_CODE:
    case SCANLY_FORMAT_DATA_MATRIX:
        return SCANLY_FORMAT_CLASS_MATRIX;
    case SCANLY_FORMAT_PDF417:
        return SCANLY_FORMAT_CLASS_STACKED;
    case SCANLY_FORMAT_CODE_128:
    case SCANLY_FORMAT_EAN_13:
    case SCANLY_FORMAT_EAN_8:
    case SCANLY_FORMAT_UPC_A:
    case SCANLY_FORMAT_UPC_E:
        return SCANLY_FORMAT_CLASS_LINEAR;
    default:
        return SCANLY_FORMAT_CLASS_UNKNOWN;
    }
}

bool is_single_format(uint32_t format)
{
    return format != 0 && (format & (format - 1U)) == 0 && (format & kKnownFormatMask) != 0;
}

bool valid_retail_checksum(const std::string& value)
{
    if (value.size() < 2 || !std::all_of(value.begin(), value.end(), [](char digit) { return digit >= '0' && digit <= '9'; }))
        return false;
    int sum = 0;
    int position = 0;
    for (size_t index = value.size() - 1; index-- > 0; ++position)
        sum += (value[index] - '0') * (position % 2 == 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 == value.back() - '0';
}

std::string expand_upc_e(const std::string& value)
{
    if (value.size() != 8 || (value[0] != '0' && value[0] != '1') ||
        !std::all_of(value.begin(), value.end(), [](char digit) { return digit >= '0' && digit <= '9'; }))
        return {};
    const auto body = value.substr(1, 6);
    const char last = body[5];
    std::string manufacturer;
    std::string product;
    if (last >= '0' && last <= '2') {
        manufacturer = body.substr(0, 2) + last + "00";
        product = "00" + body.substr(2, 3);
    } else if (last == '3') {
        manufacturer = body.substr(0, 3) + "00";
        product = "000" + body.substr(3, 2);
    } else if (last == '4') {
        manufacturer = body.substr(0, 4) + "0";
        product = "0000" + body.substr(4, 1);
    } else {
        manufacturer = body.substr(0, 5);
        product = "0000" + std::string(1, last);
    }
    const auto expanded = std::string(1, value[0]) + manufacturer + product + value[7];
    return valid_retail_checksum(expanded) ? expanded : std::string{};
}

std::string compress_upc_a(const std::string& value)
{
    if (value.size() != 12 || !valid_retail_checksum(value) || (value[0] != '0' && value[0] != '1'))
        return {};
    const auto manufacturer = value.substr(1, 5);
    const auto product = value.substr(6, 5);
    const char number_system = value[0];
    const char check = value[11];
    const std::array<std::string, 4> candidates{{
        std::string(1, number_system) + manufacturer.substr(0, 2) + product.substr(2) + manufacturer[2] + check,
        std::string(1, number_system) + manufacturer.substr(0, 3) + product.substr(3) + '3' + check,
        std::string(1, number_system) + manufacturer.substr(0, 4) + product[4] + '4' + check,
        std::string(1, number_system) + manufacturer + product[4] + check,
    }};
    const auto match = std::find_if(candidates.begin(), candidates.end(), [&](const std::string& candidate) {
        return expand_upc_e(candidate) == value;
    });
    return match == candidates.end() ? std::string{} : *match;
}

scanly_decode_options_t default_decode_options()
{
    scanly_decode_options_t options{};
    options.struct_size = sizeof(options);
    options.abi_version = SCANLY_CORE_ABI_VERSION;
    options.format_mask = SCANLY_FORMAT_QR_CODE;
    options.max_results = kDefaultMaxResults;
    return options;
}

scanly_status_t validate_decode_options(const scanly_decode_options_t *input, scanly_decode_options_t *output)
{
    if (output == nullptr)
        return SCANLY_STATUS_INTERNAL_ERROR;
    *output = default_decode_options();
    if (input == nullptr)
        return SCANLY_STATUS_OK;
    if (input->struct_size < sizeof(scanly_decode_options_t) || input->abi_version != SCANLY_CORE_ABI_VERSION)
        return SCANLY_STATUS_INVALID_INPUT;
    if (input->format_mask == 0 || (input->format_mask & ~kKnownFormatMask) != 0)
        return SCANLY_STATUS_UNSUPPORTED_FORMAT;
    if (input->max_results == 0 || input->max_results > SCANLY_CORE_MAX_RESULTS)
        return SCANLY_STATUS_INVALID_INPUT;
    if (input->flags != 0 || std::any_of(std::begin(input->reserved), std::end(input->reserved), [](uint32_t value) { return value != 0; }))
        return SCANLY_STATUS_INVALID_INPUT;
    *output = *input;
    return SCANLY_STATUS_OK;
}

scanly_status_t validate_image(const scanly_image_view_t *image)
{
    if (image == nullptr || image->struct_size < sizeof(scanly_image_view_t))
        return SCANLY_STATUS_INVALID_INPUT;
    if (image->data == nullptr || image->width == 0 || image->height == 0)
        return SCANLY_STATUS_INVALID_INPUT;
    if (image->width > kMaximumDimension || image->height > kMaximumDimension)
        return SCANLY_STATUS_INVALID_INPUT;
    if (image->row_stride > static_cast<size_t>(std::numeric_limits<int>::max()) ||
        image->pixel_stride > static_cast<size_t>(std::numeric_limits<int>::max()))
        return SCANLY_STATUS_INVALID_INPUT;
    if (static_cast<uint64_t>(image->width) * image->height > kMaximumPixels)
        return SCANLY_STATUS_INVALID_INPUT;
    if (image->rotation_degrees != 0 && image->rotation_degrees != 90 &&
        image->rotation_degrees != 180 && image->rotation_degrees != 270)
        return SCANLY_STATUS_INVALID_INPUT;

    size_t minimum_row_bytes = 0;
    size_t final_row_bytes = 0;
    switch (image->pixel_format) {
    case SCANLY_PIXEL_Y: {
        if (image->pixel_stride == 0)
            return SCANLY_STATUS_INVALID_INPUT;
        size_t span = 0;
        if (!checked_multiply(static_cast<size_t>(image->width - 1U), image->pixel_stride, &span) ||
            !checked_add(span, 1, &minimum_row_bytes))
            return SCANLY_STATUS_INVALID_INPUT;
        final_row_bytes = minimum_row_bytes;
        break;
    }
    case SCANLY_PIXEL_RGBA:
    case SCANLY_PIXEL_BGRA:
        if (image->pixel_stride != 4)
            return SCANLY_STATUS_INVALID_INPUT;
        if (!checked_multiply(static_cast<size_t>(image->width), 4, &minimum_row_bytes))
            return SCANLY_STATUS_INVALID_INPUT;
        final_row_bytes = minimum_row_bytes;
        break;
    default:
        return SCANLY_STATUS_INVALID_INPUT;
    }
    if (image->row_stride < minimum_row_bytes)
        return SCANLY_STATUS_INVALID_INPUT;

    size_t prior_rows = 0;
    size_t required_bytes = 0;
    if (!checked_multiply(static_cast<size_t>(image->height - 1U), image->row_stride, &prior_rows) ||
        !checked_add(prior_rows, final_row_bytes, &required_bytes) ||
        image->data_len < required_bytes)
        return SCANLY_STATUS_INVALID_INPUT;
    return SCANLY_STATUS_OK;
}

scanly_status_t validate_input(
    const scanly_image_view_t *image,
    const scanly_decode_options_t *options,
    ValidatedInput *output)
{
    if (output == nullptr)
        return SCANLY_STATUS_INTERNAL_ERROR;
    auto status = validate_image(image);
    if (status != SCANLY_STATUS_OK)
        return status;
    status = validate_decode_options(options, &output->options);
    if (status != SCANLY_STATUS_OK)
        return status;
    output->image = image;
    if (is_cancelled(output->options.cancel_token))
        return SCANLY_STATUS_CANCELLED;
    return SCANLY_STATUS_OK;
}

size_t source_offset(const scanly_image_view_t& image, uint32_t x, uint32_t y)
{
    return static_cast<size_t>(y) * image.row_stride + static_cast<size_t>(x) * image.pixel_stride;
}

std::vector<uint8_t> luminance_prefix(const scanly_image_view_t& image, size_t limit)
{
    std::vector<uint8_t> bytes;
    bytes.reserve(std::min(limit, static_cast<size_t>(image.width) * image.height));
    for (uint32_t y = 0; y < image.height && bytes.size() < limit; ++y) {
        for (uint32_t x = 0; x < image.width && bytes.size() < limit; ++x) {
            const auto offset = source_offset(image, x, y);
            if (image.pixel_format == SCANLY_PIXEL_Y) {
                bytes.push_back(image.data[offset]);
                continue;
            }
            const uint8_t *pixel = image.data + offset;
            const uint32_t red = image.pixel_format == SCANLY_PIXEL_RGBA ? pixel[0] : pixel[2];
            const uint32_t green = pixel[1];
            const uint32_t blue = image.pixel_format == SCANLY_PIXEL_RGBA ? pixel[2] : pixel[0];
            bytes.push_back(static_cast<uint8_t>((306U * red + 601U * green + 117U * blue + 512U) >> 10U));
        }
    }
    return bytes;
}

void set_geometry(OwnedResult *result, const scanly_image_view_t& image, uint32_t index, uint32_t count)
{
    if (result == nullptr)
        return;
    const double width = static_cast<double>(image.width - 1U);
    const double height = static_cast<double>(image.height - 1U);
    const double cells = static_cast<double>(std::max(count, 1U));
    const double left = std::floor(width * static_cast<double>(index) / cells);
    const double right = index + 1U == count ? width : std::floor(width * static_cast<double>(index + 1U) / cells);
    result->corners = {{{left, 0.0}, {right, 0.0}, {right, height}, {left, height}}};
    result->corner_count = 4;
    result->bounding_box = {left, 0.0, right - left, height};
    result->orientation_degrees = 0.0;
    result->flags |= SCANLY_RESULT_FLAG_GEOMETRY_ESTIMATED;
}

BackendResult fixture_decode(const ValidatedInput& input)
{
    BackendResult output;
    output.diagnostic.engine_id = "scanly-fixture";
    output.diagnostic.engine_version = "1";
    output.diagnostic.diagnostics_json = R"({"backend":"fixture","productionDecoder":false})";
    output.diagnostics_json = R"({"backend":"fixture","productionDecoder":false,"coordinateSpace":"original-input"})";

    const auto bytes = luminance_prefix(*input.image, 16'384);
    if (bytes.size() < kFixtureMagic.size() + 1U ||
        !std::equal(kFixtureMagic.begin(), kFixtureMagic.end(), bytes.begin())) {
        output.status = SCANLY_STATUS_DECODE_FAILED;
        output.diagnostic.status = SCANLY_ENGINE_NOT_FOUND;
        output.diagnostic.error_code = "decode_failed";
        output.diagnostic.message = "No deterministic Scanly fixture envelope was found.";
        return output;
    }

    const uint32_t encoded_count = bytes[kFixtureMagic.size()];
    if (encoded_count == 0 || encoded_count > SCANLY_CORE_MAX_RESULTS) {
        output.status = SCANLY_STATUS_ENGINE_EXECUTION_FAILED;
        output.diagnostic.status = SCANLY_ENGINE_EXECUTION_FAILURE;
        output.diagnostic.error_code = "fixture_invalid_count";
        output.diagnostic.message = "The fixture result count is invalid.";
        return output;
    }

    size_t cursor = kFixtureMagic.size() + 1U;
    output.results.reserve(std::min(encoded_count, input.options.max_results));
    for (uint32_t encoded_index = 0; encoded_index < encoded_count; ++encoded_index) {
        if (cursor + 3U > bytes.size()) {
            output.status = SCANLY_STATUS_ENGINE_EXECUTION_FAILED;
            output.diagnostic.status = SCANLY_ENGINE_EXECUTION_FAILURE;
            output.diagnostic.error_code = "fixture_truncated";
            output.diagnostic.message = "The fixture envelope ended before a record header.";
            output.results.clear();
            return output;
        }
        const uint32_t format = bytes[cursor++];
        const size_t payload_length = bytes[cursor++];
        const size_t raw_length = bytes[cursor++];
        size_t record_length = 0;
        if (!checked_add(payload_length, raw_length, &record_length) ||
            cursor > bytes.size() || record_length > bytes.size() - cursor) {
            output.status = SCANLY_STATUS_ENGINE_EXECUTION_FAILED;
            output.diagnostic.status = SCANLY_ENGINE_EXECUTION_FAILURE;
            output.diagnostic.error_code = "fixture_truncated";
            output.diagnostic.message = "The fixture envelope ended inside a record.";
            output.results.clear();
            return output;
        }
        if (!is_single_format(format)) {
            output.status = SCANLY_STATUS_ENGINE_EXECUTION_FAILED;
            output.diagnostic.status = SCANLY_ENGINE_EXECUTION_FAILURE;
            output.diagnostic.error_code = "fixture_unsupported_format";
            output.diagnostic.message = "The fixture envelope contains an unsupported format.";
            output.results.clear();
            return output;
        }

        const uint8_t *payload = bytes.data() + cursor;
        cursor += payload_length;
        const uint8_t *raw = bytes.data() + cursor;
        cursor += raw_length;
        if ((format & input.options.format_mask) == 0 || output.results.size() >= input.options.max_results)
            continue;

        OwnedResult result;
        result.format = format;
        result.format_class = format_class(format);
        result.flags = SCANLY_RESULT_FLAG_VALIDATED;
        result.checksum_status = (format_class(format) == SCANLY_FORMAT_CLASS_LINEAR)
            ? SCANLY_CHECKSUM_VALID
            : SCANLY_CHECKSUM_NOT_APPLICABLE;
        result.payload.assign(reinterpret_cast<const char *>(payload), payload_length);
        result.raw_bytes.assign(raw, raw + raw_length);
        if (result.raw_bytes.empty())
            result.raw_bytes.assign(payload, payload + payload_length);
        result.symbology_identifier = "]S0";
        result.structured_metadata_json = R"({"fixture":true})";
        result.engine_id = "scanly-fixture";
        result.engine_version = "1";
        result.diagnostics_json = R"({"deterministicFixture":true,"productionDecoder":false})";
        output.results.push_back(std::move(result));
    }

    if (output.results.empty()) {
        output.status = SCANLY_STATUS_DECODE_FAILED;
        output.diagnostic.status = SCANLY_ENGINE_NOT_FOUND;
        output.diagnostic.error_code = "decode_failed";
        output.diagnostic.message = "Fixture records did not match the requested format filter.";
        return output;
    }

    const auto result_count = static_cast<uint32_t>(output.results.size());
    for (uint32_t index = 0; index < result_count; ++index)
        set_geometry(&output.results[index], *input.image, index, result_count);
    output.status = SCANLY_STATUS_OK;
    output.diagnostic.status = SCANLY_ENGINE_SUCCESS;
    output.diagnostic.result_count = result_count;
    output.diagnostic.message = "Deterministic fixture records decoded for ABI testing.";
    return output;
}

#if defined(SCANLY_ENABLE_ZXING_CPP)
ZXing::BarcodeFormats zxing_formats(uint32_t mask)
{
    std::vector<ZXing::BarcodeFormat> formats;
    if ((mask & SCANLY_FORMAT_QR_CODE) != 0) formats.push_back(ZXing::BarcodeFormat::QRCode);
    if ((mask & SCANLY_FORMAT_DATA_MATRIX) != 0) formats.push_back(ZXing::BarcodeFormat::DataMatrix);
    if ((mask & SCANLY_FORMAT_PDF417) != 0) formats.push_back(ZXing::BarcodeFormat::PDF417);
    if ((mask & SCANLY_FORMAT_CODE_128) != 0) formats.push_back(ZXing::BarcodeFormat::Code128);
    if ((mask & SCANLY_FORMAT_EAN_13) != 0) formats.push_back(ZXing::BarcodeFormat::EAN13);
    if ((mask & SCANLY_FORMAT_EAN_8) != 0) formats.push_back(ZXing::BarcodeFormat::EAN8);
    if ((mask & SCANLY_FORMAT_UPC_A) != 0) formats.push_back(ZXing::BarcodeFormat::UPCA);
    if ((mask & SCANLY_FORMAT_UPC_E) != 0) formats.push_back(ZXing::BarcodeFormat::UPCE);
    return ZXing::BarcodeFormats(std::move(formats));
}

uint32_t scanly_format(ZXing::BarcodeFormat format)
{
    switch (format) {
    case ZXing::BarcodeFormat::QRCode: return SCANLY_FORMAT_QR_CODE;
    case ZXing::BarcodeFormat::DataMatrix: return SCANLY_FORMAT_DATA_MATRIX;
    case ZXing::BarcodeFormat::PDF417: return SCANLY_FORMAT_PDF417;
    case ZXing::BarcodeFormat::Code128: return SCANLY_FORMAT_CODE_128;
    case ZXing::BarcodeFormat::EAN13: return SCANLY_FORMAT_EAN_13;
    case ZXing::BarcodeFormat::EAN8: return SCANLY_FORMAT_EAN_8;
    case ZXing::BarcodeFormat::UPCA: return SCANLY_FORMAT_UPC_A;
    case ZXing::BarcodeFormat::UPCE: return SCANLY_FORMAT_UPC_E;
    default: return 0;
    }
}

BackendResult zxing_decode(const ValidatedInput& input)
{
    BackendResult output;
    output.diagnostic.engine_id = "zxing-cpp";
    output.diagnostic.engine_version = "external";
    output.diagnostic.diagnostics_json = R"({"backend":"zxing-cpp","productionDecoder":true})";
    output.diagnostics_json = R"({"backend":"zxing-cpp","coordinateSpace":"original-input"})";

    ZXing::ImageFormat image_format = ZXing::ImageFormat::Lum;
    if (input.image->pixel_format == SCANLY_PIXEL_RGBA) image_format = ZXing::ImageFormat::RGBA;
    if (input.image->pixel_format == SCANLY_PIXEL_BGRA) image_format = ZXing::ImageFormat::BGRA;
    const ZXing::ImageView image(
        input.image->data,
        static_cast<int>(input.image->width),
        static_cast<int>(input.image->height),
        image_format,
        static_cast<int>(input.image->row_stride),
        static_cast<int>(input.image->pixel_stride));
    const ZXing::ReaderOptions options = ZXing::ReaderOptions()
        .setFormats(zxing_formats(input.options.format_mask))
        .setMaxNumberOfSymbols(static_cast<uint8_t>(input.options.max_results))
        .setTextMode(ZXing::TextMode::HRI);
    const auto barcodes = ZXing::ReadBarcodes(image, options);
    output.results.reserve(barcodes.size());
    for (const auto& barcode : barcodes) {
        auto format = scanly_format(barcode.format());
        auto payload = barcode.text();
        // ZXing represents UPC-A as EAN-13 with one leading zero whenever
        // EAN-13 and UPC-A are requested together. Preserve Scanly's public
        // UPC-A identity exactly as the Web/WASM adapter does.
        if (format == SCANLY_FORMAT_EAN_13 &&
            (input.options.format_mask & SCANLY_FORMAT_UPC_A) != 0 &&
            payload.size() == 13 && payload.front() == '0' &&
            std::all_of(payload.begin(), payload.end(), [](char value) { return value >= '0' && value <= '9'; })) {
            format = SCANLY_FORMAT_UPC_A;
            payload.erase(payload.begin());
        }
        if (format == SCANLY_FORMAT_UPC_E && payload.size() == 13 && payload.front() == '0') {
            const auto compressed = compress_upc_a(payload.substr(1));
            if (!compressed.empty()) payload = compressed;
        }
        if (format == 0 || output.results.size() >= input.options.max_results)
            continue;
        OwnedResult result;
        result.format = format;
        result.format_class = format_class(format);
        result.flags = SCANLY_RESULT_FLAG_HAS_ORIENTATION;
        result.payload = std::move(payload);
        const auto& bytes = barcode.bytes();
        result.raw_bytes.assign(bytes.begin(), bytes.end());
        result.symbology_identifier = barcode.symbologyIdentifier();
        result.engine_id = "zxing-cpp";
        result.engine_version = "external";
        result.diagnostics_json = R"({"backend":"zxing-cpp"})";
        result.orientation_degrees = static_cast<double>(barcode.orientation());
        result.checksum_status = barcode.isValid() ? SCANLY_CHECKSUM_VALID : SCANLY_CHECKSUM_INVALID;
        if (barcode.isValid()) result.flags |= SCANLY_RESULT_FLAG_VALIDATED;
        const auto& position = barcode.position();
        result.corner_count = 4;
        double min_x = std::numeric_limits<double>::max();
        double min_y = std::numeric_limits<double>::max();
        double max_x = std::numeric_limits<double>::lowest();
        double max_y = std::numeric_limits<double>::lowest();
        for (size_t index = 0; index < result.corners.size(); ++index) {
            result.corners[index] = {static_cast<double>(position[index].x), static_cast<double>(position[index].y)};
            min_x = std::min(min_x, result.corners[index].x);
            min_y = std::min(min_y, result.corners[index].y);
            max_x = std::max(max_x, result.corners[index].x);
            max_y = std::max(max_y, result.corners[index].y);
        }
        result.bounding_box = {min_x, min_y, max_x - min_x, max_y - min_y};
        output.results.push_back(std::move(result));
    }
    if (output.results.empty()) {
        output.status = SCANLY_STATUS_DECODE_FAILED;
        output.diagnostic.status = SCANLY_ENGINE_NOT_FOUND;
        output.diagnostic.error_code = "decode_failed";
        output.diagnostic.message = "ZXing-C++ found no matching symbol.";
        return output;
    }
    output.status = SCANLY_STATUS_OK;
    output.diagnostic.status = SCANLY_ENGINE_SUCCESS;
    output.diagnostic.result_count = static_cast<uint32_t>(output.results.size());
    output.diagnostic.message = "ZXing-C++ decoded one or more symbols.";
    return output;
}
#endif

} // namespace

struct scanly_context_t {
    uint32_t backend = SCANLY_BACKEND_FIXTURE;
    std::mutex decode_mutex;
};

struct scanly_cancel_token_t {
    std::atomic<bool> cancelled{false};
};

struct scanly_result_set_t {
    std::vector<OwnedResult> results;
    OwnedDiagnostic diagnostic;
    std::string diagnostics_json;
};

namespace {

bool is_cancelled(const scanly_cancel_token_t *token)
{
    return token != nullptr && token->cancelled.load(std::memory_order_acquire);
}

scanly_status_t make_result_set(BackendResult&& backend, scanly_result_set_t **out_results)
{
    const auto status = backend.status;
    auto result_set = std::make_unique<scanly_result_set_t>();
    result_set->results = std::move(backend.results);
    result_set->diagnostic = std::move(backend.diagnostic);
    result_set->diagnostics_json = std::move(backend.diagnostics_json);
    *out_results = result_set.release();
    return status;
}

void fill_diagnostic_view(const OwnedDiagnostic& source, scanly_engine_diagnostic_view_t *output)
{
    *output = {};
    output->struct_size = sizeof(*output);
    output->status = source.status;
    output->elapsed_us = source.elapsed_us;
    output->attempt_count = source.attempt_count;
    output->result_count = source.result_count;
    output->engine_id = non_null_data(source.engine_id);
    output->engine_id_len = source.engine_id.size();
    output->engine_version = non_null_data(source.engine_version);
    output->engine_version_len = source.engine_version.size();
    output->error_code = non_null_data(source.error_code);
    output->error_code_len = source.error_code.size();
    output->message = non_null_data(source.message);
    output->message_len = source.message.size();
    output->diagnostics_json = non_null_data(source.diagnostics_json);
    output->diagnostics_json_len = source.diagnostics_json.size();
}

} // namespace

extern "C" {

const char *scanly_core_version(void)
{
    return "2.0.0-rc.1-native-core.1";
}

const char *scanly_status_message(scanly_status_t status)
{
    switch (status) {
    case SCANLY_STATUS_OK: return "ok";
    case SCANLY_STATUS_INVALID_INPUT: return "invalid_input";
    case SCANLY_STATUS_UNSUPPORTED_FORMAT: return "unsupported_format";
    case SCANLY_STATUS_DECODE_FAILED: return "decode_failed";
    case SCANLY_STATUS_ENGINE_INITIALIZATION_FAILED: return "engine_initialization_failed";
    case SCANLY_STATUS_ENGINE_EXECUTION_FAILED: return "engine_execution_failed";
    case SCANLY_STATUS_CANCELLED: return "cancelled";
    case SCANLY_STATUS_OUT_OF_MEMORY: return "out_of_memory";
    case SCANLY_STATUS_INTERNAL_ERROR: return "internal_error";
    default: return "internal_error";
    }
}

void scanly_context_options_init(scanly_context_options_t *options)
{
    if (options == nullptr) return;
    *options = {};
    options->struct_size = sizeof(*options);
    options->abi_version = SCANLY_CORE_ABI_VERSION;
    options->backend = SCANLY_BACKEND_ZXING_CPP;
}

void scanly_image_view_init(scanly_image_view_t *image)
{
    if (image == nullptr) return;
    *image = {};
    image->struct_size = sizeof(*image);
}

void scanly_decode_options_init(scanly_decode_options_t *options)
{
    if (options == nullptr) return;
    *options = default_decode_options();
}

void scanly_result_view_init(scanly_result_view_t *view)
{
    if (view == nullptr) return;
    *view = {};
    view->struct_size = sizeof(*view);
}

void scanly_engine_diagnostic_view_init(scanly_engine_diagnostic_view_t *view)
{
    if (view == nullptr) return;
    *view = {};
    view->struct_size = sizeof(*view);
}

scanly_status_t scanly_context_create(
    const scanly_context_options_t *options,
    scanly_context_t **out_context)
{
    if (out_context == nullptr)
        return SCANLY_STATUS_INVALID_INPUT;
    *out_context = nullptr;
    try {
        uint32_t backend = SCANLY_BACKEND_ZXING_CPP;
        if (options != nullptr) {
            if (options->struct_size < sizeof(scanly_context_options_t) ||
                options->abi_version != SCANLY_CORE_ABI_VERSION)
                return SCANLY_STATUS_INVALID_INPUT;
            backend = options->backend;
        }
        if (backend != SCANLY_BACKEND_FIXTURE && backend != SCANLY_BACKEND_ZXING_CPP)
            return SCANLY_STATUS_INVALID_INPUT;
#if !defined(SCANLY_ENABLE_ZXING_CPP)
        if (backend == SCANLY_BACKEND_ZXING_CPP)
            return SCANLY_STATUS_ENGINE_INITIALIZATION_FAILED;
#endif
        auto context = std::make_unique<scanly_context_t>();
        context->backend = backend;
        *out_context = context.release();
        return SCANLY_STATUS_OK;
    } catch (const std::bad_alloc&) {
        return SCANLY_STATUS_OUT_OF_MEMORY;
    } catch (...) {
        return SCANLY_STATUS_INTERNAL_ERROR;
    }
}

void scanly_context_destroy(scanly_context_t *context)
{
    delete context;
}

scanly_status_t scanly_cancel_token_create(scanly_cancel_token_t **out_token)
{
    if (out_token == nullptr)
        return SCANLY_STATUS_INVALID_INPUT;
    *out_token = nullptr;
    try {
        *out_token = new scanly_cancel_token_t();
        return SCANLY_STATUS_OK;
    } catch (const std::bad_alloc&) {
        return SCANLY_STATUS_OUT_OF_MEMORY;
    } catch (...) {
        return SCANLY_STATUS_INTERNAL_ERROR;
    }
}

void scanly_cancel_token_cancel(scanly_cancel_token_t *token)
{
    if (token != nullptr)
        token->cancelled.store(true, std::memory_order_release);
}

void scanly_cancel_token_destroy(scanly_cancel_token_t *token)
{
    delete token;
}

scanly_status_t scanly_decode(
    scanly_context_t *context,
    const scanly_image_view_t *image,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results)
{
    if (out_results == nullptr)
        return SCANLY_STATUS_INVALID_INPUT;
    *out_results = nullptr;
    if (context == nullptr)
        return SCANLY_STATUS_INVALID_INPUT;
    ValidatedInput input;
    auto status = validate_input(image, options, &input);
    if (status != SCANLY_STATUS_OK)
        return status;
    try {
        std::lock_guard<std::mutex> lock(context->decode_mutex);
        if (is_cancelled(input.options.cancel_token))
            return SCANLY_STATUS_CANCELLED;
        const auto started = std::chrono::steady_clock::now();
        BackendResult backend;
        switch (context->backend) {
        case SCANLY_BACKEND_FIXTURE:
            backend = fixture_decode(input);
            break;
#if defined(SCANLY_ENABLE_ZXING_CPP)
        case SCANLY_BACKEND_ZXING_CPP:
            backend = zxing_decode(input);
            break;
#endif
        default:
            return SCANLY_STATUS_ENGINE_INITIALIZATION_FAILED;
        }
        backend.diagnostic.elapsed_us = static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now() - started).count());
        if (is_cancelled(input.options.cancel_token))
            return SCANLY_STATUS_CANCELLED;
        return make_result_set(std::move(backend), out_results);
    } catch (const std::bad_alloc&) {
        return SCANLY_STATUS_OUT_OF_MEMORY;
    } catch (...) {
        return SCANLY_STATUS_ENGINE_EXECUTION_FAILED;
    }
}

scanly_status_t scanly_decode_rgba(
    scanly_context_t *context,
    const uint8_t *data,
    size_t data_len,
    uint32_t width,
    uint32_t height,
    size_t row_stride,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results)
{
    const scanly_image_view_t image{
        sizeof(scanly_image_view_t), data, data_len, width, height, row_stride, 4,
        SCANLY_PIXEL_RGBA, 0
    };
    return scanly_decode(context, &image, options, out_results);
}

scanly_status_t scanly_decode_y_plane(
    scanly_context_t *context,
    const uint8_t *data,
    size_t data_len,
    uint32_t width,
    uint32_t height,
    size_t row_stride,
    size_t pixel_stride,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results)
{
    const scanly_image_view_t image{
        sizeof(scanly_image_view_t), data, data_len, width, height, row_stride, pixel_stride,
        SCANLY_PIXEL_Y, 0
    };
    return scanly_decode(context, &image, options, out_results);
}

size_t scanly_result_set_count(const scanly_result_set_t *results)
{
    return results == nullptr ? 0 : results->results.size();
}

scanly_status_t scanly_result_get(
    const scanly_result_set_t *results,
    size_t index,
    scanly_result_view_t *out_view)
{
    if (results == nullptr || out_view == nullptr || out_view->struct_size != sizeof(scanly_result_view_t) || index >= results->results.size())
        return SCANLY_STATUS_INVALID_INPUT;
    const auto& source = results->results[index];
    *out_view = {};
    out_view->struct_size = sizeof(*out_view);
    out_view->format = source.format;
    out_view->format_class = source.format_class;
    out_view->flags = source.flags;
    out_view->checksum_status = source.checksum_status;
    out_view->corner_count = source.corner_count;
    out_view->corner_points = source.corner_count == 0 ? nullptr : source.corners.data();
    out_view->bounding_box = source.bounding_box;
    out_view->orientation_degrees = source.orientation_degrees;
    out_view->payload_utf8 = non_null_data(source.payload);
    out_view->payload_len = source.payload.size();
    out_view->raw_bytes = non_null_data(source.raw_bytes);
    out_view->raw_bytes_len = source.raw_bytes.size();
    out_view->symbology_identifier = non_null_data(source.symbology_identifier);
    out_view->symbology_identifier_len = source.symbology_identifier.size();
    out_view->structured_metadata_json = non_null_data(source.structured_metadata_json);
    out_view->structured_metadata_json_len = source.structured_metadata_json.size();
    out_view->engine_id = non_null_data(source.engine_id);
    out_view->engine_id_len = source.engine_id.size();
    out_view->engine_version = non_null_data(source.engine_version);
    out_view->engine_version_len = source.engine_version.size();
    out_view->diagnostics_json = non_null_data(source.diagnostics_json);
    out_view->diagnostics_json_len = source.diagnostics_json.size();
    return SCANLY_STATUS_OK;
}

scanly_status_t scanly_result_set_engine_diagnostics(
    const scanly_result_set_t *results,
    scanly_engine_diagnostic_view_t *out_view)
{
    if (results == nullptr || out_view == nullptr || out_view->struct_size != sizeof(scanly_engine_diagnostic_view_t))
        return SCANLY_STATUS_INVALID_INPUT;
    fill_diagnostic_view(results->diagnostic, out_view);
    return SCANLY_STATUS_OK;
}

const char *scanly_result_set_diagnostics_json(
    const scanly_result_set_t *results,
    size_t *out_len)
{
    if (out_len != nullptr)
        *out_len = results == nullptr ? 0 : results->diagnostics_json.size();
    return results == nullptr ? nullptr : non_null_data(results->diagnostics_json);
}

void scanly_result_set_destroy(scanly_result_set_t *results)
{
    delete results;
}

} // extern "C"
