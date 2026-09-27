// Cloudflare Workers Builds runs `npm ci` and then `npx wrangler deploy`, and
// wrangler's OpenNext deploy does not build the app. So when installing inside
// Workers Builds (WORKERS_CI=1), build here, and no dashboard build command is
// needed. Does nothing on your own machine.
import { execSync } from "node:child_process";

if (process.env.WORKERS_CI === "1") {
  console.log("Workers Builds detected: running opennextjs-cloudflare build");
  execSync("npx opennextjs-cloudflare build", { stdio: "inherit" });
}
