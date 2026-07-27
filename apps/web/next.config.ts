import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack(config) {
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    config.resolve.alias["pino-pretty"] = false;
    return config;
  },
};

export default nextConfig;
