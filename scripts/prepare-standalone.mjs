import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
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

const pdfWorkerSource = join(root, "node_modules", "pdf-parse", "dist", "pdf-parse", "cjs", "pdf.worker.mjs");
const pdfWorkerTarget = join(standalone, ".next", "server", "chunks", "pdf.worker.mjs");
if (existsSync(pdfWorkerSource)) {
  mkdirSync(join(standalone, ".next", "server", "chunks"), { recursive: true });
  copyFileSync(pdfWorkerSource, pdfWorkerTarget);
}

console.log("Standalone Next.js runtime prepared.");
