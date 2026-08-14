#include "scanly/core.h"

#include <cstddef>
#include <cstdint>
#include <vector>

/* This entry point is compatible with libFuzzer when linked with -fsanitize=fuzzer. */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    scanly_context_options_t context_options{};
    context_options.struct_size = sizeof(context_options);
    context_options.abi_version = SCANLY_CORE_ABI_VERSION;
    context_options.backend = SCANLY_BACKEND_FIXTURE;
    scanly_context_t *context = nullptr;
    if (scanly_context_create(&context_options, &context) != SCANLY_STATUS_OK)
        return 0;
    scanly_decode_options_t options{};
    options.struct_size = sizeof(options);
    options.abi_version = SCANLY_CORE_ABI_VERSION;
    options.format_mask = size > 0 ? (static_cast<uint32_t>(data[0]) << 1U) : 0U;
    options.format_mask &= SCANLY_FORMAT_MASK_ALL;
    options.max_results = size > 1 ? static_cast<uint32_t>(data[1] % SCANLY_CORE_MAX_RESULTS) : 1U;
    if (options.max_results == 0) options.max_results = 1;
    const uint32_t width = size > 2 ? static_cast<uint32_t>(data[2]) : 1U;
    const uint32_t height = size > 3 ? static_cast<uint32_t>(data[3]) : 1U;
    const size_t row_stride = size > 4 ? static_cast<size_t>(data[4]) : 1U;
    std::vector<uint8_t> buffer(data, data + size);
    scanly_result_set_t *results = nullptr;
    (void)scanly_decode_y_plane(context, buffer.data(), buffer.size(), width, height, row_stride, 1, &options, &results);
    scanly_result_set_destroy(results);
    scanly_context_destroy(context);
    return 0;
}

#ifdef SCANLY_FUZZ_STANDALONE
int main()
{
    return 0;
}
#endif
