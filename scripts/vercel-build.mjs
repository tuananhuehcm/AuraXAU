import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Production uses the linked Neon database. Preview and local builds never migrate it.
if (process.env.VERCEL_ENV === "production" && process.env.DATABASE_URL) {
  console.log("Applying pending production database migrations.");
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
}
run(["node_modules/prisma/build/index.js", "generate"]);
run(["node_modules/next/dist/bin/next", "build"]);
