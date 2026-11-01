import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const host = request.headers.get("host");
  if (host) {
    headers.set("host", host);
    headers.set("x-forwarded-host", host);
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/mcp", "/mcp/:path*", "/oauth", "/oauth/:path*", "/.well-known", "/.well-known/:path*"],
};
