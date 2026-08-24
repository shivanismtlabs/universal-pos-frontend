"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { customersApi, jobsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TablePager } from "@/components/table-pager";
import { pagerFromMeta } from "@/lib/use-paged-list";

export default function JobsPage() {
  const { hasCapability, hasModule, money } = useBootstrap();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("phone");
  const [identifier, setIdentifier] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const allowed =
    hasCapability("REPAIR_JOB") ||
    hasCapability("ASSET") ||
    hasModule("jobs");

  const jobs = useQuery({
    queryKey: ["jobs", page],
    queryFn: () => jobsApi.listJobs({ page, limit: pageSize }),
    enabled: allowed,
    placeholderData: (prev) => prev,
  });

  const customers = useQuery({
    queryKey: ["customers-lite"],
    queryFn: () => customersApi.list({ limit: 100 }),
    enabled: allowed,
  });

  const createJobFlow = useMutation({
    mutationFn: async () => {
      const asset = await jobsApi.createAsset({
        customerId,
        name: assetName.trim(),
        assetType,
        identifier: identifier.trim() || undefined,
      });
      return jobsApi.createJob({
        customerId,
        assetId: asset.id,
        title: title.trim() || `${asset.name} repair`,
        problem: problem.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Job created");
      setTitle("");
      setProblem("");
      setAssetName("");
      setIdentifier("");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed"),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enable REPAIR_JOB / ASSET capabilities for work-order workflows
          (repair, laundry intake, detailing).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0b1f33]">Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Customer asset + work job — optional module, not retail core.
        </p>
      </div>

      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!customerId || !assetName.trim()) {
            toast.error("Customer and asset name required");
            return;
          }
          createJobFlow.mutate();
        }}
      >
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-600">Customer</span>
          <Select
            className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select customer</option>
            {(customers.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Asset name</span>
          <Input
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            placeholder="iPhone 15"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Asset type</span>
          <Input
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            placeholder="phone"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Identifier (IMEI / plate)</span>
          <Input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Job title</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Screen replacement"
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-600">Problem</span>
          <Input value={problem} onChange={(e) => setProblem(e.target.value)} />
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={createJobFlow.isPending}>
            Create asset + job
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Asset</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Est.</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data?.data ?? []).map((j) => (
              <tr key={j.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{j.title}</td>
                <td className="px-3 py-2">{j.customer?.fullName ?? "—"}</td>
                <td className="px-3 py-2">{j.asset?.name ?? "—"}</td>
                <td className="px-3 py-2">{j.status}</td>
                <td className="px-3 py-2">
                  {j.estimatedCost != null ? money(j.estimatedCost) : "—"}
                </td>
              </tr>
            ))}
            {!jobs.isLoading && !(jobs.data?.data?.length) ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No jobs yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          {...pagerFromMeta(
            jobs.data?.meta
              ? {
                  ...jobs.data.meta,
                  totalPages: Math.max(
                    1,
                    Math.ceil((jobs.data.meta.total || 0) / pageSize) || 1,
                  ),
                }
              : undefined,
            page,
            pageSize,
            setPage,
            jobs.data?.data?.length ?? 0,
          )}
        />
      </div>
    </div>
  );
}
