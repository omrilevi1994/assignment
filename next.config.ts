import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop Next from generating agent instruction files in the repo root.
  agentRules: false,
  outputFileTracingIncludes: { "/api/chat": ["./prompts/**"] },
};

export default nextConfig;
