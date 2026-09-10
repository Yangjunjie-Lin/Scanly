cmake_minimum_required(VERSION 3.16)

project(scanly_native_core VERSION 2.1.0 LANGUAGES C CXX)

option(SCANLY_BUILD_TESTS "Build Scanly native core contract tests" ON)
option(SCANLY_BUILD_FUZZ "Build the standalone malformed-input fuzz harness" OFF)
option(SCANLY_BUILD_BENCHMARK "Build the Scanly native development benchmark" OFF)
option(SCANLY_ENABLE_ZXING_CPP "Enable the optional external ZXing-C++ backend" OFF)
option(SCANLY_FETCH_ZXING_CPP "Fetch the pinned ZXing-C++ backend" OFF)
set(SCANLY_ZXING_SOURCE_DIR "" CACHE PATH "Optional path to a ZXing-C++ source checkout")
set(SCANLY_CORE_LIBRARY_TYPE "STATIC" CACHE STRING "Scanly Core library type: STATIC or SHARED")
set_property(CACHE SCANLY_CORE_LIBRARY_TYPE PROPERTY STRINGS STATIC SHARED)
if (NOT SCANLY_CORE_LIBRARY_TYPE STREQUAL "STATIC" AND NOT SCANLY_CORE_LIBRARY_TYPE STREQUAL "SHARED")
    message(FATAL_ERROR "SCANLY_CORE_LIBRARY_TYPE must be STATIC or SHARED")
endif()

add_library(scanly_core ${SCANLY_CORE_LIBRARY_TYPE}
    src/scanly_core.cpp
)

