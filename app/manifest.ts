import type { MetadataRoute } from "next";

/**
 * There was no manifest at all, so the PWA icons in public/ were never referenced and the install
 * prompt had nothing to offer. Chrome needs name, start_url, display and a 192 plus a 512 before
 * it will treat the app as installable.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SouthernStar",
    short_name: "SouthernStar",
    description: "Private Personal and SMSF portfolio reporting",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#081019",
    theme_color: "#081019",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops to its own shape; the maskable art keeps the constellation inside the safe zone.
      { src: "/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
