import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Gives `next dev` a local D1 database (stored in .wrangler/) via Wrangler.
initOpenNextCloudflareForDev();
