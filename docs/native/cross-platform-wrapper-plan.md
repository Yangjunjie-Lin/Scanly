# React Native and Flutter wrapper plan

Beta 5 does not publish React Native or Flutter adapters. The Native APIs are
kept wrapper-friendly by using immutable value results, typed platform errors,
explicit decoder/session disposal, bounded multiple-result arrays, and the
stable C ABI beneath both platforms.

React Native should expose the existing Swift/Kotlin SDK rather than call a
third decoder. Camera frame ownership stays in the native module; only decoded
value results cross the JS bridge. A future New Architecture module can map
session lifecycle and events without transferring camera pixels to JavaScript.

Flutter should prefer the platform SDK for camera integration and may use the C
ABI through FFI for owned static buffers. FFI bindings must mirror every create
with destroy and must copy borrowed result views before freeing the result set.

Before either publication: freeze native API snapshots, run the unified shared
fixture vectors, add wrapper lifecycle/memory soak, and complete RC physical
validation. No wrapper publication is authorized in Beta 5.
