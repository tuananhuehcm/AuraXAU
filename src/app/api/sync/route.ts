import { requireOwner, apiError } from "@/lib/access";
import { syncSheet } from "@/lib/sheets";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const b = await req.json();
    if (!Number.isSafeInteger(b.revision))
      throw new Error("Phiên bản không hợp lệ.");
    return Response.json(await syncSheet(b.revision));
  } catch (e) {
    return apiError(e);
  }
}
