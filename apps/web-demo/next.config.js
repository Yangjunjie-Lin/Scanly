/** @type {import('next').NextConfig} */
const { execFileSync } = require("node:child_process");

function gitIdentity() {
  const read = (args) => {
    try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return "unavailable"; }
  };
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.SCANLY_SOURCE_COMMIT || read(["rev-parse", "HEAD"]);
  const tree = process.env.SCANLY_SOURCE_TREE || (/^[0-9a-f]{40}$/.test(commit) ? read(["show", "-s", "--format=%T", commit]) : "unavailable");
  const status = read(["status", "--porcelain=v1", "--untracked-files=all"]);
  const dirty = status === "unavailable" ? "unavailable" : status !== "";
  return { commit, tree, dirty };
}

const source = gitIdentity();
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SCANLY_SOURCE_COMMIT: source.commit,
    NEXT_PUBLIC_SCANLY_SOURCE_TREE: source.tree,
    NEXT_PUBLIC_SCANLY_REPOSITORY_DIRTY: String(source.dirty),
  },
  transpilePackages: ["@scanly/core", "@scanly/browser", "@scanly/parsers", "@scanly/scenario-schema", "@scanly/engine-jsqr", "@scanly/engine-zxing-js"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.globalObject = "self";
    }
    return config;
  },
};

module.exports = nextConfig;
