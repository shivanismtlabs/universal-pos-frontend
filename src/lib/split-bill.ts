/** Universal ticket split (any commerce) — not restaurant-only. */

export type SplitBillMode = "portion" | "percentage" | "item";

export type SplitBillLine = {
  id: string;
  name: string;
  qty: number;
  amount: number;
};

export type SplitBillPart = {
  id: string;
  label: string;
  amount: number;
  lineIds: string[];
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Last slice absorbs leftover paise so parts sum to total. */
export function allocateEqual(total: number, parts: number): number[] {
  const n = Math.max(2, Math.floor(parts));
  const base = Math.floor((total * 100) / n) / 100;
  const out = Array.from({ length: n - 1 }, () => base);
  out.push(roundMoney(total - base * (n - 1)));
  return out;
}

export function allocatePercents(total: number, percents: number[]): number[] {
  const clean = percents.map((p) => Math.max(0, Number(p) || 0));
  if (clean.length < 2) return [];
  const out = clean.map((p) => roundMoney((total * p) / 100));
  const drift = roundMoney(total - out.reduce((s, n) => s + n, 0));
  out[out.length - 1] = roundMoney(out[out.length - 1] + drift);
  return out;
}

export function percentSum(percents: number[]) {
  return roundMoney(percents.reduce((s, p) => s + (Number(p) || 0), 0));
}

/** Share of ticket total by line gross (includes tax/discount in the ticket total). */
export function allocateByLineGroups(
  total: number,
  lines: SplitBillLine[],
  groups: string[][],
): number[] {
  const weight = new Map(lines.map((l) => [l.id, l.amount]));
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  if (gross <= 0) return groups.map(() => 0);
  const out = groups.map((ids) => {
    const g = ids.reduce((s, id) => s + (weight.get(id) ?? 0), 0);
    return roundMoney((g / gross) * total);
  });
  const drift = roundMoney(total - out.reduce((s, n) => s + n, 0));
  if (out.length) out[out.length - 1] = roundMoney(out[out.length - 1] + drift);
  return out;
}

export function partsFromAmounts(
  amounts: number[],
  lineIdsPerPart: string[][] = [],
): SplitBillPart[] {
  return amounts.map((amount, i) => ({
    id: `part-${i + 1}`,
    label: `Part ${i + 1}`,
    amount: roundMoney(amount),
    lineIds: lineIdsPerPart[i] ?? [],
  }));
}
