import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F26-2: the IMAP client and mail parser are loaded as plain Node modules (dynamic requires inside).
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
