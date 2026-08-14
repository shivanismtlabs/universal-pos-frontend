"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountingApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { AccountingNav } from "../accounting-nav";

type MappingRow = {
  key: string;
  label: string;
  group: string;
  mapping: {
    accountId: string;
    account: { id: string; code: string; name: string };
  } | null;
};

export default function MappingsPage() {
  const qc = useQueryClient();
  const maps = useQuery({
    queryKey: ["accounting", "mappings"],
    queryFn: () => accountingApi.mappings(),
  });
  const accounts = useQuery({
    queryKey: ["accounting", "accounts", "map"],
    queryFn: () => accountingApi.listAccounts({ limit: 100, active: "true" }),
  });
  const accountItems = (accounts.data?.items ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>;
  const save = useMutation({
    mutationFn: (body: { mappingKey: string; accountId: string }) =>
      accountingApi.upsertMapping(body),
    onSuccess: () => {
      toast.success("Mapping saved");
      void qc.invalidateQueries({ queryKey: ["accounting", "mappings"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });
  const rows = (maps.data ?? []) as MappingRow[];
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Account Mapping"
        subtitle="Map POS transaction types, tenders, and tax keys to GL accounts. Same engine for every commerce mode."
      />
      <AccountingNav />
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-[13px] font-semibold text-[#111827]">{g}</h2>
          <table className="mb-4 w-full text-left text-[13px] rounded-lg border border-[#e5e7eb] bg-white">
            <tbody>
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.key} className="border-t border-[#e5e7eb]">
                    <td className="px-3 py-2 w-1/3">{r.label}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={r.mapping?.accountId ?? ""}
                        onChange={(e) =>
                          save.mutate({ mappingKey: r.key, accountId: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        {accountItems.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
