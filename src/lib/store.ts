import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { emptyData } from "./data";
import { validateData } from "./validation";
import type { AppData } from "./types";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function readWorkspace() {
  return prisma.$transaction(
    async (tx) => {
      const w = await tx.workspace.findUnique({ where: { id: "personal" } });
      if (!w) return { data: emptyData(), revision: 0 };
      const [
        accounts,
        instruments,
        phases,
        botcamps,
        rates,
        rounding,
        sessions,
        setups,
        trades,
        cashflows,
        notes,
      ] = await Promise.all([
        tx.account.findMany(),
        tx.instrument.findMany(),
        tx.phase.findMany(),
        tx.botcamp.findMany(),
        tx.fxRate.findMany(),
        tx.roundingStep.findMany(),
        tx.sessionRule.findMany(),
        tx.setup.findMany(),
        tx.trade.findMany(),
        tx.cashflow.findMany(),
        tx.dayJournal.findMany(),
      ]);
      const live = (
        rows: { data: Prisma.JsonValue; deletedAt: Date | null }[],
      ) => rows.filter((r) => !r.deletedAt).map((r) => r.data);
      const withDeleted = (
        rows: { data: Prisma.JsonValue; deletedAt: Date | null }[],
      ) =>
        rows.map((r) => ({
          ...(r.data as object),
          ...(r.deletedAt ? { deleted: true } : {}),
        }));
      const sess = live(sessions) as { kind: string; t: number; n: string }[];
      const data = validateData({
        general: w.general,
        accounts: live(accounts),
        instruments: live(instruments),
        phases: live(phases),
        botcamps: live(botcamps),
        rates: live(rates),
        rounding: live(rounding),
        sessFX: sess
          .filter((s) => s.kind === "FX")
          .map(({ t, n }) => ({ t, n })),
        sessStock: sess
          .filter((s) => s.kind === "STOCK_VN")
          .map(({ t, n }) => ({ t, n })),
        setups: (live(setups) as { name: string }[]).map((s) => s.name),
        trades: withDeleted(trades),
        cashflows: withDeleted(cashflows),
        dayNotes: Object.fromEntries(
          notes
            .filter((n) => !n.deletedAt)
            .map((n) => [n.id, (n.data as { text: string }).text]),
        ),
      });
      return { data, revision: w.revision };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function writeWorkspace(input: unknown, revision: number) {
  const d = validateData(input);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(70192026)`;
      const w = await tx.workspace.findUnique({ where: { id: "personal" } });
      if ((w?.revision ?? 0) !== revision) throw new Error("CONFLICT");
      const now = new Date();
      // Upsert records and tombstone removed rows, preserving audit timestamps and soft deletion.
      const sync = async (
        model: string,
        rows: {
          id: string;
          data: unknown;
          accountId?: string;
          deleted?: boolean;
        }[],
      ) => {
        const delegate = tx[model as keyof typeof tx] as unknown as {
          updateMany: (a: unknown) => Promise<unknown>;
          upsert: (a: unknown) => Promise<unknown>;
        };
        await delegate.updateMany({
          where: { id: { notIn: rows.map((r) => r.id) }, deletedAt: null },
          data: { deletedAt: now },
        });
        for (const r of rows) {
          const record = {
            data: json(r.data),
            deletedAt: r.deleted ? now : null,
            ...(r.accountId ? { accountId: r.accountId } : {}),
          };
          await delegate.upsert({
            where: { id: r.id },
            create: { id: r.id, ...record },
            update: record,
          });
        }
      };
      await sync(
        "account",
        d.accounts.map((a) => ({ id: a.id, data: a, deleted: a.deleted })),
      );
      await sync(
        "instrument",
        d.instruments.map((i) => ({ id: i.sym, data: i })),
      );
      await sync(
        "phase",
        d.phases.map((p) => ({
          id: `${p.acc}|${p.no}`,
          accountId: p.acc,
          data: p,
        })),
      );
      await sync(
        "botcamp",
        d.botcamps.map((p) => ({
          id: `${p.acc}|${p.no}`,
          accountId: p.acc,
          data: p,
        })),
      );
      await sync(
        "fxRate",
        d.rates.map((r) => ({ id: r.date, data: r })),
      );
      await sync(
        "roundingStep",
        d.rounding.map((r) => ({ id: `${r.cur}|${r.from}`, data: r })),
      );
      await sync("sessionRule", [
        ...d.sessFX.map((r) => ({
          id: `FX|${r.t}`,
          data: { ...r, kind: "FX" },
        })),
        ...d.sessStock.map((r) => ({
          id: `STOCK_VN|${r.t}`,
          data: { ...r, kind: "STOCK_VN" },
        })),
      ]);
      await sync(
        "setup",
        d.setups.map((s) => ({ id: s, data: { name: s } })),
      );
      await sync(
        "trade",
        d.trades.map((t) => ({
          id: t.id,
          data: t,
          accountId: t.acc,
          deleted: t.deleted,
        })),
      );
      await sync(
        "cashflow",
        d.cashflows.map((c) => ({
          id: c.id,
          data: c,
          accountId: c.acc,
          deleted: c.deleted,
        })),
      );
      await sync(
        "dayJournal",
        Object.entries(d.dayNotes).map(([id, text]) => ({
          id,
          data: { text },
        })),
      );
      const next = revision + 1;
      await tx.workspace.upsert({
        where: { id: "personal" },
        create: { id: "personal", general: json(d.general), revision: next },
        update: { general: json(d.general), revision: next },
      });
      return { revision: next };
    },
    { timeout: 60000 },
  );
}
