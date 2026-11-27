import type { MetadataRoute } from "next";

/** Makes Loam installable: its own window and Dock / home-screen icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loam",
    short_name: "Loam",
    description: "A quiet place to focus and take in what you're reading.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#efe6d4",
    theme_color: "#efe6d4",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
