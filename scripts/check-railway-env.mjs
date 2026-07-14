const required = [
  "DATABASE_URL",
  "NORTH_STAR_USERNAME",
  "NORTH_STAR_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`North Star cannot start on Railway. Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

if ((process.env.NORTH_STAR_PASSWORD ?? "").length < 16) {
  console.error("NORTH_STAR_PASSWORD must contain at least 16 characters.");
  process.exit(1);
}

console.log("North Star Railway environment verified.");
