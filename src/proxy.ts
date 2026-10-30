import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { clerkConfigured } from "./lib/access";
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured()) return NextResponse.next();
  return clerkMiddleware({
    authorizedParties: [process.env.APP_URL || "http://127.0.0.1:3001"],
  })(request, event);
}
export const config = { matcher: ["/", "/api/:path*", "/sign-in(.*)"] };
