"use client";

/**
 * Security — audit logs, activity, IP allowlist, session timeout, 2FA, backup, encryption.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { securityApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageSkeleton } from "@/components/page-header";
import { cn } from "@/lib/utils";

type SecTab = "overview" | "audit" | "2fa" | "backup";

export default function SecuritySettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const isAdmin = roles?.includes("admin");
  const canLead = canManageStaff(roles);
  const [tab, setTab] = useState<SecTab>("overview");

  const settingsQ = useQuery({
    queryKey: ["security-settings"],
    queryFn: () => securityApi.settings(),
    enabled: canLead,
  });

  const ipQ = useQuery({
    queryKey: ["security-ip"],
    queryFn: () => securityApi.myIp(),
  });

  const twoQ = useQuery({
    queryKey: ["security-2fa"],
    queryFn: () => securityApi.my2fa(),
  });

  const [ipText, setIpText] = useState("");
  const [idle, setIdle] = useState("0");
  const [encryptBackups, setEncryptBackups] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!settingsQ.data || hydrated) return;
    setIpText((settingsQ.data.ipAllowlist ?? []).join("\n"));
    setIdle(String(settingsQ.data.idleTimeoutMinutes ?? 0));
    setEncryptBackups(Boolean(settingsQ.data.encryptBackups));
    setHydrated(true);
  }, [settingsQ.data, hydrated]);

  const save = useMutation({
    mutationFn: () =>
      securityApi.updateSettings({
        ipAllowlist: ipText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        idleTimeoutMinutes: Number(idle) || 0,
        encryptBackups,
      }),
    onSuccess: () => {
      toast.success("Security settings saved");
      void qc.invalidateQueries({ queryKey: ["security-settings"] });
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  if (!canLead && tab === "overview") {
    /* cashiers still use 2FA tab */
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <header className="border-b border-[#eef1f4] pb-4">
        <p className="eyebrow">Settings · Security</p>
        <h1 className="page-title mt-1 flex items-center gap-2">
          <Shield className="size-6 shrink-0 text-[#1a56db]" strokeWidth={2.25} />
          Security
        </h1>
        <p className="page-subtitle mt-1.5">
          Audit trail, IP restrictions, session timeout, 2FA, encrypted backups.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Access & encryption"],
            ["audit", "Audit & activity"],
            ["2fa", "Two-factor"],
            ["backup", "Backup"],
          ] as const
        )
          .filter(([id]) => (id === "2fa" ? true : canLead))
          .filter(([id]) => (id === "backup" ? isAdmin : true))
          .map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === id
                  ? "bg-[#1a56db] text-white"
                  : "border border-[#d9e0ea] bg-white text-[#5a6b7d]",
              )}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
      </div>

      {tab === "overview" && canLead ? (
        <section className="space-y-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div>
            <Label>Your current IP</Label>
            <p className="mt-1 font-mono text-sm text-[#0b1f33]">
              {ipQ.data?.ip || "…"}
            </p>
          </div>
          <div>
            <Label htmlFor="ips">IP allowlist (one per line)</Label>
            <p className="mt-0.5 text-xs text-[#6b7280]">
              Empty = all IPs allowed. Examples: 203.0.113.10 or 192.168.1. or
              10.0.0.0/8. Add your current IP before saving or you will lock
              yourself out.
            </p>
            <textarea
              id="ips"
              className="mt-2 min-h-[120px] w-full rounded-md border border-[#d9e0ea] px-3 py-2 font-mono text-sm"
              value={ipText}
              onChange={(e) => setIpText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="idle">Session idle timeout (minutes)</Label>
            <p className="mt-0.5 text-xs text-[#6b7280]">
              0 = no idle logout. After this many minutes with no activity, the
              browser session signs out.
            </p>
            <Input
              id="idle"
              className="mt-2 max-w-[8rem]"
              type="number"
              min={0}
              max={480}
              value={idle}
              onChange={(e) => setIdle(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={encryptBackups}
              onChange={(e) => setEncryptBackups(e.target.checked)}
            />
            Encrypt downloaded backups (AES-256-GCM)
          </label>
          <div className="rounded-lg bg-[#f8fafc] px-3 py-2 text-xs text-[#5a6b7d]">
            <p className="font-semibold text-[#0b1f33]">Data encryption</p>
            <ul className="mt-1 list-disc pl-4">
              <li>Passwords and PINs stored as hashes (never plaintext)</li>
              <li>2FA secrets encrypted at rest</li>
              <li>
                {settingsQ.data?.encryption.note ??
                  "Set SECURITY_DATA_KEY on the API for a dedicated backup key."}
              </li>
            </ul>
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </section>
      ) : null}

      {tab === "audit" && canLead ? <AuditPanel /> : null}
      {tab === "2fa" ? <TwoFaPanel enabled={twoQ.data?.enabled} /> : null}
      {tab === "backup" && isAdmin ? <BackupPanel /> : null}
    </div>
  );
}

function AuditPanel() {
  const [q, setQ] = useState("");
  const logs = useQuery({
    queryKey: ["security-audit", q],
    queryFn: () => securityApi.auditLogs({ q: q || undefined, limit: 100 }),
  });

  const csv = useMemo(() => {
    const rows = logs.data?.items ?? [];
    const header = "time,actor,email,action,ip\n";
    return (
      header +
      rows
        .map((r) =>
          [
            r.createdAt,
            r.actor?.name ?? "",
            r.actor?.email ?? "",
            r.label,
            r.ip ?? "",
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\n")
    );
  }, [logs.data]);

  if (logs.isLoading) return <PageSkeleton />;

  return (
    <section className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search actor, action, IP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "audit-log.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export CSV
        </Button>
      </div>
      <ul className="divide-y divide-[#eef2f8]">
        {(logs.data?.items ?? []).map((r) => (
          <li key={r.id} className="py-2.5 text-sm">
            <p className="font-medium text-[#0b1f33]">{r.label}</p>
            <p className="text-xs text-[#6b7280]">
              {new Date(r.createdAt).toLocaleString()} ·{" "}
              {r.actor?.name ?? "System"} · {r.ip ?? "no IP"}
            </p>
          </li>
        ))}
        {(logs.data?.items ?? []).length === 0 ? (
          <li className="py-8 text-center text-sm text-[#8a9bb0]">
            No activity yet
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function TwoFaPanel({ enabled }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{
    secret: string;
    qrUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");

  const start = useMutation({
    mutationFn: () => securityApi.setup2fa(),
    onSuccess: (d) => setSetup({ secret: d.secret, qrUrl: d.qrUrl }),
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Setup failed"),
  });

  const enable = useMutation({
    mutationFn: () => securityApi.enable2fa(code),
    onSuccess: (d) => {
      setBackup(d.backupCodes);
      setSetup(null);
      toast.success("2FA enabled");
      void qc.invalidateQueries({ queryKey: ["security-2fa"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Invalid code"),
  });

  const disable = useMutation({
    mutationFn: () => securityApi.disable2fa(password),
    onSuccess: () => {
      toast.success("2FA disabled");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["security-2fa"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <section className="space-y-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-sm text-[#5a6b7d]">
        Status:{" "}
        <strong className="text-[#0b1f33]">
          {enabled ? "On" : "Off"}
        </strong>
        . Use Google Authenticator, Authy, or 1Password.
      </p>
      {backup ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold">Save these backup codes now</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
            {backup.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {enabled ? (
        <div className="max-w-sm space-y-2">
          <Label>Password to disable 2FA</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={disable.isPending || !password}
            onClick={() => disable.mutate()}
          >
            Disable 2FA
          </Button>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrUrl} alt="2FA QR" width={200} height={200} />
          <p className="font-mono text-xs break-all">{setup.secret}</p>
          <Label>Code from app</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={8}
            className="max-w-[10rem]"
          />
          <Button disabled={enable.isPending} onClick={() => enable.mutate()}>
            Confirm &amp; enable
          </Button>
        </div>
      ) : (
        <Button disabled={start.isPending} onClick={() => start.mutate()}>
          Set up authenticator
        </Button>
      )}
    </section>
  );
}

function BackupPanel() {
  const exportM = useMutation({
    mutationFn: () => securityApi.exportBackup(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `upos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Export failed"),
  });

  const restoreM = useMutation({
    mutationFn: (backup: Record<string, unknown>) =>
      securityApi.restoreBackup(backup),
    onSuccess: (r) =>
      toast.success(
        `Restored ${r.productsUpserted} products, ${r.customersUpserted} customers`,
      ),
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Restore failed"),
  });

  return (
    <section className="space-y-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-sm text-[#5a6b7d]">
        Export catalog, customers, stock, locations, and settings. Restore
        upserts by SKU / phone into this shop. Sales history is not overwritten.
      </p>
      <Button disabled={exportM.isPending} onClick={() => exportM.mutate()}>
        {exportM.isPending ? "Preparing…" : "Download backup"}
      </Button>
      <div>
        <Label>Restore from file</Label>
        <input
          type="file"
          accept="application/json"
          className="mt-2 block text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (
              !confirm(
                "Restore will upsert products and customers into this shop. Continue?",
              )
            ) {
              e.target.value = "";
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const json = JSON.parse(String(reader.result)) as Record<
                  string,
                  unknown
                >;
                restoreM.mutate(json);
              } catch {
                toast.error("Invalid JSON file");
              }
            };
            reader.readAsText(file);
          }}
        />
      </div>
    </section>
  );
}
