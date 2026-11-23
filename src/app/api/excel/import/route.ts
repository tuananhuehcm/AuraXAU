import ExcelJS from "exceljs";
import { requireOwner, apiError } from "@/lib/access";
import { readWorkspace } from "@/lib/store";
import { validateData } from "@/lib/validation";
import { mergeWorkbook } from "@/lib/workbook";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length")) > 9e6)
      throw new Error("File tối đa 8 MB.");
    const f = await req.formData(),
      file = f.get("file");
    if (!(file instanceof File) || file.size > 8e6)
      throw new Error("Chọn file .xlsx tối đa 8 MB.");
    const raw = f.get("data");
    let current;
    if (raw) {
      current = validateData(JSON.parse(String(raw)));
    } else {
      await requireOwner(req);
      current = (await readWorkspace()).data;
    }
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(await file.arrayBuffer());
    return Response.json(mergeWorkbook(w, current));
  } catch (e) {
    return apiError(e);
  }
}
