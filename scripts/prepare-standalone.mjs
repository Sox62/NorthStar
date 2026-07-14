import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  throw new Error("Next.js standalone output was not generated.");
}

const staticSource = join(root, ".next", "static");
const staticTarget = join(standalone, ".next", "static");
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true, force: true });

const publicSource = join(root, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standalone, "public"), { recursive: true, force: true });
}

console.log("Standalone Next.js runtime prepared.");
