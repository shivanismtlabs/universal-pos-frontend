"use client";

import { useMemo, useState } from "react";

export type ListMeta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export function pagerFromMeta(
  meta: ListMeta | undefined,
  page: number,
  pageSize: number,
  onPage: (next: number) => void,
  fallbackCount = 0,
) {
  const total = meta?.total ?? fallbackCount;
  const totalPages =
    meta?.totalPages ?? Math.max(1, Math.ceil(total / pageSize) || 1);
  return {
    page,
    totalPages,
    total,
    pageSize: meta?.limit ?? pageSize,
    onPage,
  };
}

/** Client-side page slice for list UIs that load a full array. */
export function usePagedList<T>(rows: T[] | undefined | null, pageSize = 20) {
  const list = useMemo(() => rows ?? [], [rows]);
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
