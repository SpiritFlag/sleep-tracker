import { handle } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request);
