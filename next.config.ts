import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Allow this machine's actual IPv4 addresses without exposing dev assets to arbitrary origins.
const devHostnames = [...new Set(Object.values(networkInterfaces()).flatMap((interfaces) =>
  (interfaces ?? []).filter((entry) => entry.family === "IPv4").map((entry) => entry.address),
))];

const nextConfig: NextConfig = {
  // Request-cookie localization needs per-request rendering, including the root html lang.
  allowedDevOrigins: devHostnames,
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
