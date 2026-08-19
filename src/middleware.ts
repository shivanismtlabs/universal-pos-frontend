import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Dynamic `[id]` routes put chunks under bracket folders; Windows `next start`
 * cannot serve those. Catalog/orders detail use `/view?id=` instead. */
const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CATALOG_UUID = new RegExp(`^/catalog/(${UUID})$`, "i");
const ORDERS_UUID = new RegExp(`^/orders/(${UUID})$`, "i");
const JOURNAL_UUID = new RegExp(`^/accounting/journals/(${UUID})$`, "i");

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/kot" || path === "/kot/") {
    const url = request.nextUrl.clone();
    url.pathname = "/kitchen";
    return NextResponse.redirect(url);
  }
  const catalog = path.match(CATALOG_UUID);
  if (catalog) {
    const url = request.nextUrl.clone();
    url.pathname = "/catalog/view";
    url.searchParams.set("id", catalog[1]);
    return NextResponse.redirect(url);
  }
  const order = path.match(ORDERS_UUID);
  if (order) {
    const url = request.nextUrl.clone();
    url.pathname = "/orders/view";
    url.searchParams.set("id", order[1]);
    return NextResponse.redirect(url);
  }
  const journal = path.match(JOURNAL_UUID);
  if (journal) {
    const url = request.nextUrl.clone();
    url.pathname = "/accounting/journals/view";
    url.searchParams.set("id", journal[1]);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/kot", "/kot/", "/catalog/:path*", "/orders/:path*", "/accounting/journals/:path*"],
};
