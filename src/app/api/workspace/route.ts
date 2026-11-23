import { requireOwner, apiError } from "@/lib/access";
import { readWorkspace, writeWorkspace } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireOwner();
    return Response.json(await readWorkspace(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    await requireOwner(request);
    if (Number(request.headers.get("content-length")) > 8e6)
      throw new Error("Dữ liệu quá lớn.");
    const body = await request.json();
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      throw new Error("Phiên bản không hợp lệ.");
    return Response.json(await writeWorkspace(body.data, body.revision));
  } catch (e) {
    return apiError(e);
  }
}
