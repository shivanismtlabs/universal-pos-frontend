"use client";

import { Suspense } from "react";
import PosWorkstation from "./pos-workstation";

export default function PosPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[#6b7280]">Opening terminal…</p>}
    >
      <PosWorkstation />
    </Suspense>
  );
}
