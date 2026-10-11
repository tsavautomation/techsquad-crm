import { NextResponse } from "next/server";

/**
 * The customer portal's own PWA manifest (F6): "Add to Home Screen" on iPhone / Android installs an app
 * called Tech Squad that opens at /portal and stays inside it. Public: iOS fetches it without cookies.
 */
export function GET() {
  const manifest = {
    id: "/portal",
    name: "Tech Squad Client Portal",
    short_name: "Tech Squad",
    description: "Your projects with Tech Squad: visits, requests, passwords, apps and documents.",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
