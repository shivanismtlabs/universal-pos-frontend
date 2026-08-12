import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** UUID product detail used to live at /catalog/[id]; Windows `next start`
 * cannot serve static chunks under bracket folders. Redirect old URLs. */
const CATALOG_UUID =
  /^\/catalog\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(CATALOG_UUID);
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = "/catalog/view";
    url.searchParams.set("id", match[1]);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/catalog/:path*"],
};
