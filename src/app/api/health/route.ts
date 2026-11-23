import { authConfigured } from "@/auth";
import { Client } from "pg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const databaseConfigured = !!process.env.DATABASE_URL;
  let databaseConnected = false;
  let schemaReady = false;
  if (databaseConfigured) {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      databaseConnected = true;
      const required = [
        "Workspace",
        "Account",
        "Instrument",
        "Phase",
        "Botcamp",
        "FxRate",
        "RoundingStep",
        "SessionRule",
        "Setup",
        "Trade",
        "Cashflow",
        "DayJournal",
        "SheetSync",
        "SyncLog",
      ];
      const result = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
        [required],
      );
      schemaReady = result.rows.length === required.length;
    } catch {
      // Health responses must never disclose connection strings or credentials.
    } finally {
      await client.end().catch(() => {});
    }
  }
  return Response.json(
    {
      app: "AuraGold 100K",
      version: "1.0.0",
      databaseConfigured,
      databaseConnected,
      schemaReady,
      authConfigured: authConfigured(),
      sheetConfigured: !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_PRIVATE_KEY
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
