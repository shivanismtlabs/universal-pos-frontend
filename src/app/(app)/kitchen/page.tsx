"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { cn } from "@/lib/utils";
import {
  DiningEmpty,
  DiningShell,
  DiningStatusBadge,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalFrame } from "@/components/modal-frame";

const STEPS = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;

const COLS = [
  { id: "new", title: "New" },
  { id: "accepted", title: "Accepted" },
  { id: "preparing", title: "Preparing" },
  { id: "ready", title: "Ready" },
] as const;

type KotRow = Awaited<ReturnType<typeof restaurantApi.kots>>[number];

function elapsedLabel(iso: string, now: number) {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms / 1000) % 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function nextLineStatus(status: string) {
  const i = STEPS.indexOf(status as (typeof STEPS)[number]);
  if (i < 0 || i >= STEPS.length - 2) return null;
  return STEPS[i + 1];
}

function beepReady() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    /* ignore */
  }
}

export default function KitchenPage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed =
    hasCapability("KOT") || hasCapability("KITCHEN") || hasCapability("KDS");
  const kds = hasCapability("KDS");
  const [stationFilter, setStationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seenReady = useRef<Set<string> | null>(null);

  const stations = useQuery({
    queryKey: ["restaurant-stations"],
    queryFn: () => restaurantApi.stations(),
    enabled: allowed,
  });
  const kots = useQuery({
    queryKey: ["restaurant-kots"],
    queryFn: () => restaurantApi.kots(),
    enabled: allowed,
    refetchInterval: 8_000,
  });

  const items = kots.data ?? [];

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const readyIds = items
      .filter((k) => k.status === "ready")
      .map((k) => k.id);
    if (seenReady.current == null) {
      seenReady.current = new Set(readyIds);
      return;
    }
    for (const k of items) {
      if (k.status !== "ready" || seenReady.current.has(k.id)) continue;
      seenReady.current.add(k.id);
      toast.success(
        `Food ready · ${k.tableName ?? k.orderNumber} · ${k.kotNumber}`,
      );
      beepReady();
    }
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter((k) => {
        if (stationFilter !== "all" && k.stationId !== stationFilter) return false;
        if (statusFilter === "open") {
          return !["served", "cancelled"].includes(k.status);
        }
        if (statusFilter !== "all" && k.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [items, stationFilter, statusFilter]);

  const stats = useMemo(() => {
    const open = items.filter((k) => !["served", "cancelled"].includes(k.status));
    const delayed = open.filter((k) => k.aging === "delayed").length;
    const critical = open.filter((k) => k.aging === "critical").length;
    const ready = items.filter((k) => k.status === "ready").length;
    const served = items.filter((k) => k.status === "served");
    const readyTimes = items
      .filter((k) => k.readyAt)
      .map(
        (k) =>
          (new Date(k.readyAt!).getTime() - new Date(k.createdAt).getTime()) /
          60_000,
      );
    const avgReady =
      readyTimes.length > 0
        ? Math.round(
            readyTimes.reduce((s, n) => s + n, 0) / readyTimes.length,
          )
        : null;
    return {
      open: open.length,
      delayed,
      critical,
      ready,
      served: served.length,
      avgReady,
    };
  }, [items]);

  const openKot = items.find((k) => k.id === openId) ?? null;

  if (!allowed) {
    return (
      <DiningShell
        title="Kitchen"
        subtitle="Enable KOT in Capabilities to show kitchen tickets."
      >
        <DiningEmpty
          title="Kitchen is off"
          detail="This screen stays hidden for shops that do not use kitchen tickets."
        />
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Kitchen"
      subtitle="Live queue. Same KOTs as Counter. Pick a station to run that KDS screen."
      action={
        <Button type="button" variant="secondary" onClick={() => setPerfOpen(true)}>
          Performance
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "On the pass"],
            ["all", "All"],
            ...STEPS.map((s) => [s, s[0]!.toUpperCase() + s.slice(1)] as const),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1",
              statusFilter === id
                ? "bg-[#1a56db] text-white ring-[#1a56db]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#e2e8f0]" />
        <button
          type="button"
          onClick={() => setStationFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            stationFilter === "all"
              ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
              : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
          )}
        >
          All stations
        </button>
        {(stations.data ?? []).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStationFilter(s.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              stationFilter === s.id
                ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {!kots.isLoading && !items.length ? (
        <DiningEmpty
          title="No kitchen tickets"
          detail="Open a dining order, add items at Counter, then Send KOT. Stations split tickets by item category."
        />
      ) : statusFilter === "open" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((col) => {
            const list = filtered.filter((o) => o.status === col.id);
            return (
              <section
                key={col.id}
                className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc]"
              >
                <div className="flex items-center justify-between border-b border-[#eef1f4] px-3 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
                    {col.title}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums text-[#0b1f33] ring-1 ring-[#e2e8f0]">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2 p-2.5">
                  {list.map((o) => (
                    <KotCard
                      key={o.id}
                      o={o}
                      compact={!kds}
                      now={now}
                      onOpen={() => setOpenId(o.id)}
                    />
                  ))}
                  {!list.length ? (
                    <p className="px-2 py-6 text-center text-xs text-[#8b9bb0]">
                      Empty
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((o) => (
            <KotCard key={o.id} o={o} now={now} onOpen={() => setOpenId(o.id)} />
          ))}
        </div>
      )}

      {openKot ? (
        <KotModal
          kot={openKot}
          now={now}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void qc.invalidateQueries({ queryKey: ["restaurant-kots"] });
          }}
        />
      ) : null}
      {perfOpen ? (
        <ModalFrame
          title="Kitchen performance"
          subtitle="Open tickets on this screen. Not a full reports pack."
          onClose={() => setPerfOpen(false)}
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-[#f8fafc] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                On the pass
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.open}
              </dd>
            </div>
            <div className="rounded-lg bg-[#f8fafc] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                Ready
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.ready}
              </dd>
            </div>
            <div className="rounded-lg bg-[#fffbeb] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                Delayed
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.delayed}
              </dd>
            </div>
            <div className="rounded-lg bg-[#fef2f2] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                Critical
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.critical}
              </dd>
            </div>
            <div className="rounded-lg bg-[#f8fafc] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                Served (loaded)
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.served}
              </dd>
            </div>
            <div className="rounded-lg bg-[#f8fafc] p-3">
              <dt className="text-[0.7rem] uppercase tracking-wide text-[#8b9bb0]">
                Avg to ready
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {stats.avgReady != null ? `${stats.avgReady} min` : "—"}
              </dd>
            </div>
          </dl>
        </ModalFrame>
      ) : null}
    </DiningShell>
  );
}

function KotCard({
  o,
  compact,
  now,
  onOpen,
}: {
  o: KotRow;
  compact?: boolean;
  now: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-xl border bg-white text-left transition hover:border-[#bfdbfe]",
        compact ? "p-3" : "p-4",
        o.priority >= 5
          ? "border-[#fdba74] ring-1 ring-[#fdba74]"
          : "border-[#e2e8f0]",
        o.aging === "critical" ? "border-[#fca5a5]" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0b1f33]">
            {o.kotNumber}
            {o.tableName ? (
              <span className="ml-1.5 font-medium text-[#5a6b7d]">
                · {o.tableName}
              </span>
            ) : null}
            {o.priority >= 5 ? (
              <span className="ml-1.5 text-[0.65rem] font-semibold uppercase text-[#c2410c]">
                Priority
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[#8b9bb0]">
            {o.stationName ?? "Unassigned"}
            {o.diningMode ? ` · ${o.diningMode.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              o.aging === "critical"
                ? "text-[#b91c1c]"
                : o.aging === "delayed"
                  ? "text-[#c2410c]"
                  : "text-[#0b1f33]",
            )}
          >
            {elapsedLabel(o.createdAt, now)}
          </span>
          <DiningStatusBadge value={o.status} />
        </div>
      </div>
      <ul className="mt-2.5 space-y-1 rounded-lg bg-[#f8fafc] px-3 py-2 text-sm text-[#0b1f33]">
        {o.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-2">
            <span>
              <span className="tabular-nums text-[#5a6b7d]">{line.quantity}×</span>{" "}
              {line.name}
            </span>
            {line.status && line.status !== o.status ? (
              <span className="text-[0.65rem] capitalize text-[#8b9bb0]">
                {line.status}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {o.specialInstructions ? (
        <p className="mt-1.5 text-[0.7rem] text-[#9a3412]">
          {o.specialInstructions}
        </p>
      ) : null}
    </button>
  );
}

function KotModal({
  kot,
  now,
  onClose,
  onChanged,
}: {
  kot: KotRow;
  now: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [panel, setPanel] = useState<"main" | "cancel" | "modify">("main");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(kot.specialInstructions ?? "");

  const setStatus = useMutation({
    mutationFn: (opts: {
      status?: string;
      cancelReason?: string;
      specialInstructions?: string;
      priority?: number;
      lineId?: string;
    }) => restaurantApi.updateKot(kot.id, opts),
    onSuccess: () => {
      onChanged();
      if (panel !== "main") setPanel("main");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reprint = useMutation({
    mutationFn: () => restaurantApi.reprintKot(kot.id),
    onSuccess: () => {
      printKotTicket(kot);
      onChanged();
      toast.success(
        kot.printerName
          ? `Reprint · send to ${kot.printerName}`
          : "KOT reprint opened",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={kot.kotNumber}
      subtitle={`${kot.tableName ?? kot.orderNumber} · ${kot.stationName ?? "Kitchen"} · ${elapsedLabel(kot.createdAt, now)}`}
      onClose={onClose}
      className="max-w-lg"
      footer={
        panel === "cancel" ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPanel("main")}>
              Back
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={reason.trim().length < 3 || setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  status: "cancelled",
                  cancelReason: reason.trim(),
                })
              }
            >
              Cancel KOT
            </Button>
          </div>
        ) : panel === "modify" ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPanel("main")}>
              Back
            </Button>
            <Button
              type="button"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate({ specialInstructions: note })
              }
            >
              Save note
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={reprint.isPending}
              onClick={() => reprint.mutate()}
            >
              Reprint
              {kot.reprintCount ? ` · ${kot.reprintCount}` : ""}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPanel("modify")}
            >
              Modify
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={kot.status === "cancelled"}
              onClick={() => setPanel("cancel")}
            >
              Cancel KOT
            </Button>
          </div>
        )
      }
    >
      {panel === "cancel" ? (
        <div>
          <Label>Reason</Label>
          <Input
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="At least 3 characters"
          />
        </div>
      ) : panel === "modify" ? (
        <div>
          <Label>Kitchen note</Label>
          <textarea
            className={cn(diningSelectClass, "mt-1 min-h-[6rem] w-full py-2")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="mt-2 text-xs text-[#8b9bb0]">
            New items on the same bill: add them at Counter, then Send KOT again
            — only unsent lines create a new ticket.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-1 rounded-lg bg-[#f8fafc] px-3 py-2 text-sm">
            {kot.lines.map((line) => {
              const next = nextLineStatus(line.status ?? kot.status);
              return (
                <li key={line.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span>
                    <span className="tabular-nums text-[#5a6b7d]">
                      {line.quantity}×
                    </span>{" "}
                    {line.name}
                  </span>
                  <button
                    type="button"
                    disabled={!next || setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        lineId: line.id,
                        status: next ?? undefined,
                      })
                    }
                    className="shrink-0 rounded-md border border-[#e2e8f0] px-2 py-0.5 text-[0.65rem] font-semibold capitalize text-[#1a56db] disabled:text-[#8b9bb0]"
                  >
                    {line.status ?? kot.status}
                    {next ? " →" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
          {kot.specialInstructions ? (
            <p className="mt-3 text-sm text-[#5a6b7d]">
              Note: {kot.specialInstructions}
            </p>
          ) : null}
          <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
            Priority
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(
              [
                [0, "Normal"],
                [5, "Rush"],
                [9, "Urgent"],
              ] as const
            ).map(([n, label]) => (
              <button
                key={n}
                type="button"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ priority: n })}
                className={cn(
                  "rounded-md border px-2 py-1 text-[0.65rem] font-semibold",
                  kot.priority === n
                    ? "border-[#c2410c] bg-[#fff7ed] text-[#c2410c]"
                    : "border-[#e2e8f0] bg-white text-[#5a6b7d]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
            Status
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {STEPS.map((step) => {
              const active = kot.status === step;
              return (
                <button
                  key={step}
                  type="button"
                  disabled={active || setStatus.isPending || step === "cancelled"}
                  onClick={() => setStatus.mutate({ status: step })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[0.65rem] font-semibold capitalize",
                    active
                      ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                      : "border-[#e2e8f0] bg-white text-[#5a6b7d] hover:bg-[#f8fafc]",
                  )}
                >
                  {step}
                </button>
              );
            })}
          </div>
        </>
      )}
    </ModalFrame>
  );
}

function printKotTicket(o: KotRow) {
  const w = window.open("", "_blank", "noopener,width=420,height=640");
  if (!w) return;
  const lines = o.lines
    .map(
      (l) =>
        `<li>${l.quantity} × ${escapeHtml(l.name)}${
          l.notes ? ` — ${escapeHtml(l.notes)}` : ""
        }</li>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(o.kotNumber)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;padding:16px;color:#111}
  h1{font-size:18px;margin:0 0 8px}
  p,li{font-size:13px;margin:0 0 4px}
  ul{padding-left:18px}
</style></head><body>
<h1>${escapeHtml(o.kotNumber)}${o.reprintCount ? ` · reprint ${o.reprintCount}` : ""}</h1>
<p>${escapeHtml(o.orderNumber ?? "")}${o.tableName ? ` · ${escapeHtml(o.tableName)}` : ""}</p>
<p>${escapeHtml(o.stationName ?? "Kitchen")}${o.printerName ? ` · printer ${escapeHtml(o.printerName)}` : ""}${o.diningMode ? ` · ${escapeHtml(o.diningMode.replaceAll("_", " "))}` : ""}</p>
<ul>${lines}</ul>
${o.specialInstructions ? `<p>Note: ${escapeHtml(o.specialInstructions)}</p>` : ""}
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
