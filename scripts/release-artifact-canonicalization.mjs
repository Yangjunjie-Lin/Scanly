import crypto from "node:crypto";
import fs from "node:fs";
import { TextDecoder } from "node:util";
import zlib from "node:zlib";

export const NPM_CANONICALIZATION_POLICY = {
  schemaVersion: "scanly-npm-package-canonical-1",
  archiveParser: "NODE_GZIP_POSIX_TAR_VALIDATED",
  archiveMetadata: "EXCLUDED",
  entryOrder: "LEXICOGRAPHIC_UTF8_PATH",
  entryPathPrefix: "package/",
  textDetection: "STRICT_UTF8_WITHOUT_NUL",
  textLineEndings: "CRLF_OR_CR_TO_LF",
  framing: "PATH_NUL_DECIMAL_LENGTH_NUL_CONTENT_NUL",
};

export const ZIP_CANONICALIZATION_POLICY = {
  schemaVersion: "scanly-zip-content-canonical-1",
  archiveParser: "NODE_ZIP_CENTRAL_DIRECTORY_VALIDATED",
  archiveMetadata: "EXCLUDED",
  entryOrder: "LEXICOGRAPHIC_UTF8_PATH",
  nestedJarMetadata: "EXCLUDED_RECURSIVELY",
  fileContent: "EXACT_BYTES",
  framing: "PATH_NUL_DECIMAL_LENGTH_NUL_CONTENT_NUL",
};

const utf8 = new TextDecoder("utf-8", { fatal: true });
const decode = (bytes, label) => {
  try { return utf8.decode(bytes); } catch { throw new Error(`${label}: invalid UTF-8.`); }
};
const cString = (bytes) => bytes.subarray(0, bytes.indexOf(0) >= 0 ? bytes.indexOf(0) : bytes.length);
const octal = (bytes, label) => {
  if ((bytes[0] ?? 0) & 0x80) throw new Error(`${label}: base-256 tar numbers are not supported.`);
  const value = decode(cString(bytes), label).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error(`${label}: invalid tar octal value.`);
  return value === "" ? 0 : Number.parseInt(value, 8);
};
const pax = (bytes, label) => {
  const values = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0) throw new Error(`${label}: malformed PAX record length.`);
    const length = Number.parseInt(decode(bytes.subarray(offset, space), label), 10);
    if (!Number.isInteger(length) || length <= space - offset + 2 || offset + length > bytes.length || bytes[offset + length - 1] !== 0x0a) {
      throw new Error(`${label}: malformed PAX record boundary.`);
    }
    const record = decode(bytes.subarray(space + 1, offset + length - 1), label);
    const equals = record.indexOf("=");
    if (equals <= 0) throw new Error(`${label}: malformed PAX key/value.`);
    values[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return values;
};
const tarEntries = (archivePath) => {
  const archive = fs.readFileSync(archivePath);
  let tar;
  try { tar = zlib.gunzipSync(archive); } catch { throw new Error(`${archivePath}: invalid gzip stream.`); }
  const entries = [];
  let offset = 0;
  let perFilePax = {};
  let globalPax = {};
  let longName;
  let terminated = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every((value) => value === 0)) throw new Error(`${archivePath}: invalid or incomplete tar terminator.`);
      terminated = true;
      break;
    }
    const expectedChecksum = octal(header.subarray(148, 156), `${archivePath}: tar checksum`);
    let checksum = 0;
    for (let index = 0; index < header.length; index += 1) checksum += index >= 148 && index < 156 ? 0x20 : header[index];
    if (checksum !== expectedChecksum) throw new Error(`${archivePath}: tar header checksum mismatch.`);
    const size = octal(header.subarray(124, 136), `${archivePath}: tar size`);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (!Number.isSafeInteger(size) || contentEnd > tar.length) throw new Error(`${archivePath}: tar entry exceeds archive bounds.`);
    const content = tar.subarray(contentStart, contentEnd);
    const name = decode(cString(header.subarray(0, 100)), `${archivePath}: tar path`);
    const prefix = decode(cString(header.subarray(345, 500)), `${archivePath}: tar prefix`);
    const headerPath = prefix ? `${prefix}/${name}` : name;
    const type = header[156];
    if (type === 0x78) {
      perFilePax = pax(content, `${archivePath}: PAX header`);
    } else if (type === 0x67) {
      globalPax = { ...globalPax, ...pax(content, `${archivePath}: global PAX header`) };
    } else if (type === 0x4c) {
      longName = decode(cString(content), `${archivePath}: GNU long path`);
    } else if (type === 0x00 || type === 0x30 || type === 0x37) {
      const entryPath = perFilePax.path ?? longName ?? globalPax.path ?? headerPath;
      entries.push({ path: entryPath, bytes: Buffer.from(content) });
      perFilePax = {};
      longName = undefined;
    } else if (type === 0x35) {
      perFilePax = {};
      longName = undefined;
    } else {
      throw new Error(`${archivePath}: unsupported tar entry type '${String.fromCharCode(type)}'.`);
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  if (!terminated) throw new Error(`${archivePath}: tar terminator is missing.`);
  if (entries.length === 0) throw new Error(`${archivePath}: npm tarball contains no files.`);
  return entries;
};

