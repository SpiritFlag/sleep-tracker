import { handleCpap } from "@/lib/cpap-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => handleCpap(request);
export const POST = (request: Request) => handleCpap(request);
