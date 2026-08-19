"use client";

import { Button } from "@/components/ui/button";

export function TablePager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (next: number) => void;
}) {
  if (total <= 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e7eb] bg-[#fafbfc] px-3 py-2">
      <p className="text-[0.75rem] text-[#6b7280]">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          Prev
        </Button>
        <span className="min-w-[4.5rem] text-center text-[0.75rem] tabular-nums text-[#4b5563]">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
