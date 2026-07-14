import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NorthStar Portfolio Tracker",
    short_name: "NorthStar",
    description: "Private Personal and SMSF portfolio reporting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#081019",
    theme_color: "#081019",
    orientation: "any",
    categories: ["finance", "business"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Broker imports",
        short_name: "Imports",
        url: "/imports",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Physical platinum",
        short_name: "Platinum",
        url: "/assets",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
