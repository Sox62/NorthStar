const PUBLIC_EXACT_PATHS = new Set([
  "/login",
  "/api/health",
  "/api/sync",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
]);

function isNextInternal(pathname: string) {
  return pathname.startsWith("/_next/");
}

function isAuthEndpoint(pathname: string) {
  return pathname.startsWith("/api/auth/");
}

function isStaticAsset(pathname: string) {
  return /\.(?:css|js|mjs|map|png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json|webmanifest)$/i.test(pathname);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_EXACT_PATHS.has(pathname)
    || isNextInternal(pathname)
    || isAuthEndpoint(pathname)
    || isStaticAsset(pathname);
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}
