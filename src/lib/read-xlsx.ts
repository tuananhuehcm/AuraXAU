import ExcelJS from "exceljs";
import JSZip from "jszip";

// Imports only consume inputs. Some Excel writers use absolute comment targets
// that ExcelJS cannot reconcile. Discard annotation links in memory, never the source file.
export async function readXlsx(input: ArrayBuffer | Buffer) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > 8e6) throw new Error("File tối đa 8 MB.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("File không phải Excel .xlsx hợp lệ.");
  let offset = bytes.readUInt32LE(end + 16),
    total = 0;
  const entries = bytes.readUInt16LE(end + 10);
  if (entries > 5000) throw new Error("File có quá nhiều thành phần.");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Cấu trúc XLSX không hợp lệ.");
    total += bytes.readUInt32LE(offset + 24);
    if (total > 64e6) throw new Error("File Excel giải nén vượt 64 MB.");
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  const zip = await JSZip.loadAsync(bytes);
  for (const [path, entry] of Object.entries(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(path)) {
      const xml = await entry.async("string");
      zip.file(
        path,
        xml.replace(
          /<Relationship\b[^>]*\bType=["'][^"']*\/(?:comments|vmlDrawing)["'][^>]*\/?\s*>/g,
          "",
        ),
      );
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
      const xml = await entry.async("string");
      zip.file(path, xml.replace(/<legacyDrawing(?:HF)?\b[^>]*\/?\s*>/g, ""));
    }
  }
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await zip.generateAsync({ type: "arraybuffer" }));
  return w;
}
