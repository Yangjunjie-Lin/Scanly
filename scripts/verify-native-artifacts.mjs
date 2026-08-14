import fs from "node:fs";
import path from "node:path";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.split("=");
  return [key, value.join("=")];
}));
const root = path.resolve(import.meta.dirname, "..");

if (args.has("--aar-directory")) {
  const directory = path.resolve(args.get("--aar-directory"));
  const required = [
    "AndroidManifest.xml",
    "classes.jar",
    "proguard.txt",
    "jni/arm64-v8a/libscanly_jni.so",
    "jni/x86_64/libscanly_jni.so",
  ];
  for (const relative of required) if (!fs.existsSync(path.join(directory, relative))) throw new Error(`AAR is missing ${relative}.`);
  const unexpectedCoreLibraries = ["arm64-v8a", "x86_64"].filter((abi) => fs.existsSync(path.join(directory, `jni/${abi}/libscanly_core.so`)));
  if (unexpectedCoreLibraries.length) throw new Error("AAR must statically link Native Core into the single Scanly JNI library.");
  console.log("Android AAR contents and arm64-v8a/x86_64 ABI contract passed.");
}

if (args.has("--swift-directory")) {
  const directory = path.resolve(args.get("--swift-directory"));
  const header = path.join(root, "native/ios/Core/include/scanly/core.h");
  if (!fs.existsSync(header)) throw new Error("Swift package public C ABI header is missing.");
  const files = fs.existsSync(directory) ? fs.readdirSync(directory, { recursive: true }) : [];
  if (!files.some((file) => String(file).includes("ScanlySDK"))) throw new Error("Swift build directory contains no ScanlySDK product/module.");
  console.log("Swift package header/module artifact contract passed.");
}

if (!args.size) throw new Error("Pass --aar-directory=<expanded-aar> or --swift-directory=<swift-build>.");
