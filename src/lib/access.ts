import { auth, authConfigured } from "@/auth";
export async function requireOwner(request?: Request) {
  if (!authConfigured()) throw new Error("SETUP_REQUIRED");
  const session = await auth();
  if (
    !session?.user?.email ||
    session.user.email.toLowerCase() !==
      process.env.ALLOWED_EMAIL?.toLowerCase()
  )
    throw new Error("UNAUTHORIZED");
  if (request && request.method !== "GET") {
    const origin = request.headers.get("origin");
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new Error("FORBIDDEN");
  }
  return session;
}
export function apiError(error: unknown) {
  const m = error instanceof Error ? error.message : "Lỗi xử lý dữ liệu.";
  const codes: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    SETUP_REQUIRED: 503,
    CONFLICT: 409,
  };
  const known = codes[m];
  if (known) return Response.json({ error: m }, { status: known });
  // Never disclose connection URLs, OAuth responses or service-account credentials.
  if (m.includes("prisma") || m.includes("DATABASE_URL"))
    return Response.json(
      { error: "Không kết nối được database. Kiểm tra cấu hình và migration." },
      { status: 503 },
    );
  return Response.json({ error: m.slice(0, 600) }, { status: 400 });
}
