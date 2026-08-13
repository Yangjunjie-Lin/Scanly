cmake_minimum_required(VERSION 3.22.1)
project(scanly_android LANGUAGES C CXX)

set(SCANLY_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(SCANLY_ENABLE_ZXING_CPP ON CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN YES)

add_subdirectory(../../../../../core scanly-core)
add_library(scanly_jni SHARED scanly_jni.cpp)
target_compile_features(scanly_jni PRIVATE cxx_std_20)
target_link_options(scanly_jni PRIVATE -Wl,--exclude-libs,ALL)
target_link_libraries(scanly_jni PRIVATE scanly_core android log)
