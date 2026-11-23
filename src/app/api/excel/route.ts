import { requireOwner, apiError } from "@/lib/access";
import { readWorkspace } from "@/lib/store";
import { createWorkbook } from "@/lib/workbook";
import { validateData } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length")) > 8e6)
      throw new Error("Dữ liệu tối đa 8 MB.");
    const b = await req.json();
    if (b.action !== "export") throw new Error("Thao tác không hợp lệ.");
    let data;
    if (b.data) {
      data = validateData(b.data);
    } else {
      await requireOwner(req);
      data = (await readWorkspace()).data;
    }
    const w = await createWorkbook(data, b.accountId);
    return new Response(new Uint8Array(await w.xlsx.writeBuffer()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=AuraGold.xlsx",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
