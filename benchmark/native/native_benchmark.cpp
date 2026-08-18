#include "scanly/core.h"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#ifndef SCANLY_REPOSITORY_ROOT
#error SCANLY_REPOSITORY_ROOT is required
#endif

namespace {
using Clock = std::chrono::steady_clock;

struct Fixture {
    const char *id;
    const char *file;
    uint32_t width;
    uint32_t height;
    size_t row_stride;
    size_t expected_count;
};

std::vector<uint8_t> read_bytes(const char *relative)
{
    std::ifstream stream(std::string(SCANLY_REPOSITORY_ROOT) + "/" + relative, std::ios::binary);
    if (!stream.good()) throw std::runtime_error(std::string("Unable to read ") + relative);
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}

scanly_context_t *create_context()
{
    scanly_context_options_t options{};
    scanly_context_options_init(&options);
    options.backend = SCANLY_BACKEND_ZXING_CPP;
    scanly_context_t *context = nullptr;
    if (scanly_context_create(&options, &context) != SCANLY_STATUS_OK || context == nullptr)
        throw std::runtime_error("Unable to initialize ZXing-C++ context");
    return context;
}

double percentile(std::vector<double> samples, double quantile)
{
    std::sort(samples.begin(), samples.end());
    const auto index = static_cast<size_t>((samples.size() - 1) * quantile);
    return samples[index];
}

std::vector<double> benchmark_fixture(scanly_context_t *context, const Fixture& fixture, int iterations)
{
    const auto bytes = read_bytes(fixture.file);
    scanly_decode_options_t options{};
    scanly_decode_options_init(&options);
    options.format_mask = SCANLY_FORMAT_MASK_ALL;
    options.max_results = 16;
    std::vector<double> timings;
    timings.reserve(static_cast<size_t>(iterations));
    for (int iteration = 0; iteration < iterations; ++iteration) {
        scanly_result_set_t *results = nullptr;
        const auto started = Clock::now();
        const auto status = scanly_decode_y_plane(context, bytes.data(), bytes.size(), fixture.width, fixture.height,
                                                   fixture.row_stride, 1, &options, &results);
        const auto elapsed = std::chrono::duration<double, std::milli>(Clock::now() - started).count();
        if (status != SCANLY_STATUS_OK || results == nullptr || scanly_result_set_count(results) != fixture.expected_count) {
            scanly_result_set_destroy(results);
            throw std::runtime_error(std::string("Benchmark decode failed for ") + fixture.id);
        }
        scanly_result_set_destroy(results);
        timings.push_back(elapsed);
    }
    return timings;
}
}

int main(int argc, char **argv)
{
    try {
        const Fixture small{"small-single", "fixtures/native/data-matrix-01.y8", 80, 80, 80, 1};
        const Fixture large{"large-single", "fixtures/native/qr-code-01.y8", 610, 610, 610, 1};
        const Fixture multi{"multi-code", "fixtures/native/mixed-01.y8", 1300, 820, 1300, 2};
        constexpr int cold_iterations = 30;
        constexpr int warm_iterations = 100;

        std::vector<double> cold;
        cold.reserve(cold_iterations);
        for (int iteration = 0; iteration < cold_iterations; ++iteration) {
            const auto started = Clock::now();
            auto *context = create_context();
            cold.push_back(std::chrono::duration<double, std::milli>(Clock::now() - started).count());
            scanly_context_destroy(context);
        }

        auto *context = create_context();
        const auto small_timings = benchmark_fixture(context, small, warm_iterations);
        const auto large_timings = benchmark_fixture(context, large, warm_iterations);
        const auto multi_timings = benchmark_fixture(context, multi, warm_iterations);
        scanly_context_destroy(context);

        const std::string json = std::string("{\n")
            + "  \"schemaVersion\": \"beta5-native-benchmark-1\",\n"
            + "  \"sdkVersion\": \"2.0.0-beta.5\",\n"
            + "  \"classification\": \"development-baseline\",\n"
            + "  \"commercialThresholds\": null,\n"
            + "  \"units\": \"milliseconds\",\n"
            + "  \"metrics\": {\n"
            + "    \"coldInit\": {\"iterations\": 30, \"p50\": " + std::to_string(percentile(cold, 0.50)) + ", \"p95\": " + std::to_string(percentile(cold, 0.95)) + "},\n"
            + "    \"warmSmallSingle\": {\"iterations\": 100, \"p50\": " + std::to_string(percentile(small_timings, 0.50)) + ", \"p95\": " + std::to_string(percentile(small_timings, 0.95)) + "},\n"
            + "    \"warmLargeSingle\": {\"iterations\": 100, \"p50\": " + std::to_string(percentile(large_timings, 0.50)) + ", \"p95\": " + std::to_string(percentile(large_timings, 0.95)) + "},\n"
            + "    \"warmMultiCode\": {\"iterations\": 100, \"p50\": " + std::to_string(percentile(multi_timings, 0.50)) + ", \"p95\": " + std::to_string(percentile(multi_timings, 0.95)) + "}\n"
            + "  }\n}\n";

        if (argc > 1) {
            const std::filesystem::path output(argv[1]);
            if (output.has_parent_path()) std::filesystem::create_directories(output.parent_path());
            std::ofstream stream(output);
            stream << json;
        } else {
            std::cout << json;
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "scanly_native_benchmark: " << error.what() << '\n';
        return 1;
    }
}
