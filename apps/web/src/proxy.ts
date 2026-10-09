import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap gate: only checks that a session cookie exists. The FastAPI backend
// verifies the cookie on every API call, so a forged cookie gets no data.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const onLogin = request.nextUrl.pathname === "/login";

  if (!hasSession && !onLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && onLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
