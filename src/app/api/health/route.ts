import { authConfigured } from "@/auth";
export async function GET() {
  return Response.json(
    {
      app: "AuraGold 100K",
      version: "1.0.0",
      databaseConfigured: !!process.env.DATABASE_URL,
      authConfigured: authConfigured(),
      sheetConfigured: !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
