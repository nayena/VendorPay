import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page renders on demand from D1, so no incremental cache is configured.
export default defineCloudflareConfig({});
