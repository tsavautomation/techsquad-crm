import type { Metadata } from "next";

/**
 * Customer portal (F6): its own app identity for the browser and the home screen. The signed-in shell
 * lives in (client)/layout.tsx; (public) holds the sign-in and install pages.
 */
export const metadata: Metadata = {
  title: { absolute: "Tech Squad", template: "%s · Tech Squad" },
  applicationName: "Tech Squad",
  description: "Your projects with Tech Squad: visits, requests, passwords, apps and documents.",
  manifest: "/portal/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tech Squad", statusBarStyle: "default" },
};

export default function PortalRootLayout({ children }: LayoutProps<"/portal">) {
  return children;
}
