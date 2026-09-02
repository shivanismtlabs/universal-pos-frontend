/**
 * PM2 `npm start` requires a production build. If `.next/BUILD_ID` is
 * missing (fresh clone, git clean, failed prior build), create it first.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const buildId = path.join(root, ".next", "BUILD_ID");

if (fs.existsSync(buildId)) {
  process.exit(0);
}

console.log(
  "[upos-web] No production build in .next — running next build before start…",
);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("[upos-web] next build failed; cannot start production server.");
  process.exit(result.status || 1);
}

process.exit(0);
