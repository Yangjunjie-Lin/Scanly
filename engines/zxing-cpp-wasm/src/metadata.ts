import type { ZxingCppWasmBuildMetadata } from "./types.js";

// Keep in sync with wasm/metadata.json; wasm:verify checks the packaged asset hashes.
export const ZXING_CPP_WASM_BUILD_METADATA: ZxingCppWasmBuildMetadata = {
  schemaVersion: "1.0",
  distribution: {
    name: "zxing-wasm",
    version: "3.1.1",
    sourceCommit: "41d92eadda2a556dff9a044ff29fd3e41e70c657",
    integrity: "sha512-g0sPJBIubO6zLcJh1jftLPIN6xziaqLsvLgtpGKwDrEhyXXqla3E3yjFrznlr78UHIOMzbJPi0HDWKs/KgaB7A==",
  },
  upstream: {
    name: "zxing-cpp",
    commit: "6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861",
    license: "Apache-2.0",
  },
  toolchain: {
    emscripten: "5.0.4",
    cmakeMinimum: "3.14",
    canonicalEnvironment: "ubuntu-24.04 x64, Node 24, Emscripten 5.0.4",
  },
  build: {
    timestampPolicy: "No Scanly timestamp is embedded; the pinned distribution artifact is byte-for-byte verified.",
    readerOnly: true,
    flags: [
      "-O3", "-fexceptions", "-s DISABLE_EXCEPTION_CATCHING=0", "-s ENVIRONMENT=web,worker",
      "-s FILESYSTEM=0", "-s EXPORT_ES6=1", "-s MODULARIZE=1", "-s DYNAMIC_EXECUTION=0",
      "-s ALLOW_MEMORY_GROWTH=1", "-s STACK_SIZE=5242880",
    ],
    sourceHash: "774330bd90c99c99f2fa710508cc64ed0f3aac97cd8795e575d5384aadd93bdc",
    glueSha256: "fb8ec6dfa03c4d1c32925b53db7b40da9acaf978a3f704bb8ceb2ba7f6edf33a",
  },
  assets: {
    standard: {
      file: "zxing-cpp.wasm",
      available: true,
      sha256: "6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f",
      bytes: 1_065_634,
      simd: false,
    },
    simd: { file: "zxing-cpp-simd.wasm", available: false, sha256: null, bytes: 0, simd: true },
  },
  licenseFiles: ["LICENSE", "LICENSE-ZXING-WASM", "LICENSE-ZXING-CPP", "NOTICE"],
};
