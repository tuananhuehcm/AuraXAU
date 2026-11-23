import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readXlsx } from "../src/lib/read-xlsx";
import { sampleData } from "../src/lib/data";
import {
  createWorkbook,
  makeBaseline,
  mergeWorkbook,
} from "../src/lib/workbook";
test("five-sheet workbook round-trips input data and ignores computed outputs", async () => {
  const d = sampleData(),
    w = await createWorkbook(d);
  assert.deepEqual(
    w.worksheets.map((s) => s.name),
    ["Dashboard", "Lo_Trinh", "Trades", "Cashflow", "Settings"],
  );
  const saved = await w.xlsx.writeBuffer(),
    r = new ExcelJS.Workbook();
  await r.xlsx.load(saved);
  r.getWorksheet("Trades")!.getCell("V6").value = 999999;
  const result = mergeWorkbook(r, d);
  assert.equal(result.data.trades[0].gross, 15);
  assert.equal(result.data.accounts[0].start, 200);
  assert.deepEqual(result.data.phases, d.phases);
  assert.equal(result.added, 0);
});
test("blank trade IDs are allocated and deleted sheet rows do not delete DB records", async () => {
  const d = sampleData(),
    w = await createWorkbook(d);
  w.getWorksheet("Trades")!.getCell("A6").value = "";
  const r = mergeWorkbook(w, d);
  assert.equal(r.added, 1);
  assert.equal(r.data.trades.length, 5);
  assert.match(r.data.trades.at(-1)!.id, /^T_/);
  for (let i = 6; i <= 9; i++)
    w.getWorksheet("Trades")!
      .getRow(i)
      .eachCell((c) => {
        c.value = null;
      });
  const r2 = mergeWorkbook(w, d);
  assert.equal(r2.data.trades.length, 4);
});
test("three-way Sheet merge keeps DB on conflicts and accepts Sheet-only changes", async () => {
  const d = sampleData(),
    base = makeBaseline(d),
    w = await createWorkbook(d);
  w.getWorksheet("Trades")!.getCell("L6").value = 50;
  d.trades[0].gross = 25;
  const result = mergeWorkbook(w, d, base);
  assert.equal(result.data.trades[0].gross, 25);
  assert.equal(result.conflicts, 1);
  const d2 = sampleData(),
    w2 = await createWorkbook(d2);
  w2.getWorksheet("Trades")!.getCell("L6").value = 50;
  const accepted = mergeWorkbook(w2, d2, base);
  assert.equal(accepted.data.trades[0].gross, 50);
  assert.equal(accepted.conflicts, 0);
});
test("retry after a Sheet push failure does not duplicate newly allocated blank-ID rows", async () => {
  const d = sampleData(),
    w = await createWorkbook(d);
  w.getWorksheet("Trades")!.getCell("A6").value = "";
  const first = mergeWorkbook(w, d, undefined, "sheet-123");
  assert.equal(first.added, 1);
  const retry = mergeWorkbook(w, first.data, undefined, "sheet-123");
  assert.equal(retry.added, 0);
  assert.equal(retry.data.trades.length, 5);
});
test("imports workbooks with unsupported absolute comment targets without altering inputs", async () => {
  const w = await createWorkbook(sampleData()),
    zip = await JSZip.loadAsync(await w.xlsx.writeBuffer());
  zip.file(
    "xl/worksheets/_rels/sheet3.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="/xl/comments/missing.xml" Id="rId1"/></Relationships>',
  );
  const parsed = await readXlsx(
    await zip.generateAsync({ type: "arraybuffer" }),
  );
  assert.equal(parsed.getWorksheet("Trades")!.getCell("L6").value, 15);
});
test("rejects oversized inflated XLSX payload before decompression", async () => {
  const w = await createWorkbook(sampleData()),
    bytes = Buffer.from(await w.xlsx.writeBuffer());
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(100_000_000, central + 24);
  await assert.rejects(() => readXlsx(bytes), /64 MB/);
});