const normalizeContent = (bytes) => {
  if (bytes.includes(0x00)) return bytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return Buffer.from(text.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "utf8");
  } catch {
    return bytes;
  }
};

export const canonicalNpmTarballSha256 = (archivePath) => {
  const entries = tarEntries(archivePath);
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error(`${archivePath}: npm tarball contains duplicate paths.`);
  const normalizedEntries = entries.map((entry) => {
    const archiveEntryPath = entry.path;
    const pathSegments = archiveEntryPath.split("/");
    if (!archiveEntryPath.startsWith("package/") || archiveEntryPath.includes("\\") || pathSegments.some((segment) => segment === "" || segment === "." || segment === "..") || /[\r\n\0]/.test(archiveEntryPath)) {
      throw new Error(`${archivePath}: unsafe or non-canonical npm entry '${archiveEntryPath}'.`);
    }
    return { ...entry, canonicalPath: archiveEntryPath.slice("package/".length) };
  }).sort((left, right) => Buffer.from(left.canonicalPath).compare(Buffer.from(right.canonicalPath)));

  const hash = crypto.createHash("sha256");
  for (const entry of normalizedEntries) {
    const content = normalizeContent(entry.bytes);
    hash.update(Buffer.from(entry.canonicalPath, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(String(content.length), "ascii"));
    hash.update(Buffer.from([0]));
    hash.update(content);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
};

const zipEntries = (archive, label) => {
  if (archive.length < 22) throw new Error(`${label}: ZIP archive is too small.`);
  const minimumEocdOffset = Math.max(0, archive.length - 65_557);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error(`${label}: ZIP end-of-central-directory record is missing.`);
  const disk = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw new Error(`${label}: multi-disk ZIP archives are unsupported.`);
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error(`${label}: ZIP64 archives are unsupported.`);
  if (centralOffset + centralSize !== eocdOffset) throw new Error(`${label}: ZIP central-directory boundary mismatch.`);

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > eocdOffset || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${label}: malformed ZIP central-directory entry.`);
    const flags = archive.readUInt16LE(offset + 8);
    const compression = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > eocdOffset || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error(`${label}: invalid or ZIP64 central-directory entry.`);
    if (flags & 0x0001) throw new Error(`${label}: encrypted ZIP entries are unsupported.`);
    const entryPath = decode(archive.subarray(offset + 46, offset + 46 + nameLength), `${label}: ZIP path`);
    const pathWithoutTrailingSlash = entryPath.endsWith("/") ? entryPath.slice(0, -1) : entryPath;
    const segments = pathWithoutTrailingSlash.split("/");
    if (!entryPath || entryPath.includes("\\") || entryPath.startsWith("/") || /[\r\n\0]/.test(entryPath) || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      throw new Error(`${label}: unsafe ZIP entry '${entryPath}'.`);
    }
    if (localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${label}: malformed ZIP local header for '${entryPath}'.`);
    if (archive.readUInt16LE(localOffset + 8) !== compression) throw new Error(`${label}: ZIP compression mismatch for '${entryPath}'.`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset) throw new Error(`${label}: ZIP entry '${entryPath}' exceeds archive bounds.`);
    const compressed = archive.subarray(dataOffset, dataEnd);
    let bytes;
    if (compression === 0) bytes = Buffer.from(compressed);
    else if (compression === 8) bytes = zlib.inflateRawSync(compressed);
    else throw new Error(`${label}: unsupported ZIP compression method ${compression} for '${entryPath}'.`);
    if (bytes.length !== uncompressedSize || crc32(bytes) !== expectedCrc) throw new Error(`${label}: ZIP integrity mismatch for '${entryPath}'.`);
    if (!entryPath.endsWith("/")) entries.push({ path: entryPath, bytes });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) throw new Error(`${label}: ZIP central-directory size mismatch.`);
  if (entries.length === 0) throw new Error(`${label}: ZIP archive contains no files.`);
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error(`${label}: ZIP archive contains duplicate paths.`);
  return entries;
};

const canonicalZipSha256Bytes = (archive, label, depth = 0) => {
  if (depth > 4) throw new Error(`${label}: nested ZIP depth exceeds policy.`);
  const entries = zipEntries(archive, label).sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const hash = crypto.createHash("sha256");
  for (const entry of entries) {
    const isNestedZip = /\.(?:jar|zip)$/i.test(entry.path) && entry.bytes.length >= 4 && entry.bytes.readUInt32LE(0) === 0x04034b50;
    const content = isNestedZip
      ? Buffer.from(`NESTED_ZIP_SHA256\0${canonicalZipSha256Bytes(entry.bytes, `${label}:${entry.path}`, depth + 1)}`, "utf8")
      : entry.bytes;
    hash.update(Buffer.from(entry.path, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(String(content.length), "ascii"));
    hash.update(Buffer.from([0]));
    hash.update(content);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
};

export const canonicalZipSha256 = (archivePath) => canonicalZipSha256Bytes(fs.readFileSync(archivePath), archivePath);
export const validatedZipEntries = (archivePath) => zipEntries(fs.readFileSync(archivePath), archivePath);
export const validatedZipEntriesFromBytes = (archive, label = "ZIP buffer") => zipEntries(Buffer.from(archive), label);
