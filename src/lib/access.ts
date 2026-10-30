type Env = Record<string, string | undefined>;
export type Access = "owner" | "signed-out" | "forbidden" | "unavailable";
export function clerkConfigured(env: Env = process.env) {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
}
export async function access(env: Env = process.env, identity = async () => {
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth({ acceptsToken: "session_token" })).userId;
}): Promise<Access> {
  if (!clerkConfigured(env) || !env.OWNER_CLERK_USER_ID || !env.APP_URL) return "unavailable";
  if (env.NODE_ENV === "production" && (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") || !env.CLERK_SECRET_KEY?.startsWith("sk_live_"))) return "unavailable";
  try { const id = await identity(); return !id ? "signed-out" : id === env.OWNER_CLERK_USER_ID ? "owner" : "forbidden"; }
  catch { return "unavailable"; }
}
