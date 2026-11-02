import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Request-cookie localization needs per-request rendering, including the root html lang.
  turbopack: {
    // npm scripts and start-local.ps1 run from the project directory.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
