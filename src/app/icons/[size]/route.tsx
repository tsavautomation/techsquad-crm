import { ImageResponse } from "next/og";
import { IconArt } from "../../icon-art";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: `${s}.png` }));
}

/** PWA icons referenced by the manifest: /icons/192.png and /icons/512.png */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const px = Number.parseInt(size, 10);
  if (!SIZES.includes(px as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IconArt size={px} />, { width: px, height: px });
}
