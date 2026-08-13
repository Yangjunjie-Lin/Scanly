#ifndef SCANLY_NATIVE_CORE_H
#define SCANLY_NATIVE_CORE_H

/*
 * Scanly Native Core C ABI.
 *
 * The ABI intentionally exposes only fixed-width values, opaque handles and
 * borrowed slices. No C++ standard-library type crosses this boundary.
 */

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32) && defined(scanly_core_EXPORTS)
#  define SCANLY_CORE_API __declspec(dllexport)
#elif defined(_WIN32) && defined(SCANLY_CORE_SHARED)
#  define SCANLY_CORE_API __declspec(dllimport)
#elif defined(__GNUC__) || defined(__clang__)
#  define SCANLY_CORE_API __attribute__((visibility("default")))
#else
#  define SCANLY_CORE_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define SCANLY_CORE_ABI_VERSION UINT32_C(1)
#define SCANLY_CORE_MAX_RESULTS UINT32_C(64)

typedef struct scanly_context_t scanly_context_t;
typedef struct scanly_result_set_t scanly_result_set_t;
typedef struct scanly_cancel_token_t scanly_cancel_token_t;

typedef uint32_t scanly_status_t;
#define SCANLY_STATUS_OK UINT32_C(0)
#define SCANLY_STATUS_INVALID_INPUT UINT32_C(1)
#define SCANLY_STATUS_UNSUPPORTED_FORMAT UINT32_C(2)
#define SCANLY_STATUS_DECODE_FAILED UINT32_C(3)
#define SCANLY_STATUS_ENGINE_INITIALIZATION_FAILED UINT32_C(4)
#define SCANLY_STATUS_ENGINE_EXECUTION_FAILED UINT32_C(5)
#define SCANLY_STATUS_CANCELLED UINT32_C(6)
#define SCANLY_STATUS_OUT_OF_MEMORY UINT32_C(7)
#define SCANLY_STATUS_INTERNAL_ERROR UINT32_C(8)

typedef uint32_t scanly_backend_t;
/* Deterministic contract backend. It is not a barcode decoder. */
#define SCANLY_BACKEND_FIXTURE UINT32_C(1)
/* Requires an externally supplied ZXing-C++ installation at build time. */
#define SCANLY_BACKEND_ZXING_CPP UINT32_C(2)

typedef uint32_t scanly_pixel_format_t;
#define SCANLY_PIXEL_Y UINT32_C(1)
#define SCANLY_PIXEL_RGBA UINT32_C(2)
#define SCANLY_PIXEL_BGRA UINT32_C(3)

/* Public Scanly format vocabulary. Values are stable bit flags. */
#define SCANLY_FORMAT_QR_CODE (UINT32_C(1) << 0)
#define SCANLY_FORMAT_DATA_MATRIX (UINT32_C(1) << 1)
#define SCANLY_FORMAT_PDF417 (UINT32_C(1) << 2)
#define SCANLY_FORMAT_CODE_128 (UINT32_C(1) << 3)
#define SCANLY_FORMAT_EAN_13 (UINT32_C(1) << 4)
#define SCANLY_FORMAT_EAN_8 (UINT32_C(1) << 5)
#define SCANLY_FORMAT_UPC_A (UINT32_C(1) << 6)
#define SCANLY_FORMAT_UPC_E (UINT32_C(1) << 7)
#define SCANLY_FORMAT_MASK_ALL (SCANLY_FORMAT_QR_CODE | SCANLY_FORMAT_DATA_MATRIX | \
                                SCANLY_FORMAT_PDF417 | SCANLY_FORMAT_CODE_128 | \
                                SCANLY_FORMAT_EAN_13 | SCANLY_FORMAT_EAN_8 | \
                                SCANLY_FORMAT_UPC_A | SCANLY_FORMAT_UPC_E)

typedef uint32_t scanly_format_class_t;
#define SCANLY_FORMAT_CLASS_UNKNOWN UINT32_C(0)
#define SCANLY_FORMAT_CLASS_MATRIX UINT32_C(1)
#define SCANLY_FORMAT_CLASS_STACKED UINT32_C(2)
#define SCANLY_FORMAT_CLASS_LINEAR UINT32_C(3)

typedef uint32_t scanly_checksum_status_t;
#define SCANLY_CHECKSUM_UNKNOWN UINT32_C(0)
#define SCANLY_CHECKSUM_NOT_APPLICABLE UINT32_C(1)
#define SCANLY_CHECKSUM_VALID UINT32_C(2)
#define SCANLY_CHECKSUM_INVALID UINT32_C(3)

typedef uint32_t scanly_engine_status_t;
#define SCANLY_ENGINE_SUCCESS UINT32_C(0)
#define SCANLY_ENGINE_NOT_FOUND UINT32_C(1)
#define SCANLY_ENGINE_UNSUPPORTED UINT32_C(2)
#define SCANLY_ENGINE_CANCELLED UINT32_C(3)
#define SCANLY_ENGINE_INITIALIZATION_FAILURE UINT32_C(4)
#define SCANLY_ENGINE_EXECUTION_FAILURE UINT32_C(5)

typedef struct scanly_context_options_t {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t backend;
    uint32_t reserved[5];
} scanly_context_options_t;

