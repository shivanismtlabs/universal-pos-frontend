"use client";

import { useMemo, useState } from "react";
import { List, Percent, PieChart } from "lucide-react";
import { ModalFrame } from "@/components/modal-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  allocateByLineGroups,
  allocateEqual,
  allocatePercents,
  partsFromAmounts,
  percentSum,
  type SplitBillLine,
  type SplitBillMode,
  type SplitBillPart,
} from "@/lib/split-bill";

const TABS: Array<{ id: SplitBillMode; label: string; icon: typeof PieChart }> =
  [
    { id: "portion", label: "Portion wise", icon: PieChart },
    { id: "percentage", label: "Percentage wise", icon: Percent },
    { id: "item", label: "Item wise", icon: List },
  ];

export function SplitBillModal({
  open,
  total,
  lines,
  money,
  onClose,
  onSave,
}: {
  open: boolean;
  total: number;
  lines: SplitBillLine[];
  money: (n: string | number) => string;
  onClose: () => void;
  onSave: (parts: SplitBillPart[], mode: SplitBillMode) => void;
}) {
  const [mode, setMode] = useState<SplitBillMode>("portion");
  const [portion, setPortion] = useState("2");
  const [percents, setPercents] = useState<string[]>(["50", "50"]);
  const [partBuckets, setPartBuckets] = useState<string[][]>([[], []]);
  const [picked, setPicked] = useState<string[]>([]);

  const unassigned = useMemo(() => {
    const used = new Set(partBuckets.flat());
    return lines.filter((l) => !used.has(l.id));
  }, [lines, partBuckets]);

  if (!open) return null;

  const portionN = Math.max(2, Math.floor(Number(portion) || 0));
  const pctNums = percents.map((p) => Number(p) || 0);
  const pctTotal = percentSum(pctNums);

  function save() {
    if (total <= 0) return;
    if (mode === "portion") {
      if (!Number.isFinite(portionN) || portionN < 2) return;
      onSave(partsFromAmounts(allocateEqual(total, portionN)), "portion");
      return;
    }
    if (mode === "percentage") {
      if (percents.length < 2 || Math.abs(pctTotal - 100) > 0.05) return;
      onSave(partsFromAmounts(allocatePercents(total, pctNums)), "percentage");
      return;
    }
    if (unassigned.length || partBuckets.some((b) => !b.length)) return;
    const amounts = allocateByLineGroups(total, lines, partBuckets);
    onSave(partsFromAmounts(amounts, partBuckets), "item");
  }

  const canSave =
    mode === "portion"
      ? portionN >= 2 && portionN <= 20
      : mode === "percentage"
        ? percents.length >= 2 && Math.abs(pctTotal - 100) <= 0.05
        : unassigned.length === 0 &&
          partBuckets.length >= 2 &&
          partBuckets.every((b) => b.length > 0);

  return (
    <ModalFrame
      title="Split bill"
      subtitle={`${money(total)} · same ticket, multiple collections — any business`}
      onClose={onClose}
      labelledBy="split-bill-title"
      className="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={save}>
            Save split
          </Button>
        </div>
      }
    >
      <div className="flex gap-1 border-b border-[#e8edf4] pb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold",
                on
                  ? "bg-[#e8eefb] text-[#1a56db]"
                  : "text-[#5a6b7d] hover:bg-[#f8fafc]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        {mode === "portion" ? (
          <div className="space-y-2">
            <Label>Split into how many equal parts?</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#5a6b7d]">1 /</span>
              <Input
                className="max-w-[8rem]"
                inputMode="numeric"
                value={portion}
                onChange={(e) => setPortion(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="2"
              />
            </div>
            <ul className="space-y-1 text-sm text-[#0b1f33]">
              {allocateEqual(total, portionN).map((amt, i) => (
                <li key={i} className="flex justify-between rounded-lg bg-[#f8fafc] px-3 py-1.5">
                  <span>Part {i + 1}</span>
                  <span className="font-semibold tabular-nums">{money(amt)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {mode === "percentage" ? (
          <div className="space-y-3">
            <p className="text-xs text-[#5a6b7d]">
              Enter numbers only. Parts must add to 100%.
            </p>
            {percents.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Label className="w-36 shrink-0 text-[0.7rem]">
                  Percentage {i + 1}
                </Label>
                <Input
                  inputMode="decimal"
                  value={p}
                  placeholder="e.g. 50"
                  onChange={(e) =>
                    setPercents((prev) =>
                      prev.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                <span className="w-24 text-right text-sm font-semibold tabular-nums">
                  {money(allocatePercents(total, pctNums)[i] ?? 0)}
                </span>
                {percents.length > 2 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#c81e1e]"
                    onClick={() =>
                      setPercents((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <p
              className={cn(
                "text-xs font-semibold",
                Math.abs(pctTotal - 100) <= 0.05
                  ? "text-[#166534]"
                  : "text-[#c81e1e]",
              )}
            >
              Total {pctTotal}% {Math.abs(pctTotal - 100) > 0.05 ? "(must be 100)" : ""}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={percents.length >= 8}
              onClick={() => setPercents((prev) => [...prev, "0"])}
            >
              Add more
            </Button>
          </div>
        ) : null}

        {mode === "item" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#e8edf4]">
              <div className="flex items-center justify-between bg-[#f8fafc] px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[#5a6b7d]">
                  All items
                </p>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={
                      unassigned.length > 0 &&
                      unassigned.every((l) => picked.includes(l.id))
                    }
                    onChange={(e) =>
                      setPicked(
                        e.target.checked ? unassigned.map((l) => l.id) : [],
                      )
                    }
                  />
                  Select
                </label>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
                {unassigned.map((l) => (
                  <li key={l.id}>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#f8fafc]">
                      <input
                        type="checkbox"
                        checked={picked.includes(l.id)}
                        onChange={(e) =>
                          setPicked((prev) =>
                            e.target.checked
                              ? [...prev, l.id]
                              : prev.filter((id) => id !== l.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {l.name} × {l.qty}
                      </span>
                      <span className="tabular-nums text-[#5a6b7d]">
                        {money(l.amount)}
                      </span>
                    </label>
                  </li>
                ))}
                {!unassigned.length ? (
                  <li className="px-2 py-6 text-center text-xs text-[#8b9bb0]">
                    All items assigned
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="space-y-2">
              {partBuckets.map((bucket, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[#e8edf4]"
                >
                  <div className="flex items-center justify-between bg-[#e8eefb] px-3 py-2">
                    <p className="text-xs font-bold text-[#1a56db]">
                      Part {i + 1}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      disabled={!picked.length}
                      onClick={() => {
                        setPartBuckets((prev) =>
                          prev.map((b, j) =>
                            j === i ? [...b, ...picked] : b,
                          ),
                        );
                        setPicked([]);
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  <ul className="min-h-[3rem] p-2 text-sm">
                    {bucket.map((id) => {
                      const line = lines.find((l) => l.id === id);
                      if (!line) return null;
                      return (
                        <li
                          key={id}
                          className="flex justify-between gap-2 py-0.5"
                        >
                          <span className="truncate">{line.name}</span>
                          <button
                            type="button"
                            className="text-[0.65rem] text-[#c81e1e]"
                            onClick={() =>
                              setPartBuckets((prev) =>
                                prev.map((b, j) =>
                                  j === i ? b.filter((x) => x !== id) : b,
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={partBuckets.length >= 8}
                onClick={() => setPartBuckets((prev) => [...prev, []])}
              >
                Add part
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
