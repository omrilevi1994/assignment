import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop Next from generating agent instruction files in the repo root.
  agentRules: false,
};

export default nextConfig;
