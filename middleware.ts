import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  if (!auth0) return NextResponse.next(); // Auth0 not configured → nickname mode
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models|audio|sitemap.xml|robots.txt).*)"],
};