typedef struct scanly_image_view_t {
    uint32_t struct_size;
    const uint8_t *data;
    size_t data_len;
    uint32_t width;
    uint32_t height;
    size_t row_stride;
    size_t pixel_stride;
    uint32_t pixel_format;
    uint32_t rotation_degrees;
} scanly_image_view_t;

typedef struct scanly_decode_options_t {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t format_mask;
    uint32_t max_results;
    uint32_t flags;
    const scanly_cancel_token_t *cancel_token;
    uint32_t reserved[3];
} scanly_decode_options_t;

typedef struct scanly_point_t {
    double x;
    double y;
} scanly_point_t;

typedef struct scanly_bbox_t {
    double x;
    double y;
    double width;
    double height;
} scanly_bbox_t;

/* Result flags are additive and may be extended in later ABI versions. */
#define SCANLY_RESULT_FLAG_HAS_ORIENTATION UINT32_C(1) << 0
#define SCANLY_RESULT_FLAG_GS1 UINT32_C(1) << 1
#define SCANLY_RESULT_FLAG_VALIDATED UINT32_C(1) << 2
#define SCANLY_RESULT_FLAG_GEOMETRY_ESTIMATED UINT32_C(1) << 3

typedef struct scanly_result_view_t {
    uint32_t struct_size;
    uint32_t format;
    uint32_t format_class;
    uint32_t flags;
    uint32_t checksum_status;
    uint32_t corner_count;
    uint32_t reserved0;
    const scanly_point_t *corner_points;
    scanly_bbox_t bounding_box;
    double orientation_degrees;
    const char *payload_utf8;
    size_t payload_len;
    const uint8_t *raw_bytes;
    size_t raw_bytes_len;
    const char *symbology_identifier;
    size_t symbology_identifier_len;
    const char *structured_metadata_json;
    size_t structured_metadata_json_len;
    const char *engine_id;
    size_t engine_id_len;
    const char *engine_version;
    size_t engine_version_len;
    const char *diagnostics_json;
    size_t diagnostics_json_len;
    uint32_t reserved[4];
} scanly_result_view_t;

typedef struct scanly_engine_diagnostic_view_t {
    uint32_t struct_size;
    uint32_t status;
    uint64_t elapsed_us;
    uint32_t attempt_count;
    uint32_t result_count;
    const char *engine_id;
    size_t engine_id_len;
    const char *engine_version;
    size_t engine_version_len;
    const char *error_code;
    size_t error_code_len;
    const char *message;
    size_t message_len;
    const char *diagnostics_json;
    size_t diagnostics_json_len;
    uint32_t reserved[4];
} scanly_engine_diagnostic_view_t;

SCANLY_CORE_API const char *scanly_core_version(void);
SCANLY_CORE_API const char *scanly_status_message(scanly_status_t status);

SCANLY_CORE_API void scanly_context_options_init(scanly_context_options_t *options);
SCANLY_CORE_API void scanly_image_view_init(scanly_image_view_t *image);
SCANLY_CORE_API void scanly_decode_options_init(scanly_decode_options_t *options);
SCANLY_CORE_API void scanly_result_view_init(scanly_result_view_t *view);
SCANLY_CORE_API void scanly_engine_diagnostic_view_init(scanly_engine_diagnostic_view_t *view);

SCANLY_CORE_API scanly_status_t scanly_context_create(
    const scanly_context_options_t *options,
    scanly_context_t **out_context);
SCANLY_CORE_API void scanly_context_destroy(scanly_context_t *context);

SCANLY_CORE_API scanly_status_t scanly_cancel_token_create(scanly_cancel_token_t **out_token);
SCANLY_CORE_API void scanly_cancel_token_cancel(scanly_cancel_token_t *token);
SCANLY_CORE_API void scanly_cancel_token_destroy(scanly_cancel_token_t *token);

SCANLY_CORE_API scanly_status_t scanly_decode(
    scanly_context_t *context,
    const scanly_image_view_t *image,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results);

/*
 * On DECODE_FAILED or ENGINE_EXECUTION_FAILED, out_results may hold an empty
 * result-set containing engine diagnostics. The caller must destroy every
 * non-NULL result-set regardless of the returned status.
 */

SCANLY_CORE_API scanly_status_t scanly_decode_rgba(
    scanly_context_t *context,
    const uint8_t *data,
    size_t data_len,
    uint32_t width,
    uint32_t height,
    size_t row_stride,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results);

SCANLY_CORE_API scanly_status_t scanly_decode_y_plane(
    scanly_context_t *context,
    const uint8_t *data,
    size_t data_len,
    uint32_t width,
    uint32_t height,
    size_t row_stride,
    size_t pixel_stride,
    const scanly_decode_options_t *options,
    scanly_result_set_t **out_results);

SCANLY_CORE_API size_t scanly_result_set_count(const scanly_result_set_t *results);
SCANLY_CORE_API scanly_status_t scanly_result_get(
    const scanly_result_set_t *results,
    size_t index,
    scanly_result_view_t *out_view);
SCANLY_CORE_API scanly_status_t scanly_result_set_engine_diagnostics(
    const scanly_result_set_t *results,
    scanly_engine_diagnostic_view_t *out_view);
SCANLY_CORE_API const char *scanly_result_set_diagnostics_json(
    const scanly_result_set_t *results,
    size_t *out_len);
SCANLY_CORE_API void scanly_result_set_destroy(scanly_result_set_t *results);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* SCANLY_NATIVE_CORE_H */
