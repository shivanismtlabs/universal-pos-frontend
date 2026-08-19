"use client";

import { useMemo, useState } from "react";

/** Client-side page slice for list UIs that load a full array. */
export function usePagedList<T>(rows: T[] | undefined | null, pageSize = 20) {
  const list = rows ?? [];
  const [page, setPage] = useState(1);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const slice = useMemo(
    () => list.slice((pageSafe - 1) * pageSize, pageSafe * pageSize),
    [list, pageSafe, pageSize],
  );
  return {
    page: pageSafe,
    setPage,
    pageSize,
    total,
    totalPages,
    slice,
    pagerProps: {
      page: pageSafe,
      totalPages,
      total,
      pageSize,
      onPage: setPage,
    },
  };
}
