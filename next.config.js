/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.globalObject = "self";
    }
    return config;
  },
};

module.exports = nextConfig;
