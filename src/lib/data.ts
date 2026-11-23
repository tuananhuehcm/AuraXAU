import sample from "@/data/sample.json";
import type { AppData } from "./types";
export const sampleData = () => structuredClone(sample) as AppData;
export function emptyData(): AppData {
  const d = sampleData();
  d.accounts = [];
  d.phases = [];
  d.botcamps = [];
  d.trades = [];
  d.cashflows = [];
  d.dayNotes = {};
  return d;
}