target_compile_features(scanly_core PUBLIC cxx_std_20)
set_target_properties(scanly_core PROPERTIES
    C_VISIBILITY_PRESET hidden
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN YES
    POSITION_INDEPENDENT_CODE YES
)
target_include_directories(scanly_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

if (SCANLY_CORE_LIBRARY_TYPE STREQUAL "SHARED")
    target_compile_definitions(scanly_core PUBLIC SCANLY_CORE_SHARED=1)
endif()

if (SCANLY_BUILD_BENCHMARK)
    if (NOT SCANLY_ENABLE_ZXING_CPP)
        message(FATAL_ERROR "SCANLY_BUILD_BENCHMARK requires SCANLY_ENABLE_ZXING_CPP=ON")
    endif()
    add_executable(scanly_native_benchmark ../../benchmark/native/native_benchmark.cpp)
    target_compile_features(scanly_native_benchmark PRIVATE cxx_std_20)
    target_compile_definitions(scanly_native_benchmark PRIVATE SCANLY_REPOSITORY_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../..")
    target_link_libraries(scanly_native_benchmark PRIVATE scanly_core)
endif()

if (MSVC)
    target_compile_options(scanly_core PRIVATE /W4 /permissive-)
else()
    target_compile_options(scanly_core PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wshadow)
endif()

if (SCANLY_ENABLE_ZXING_CPP)
    set(CMAKE_POSITION_INDEPENDENT_CODE ON)
    if (SCANLY_FETCH_ZXING_CPP AND NOT SCANLY_ZXING_SOURCE_DIR)
        include(FetchContent)
        FetchContent_Declare(scanly_zxingcpp
            GIT_REPOSITORY https://github.com/zxing-cpp/zxing-cpp.git
            GIT_TAG 6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861
            GIT_SHALLOW FALSE
        )
        FetchContent_GetProperties(scanly_zxingcpp)
        if (NOT scanly_zxingcpp_POPULATED)
            FetchContent_Populate(scanly_zxingcpp)
        endif()
        set(SCANLY_ZXING_SOURCE_DIR "${scanly_zxingcpp_SOURCE_DIR}")
    endif()
    if (SCANLY_ZXING_SOURCE_DIR)
        set(ZXING_READERS ON CACHE BOOL "Build ZXing readers" FORCE)
        set(ZXING_WRITERS OFF CACHE BOOL "Build ZXing writers" FORCE)
        set(ZXING_EXAMPLES OFF CACHE BOOL "Do not build ZXing examples" FORCE)
        set(ZXING_EXAMPLES_QT OFF CACHE BOOL "Do not build ZXing Qt examples" FORCE)
        set(ZXING_C_API OFF CACHE BOOL "Do not build the upstream C wrapper" FORCE)
        set(ZXING_UNIT_TESTS OFF CACHE BOOL "Do not build ZXing unit tests" FORCE)
        set(ZXING_BLACKBOX_TESTS OFF CACHE BOOL "Do not build ZXing black-box tests" FORCE)
        set(CMAKE_DISABLE_FIND_PACKAGE_Doxygen TRUE CACHE BOOL "Do not build dependency documentation" FORCE)
        add_subdirectory("${SCANLY_ZXING_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/zxing-cpp" EXCLUDE_FROM_ALL)
    else()
        find_package(ZXing CONFIG REQUIRED)
    endif()
    target_compile_definitions(scanly_core PRIVATE SCANLY_ENABLE_ZXING_CPP=1)
    target_link_libraries(scanly_core PRIVATE ZXing::ZXing)
endif()

if (UNIX AND NOT APPLE AND SCANLY_CORE_LIBRARY_TYPE STREQUAL "SHARED")
    target_link_options(scanly_core PRIVATE -Wl,--exclude-libs,ALL)
endif()

include(CTest)

if (SCANLY_BUILD_TESTS)
    add_executable(scanly_native_core_test tests/native_core_test.cpp)
    target_compile_features(scanly_native_core_test PRIVATE cxx_std_20)
    target_link_libraries(scanly_native_core_test PRIVATE scanly_core)
    add_test(NAME scanly_native_core_test COMMAND scanly_native_core_test)

    add_executable(scanly_native_malformed_test tests/malformed_input_test.cpp)
    target_compile_features(scanly_native_malformed_test PRIVATE cxx_std_20)
    target_link_libraries(scanly_native_malformed_test PRIVATE scanly_core)
    add_test(NAME scanly_native_malformed_test COMMAND scanly_native_malformed_test)

    add_executable(scanly_native_c_abi_test tests/c_abi_test.c)
    set_target_properties(scanly_native_c_abi_test PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED YES)
    target_link_libraries(scanly_native_c_abi_test PRIVATE scanly_core)
    add_test(NAME scanly_native_c_abi_test COMMAND scanly_native_c_abi_test)

    if (SCANLY_ENABLE_ZXING_CPP)
        add_executable(scanly_native_zxing_fixture_test tests/zxing_fixture_test.cpp)
        target_compile_features(scanly_native_zxing_fixture_test PRIVATE cxx_std_20)
        target_compile_definitions(scanly_native_zxing_fixture_test PRIVATE SCANLY_REPOSITORY_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../..")
        target_link_libraries(scanly_native_zxing_fixture_test PRIVATE scanly_core)
        add_test(NAME scanly_native_zxing_fixture_test COMMAND scanly_native_zxing_fixture_test)
    endif()

    foreach(scanly_test_target IN ITEMS scanly_native_core_test scanly_native_malformed_test scanly_native_c_abi_test)
        if (MSVC)
            target_compile_options(${scanly_test_target} PRIVATE /UNDEBUG)
        else()
            target_compile_options(${scanly_test_target} PRIVATE -UNDEBUG)
        endif()
    endforeach()
    if (TARGET scanly_native_zxing_fixture_test)
        if (MSVC)
            target_compile_options(scanly_native_zxing_fixture_test PRIVATE /UNDEBUG)
        else()
            target_compile_options(scanly_native_zxing_fixture_test PRIVATE -UNDEBUG)
        endif()
    endif()
endif()

if (SCANLY_BUILD_FUZZ)
    add_executable(scanly_native_fuzz tests/fuzz_image_view.cpp)
    target_compile_features(scanly_native_fuzz PRIVATE cxx_std_20)
    target_compile_definitions(scanly_native_fuzz PRIVATE SCANLY_FUZZ_STANDALONE=1)
    target_link_libraries(scanly_native_fuzz PRIVATE scanly_core)
endif()

install(TARGETS scanly_core ARCHIVE DESTINATION lib LIBRARY DESTINATION lib RUNTIME DESTINATION bin)
install(DIRECTORY include/ DESTINATION include)
