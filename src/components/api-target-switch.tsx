"use client";

import { useEffect, useState } from "react";
import {
  API_TARGET_CHANGE_EVENT,
  getApiTarget,
  getApiUrlForTarget,
  setApiTarget,
  type ApiTarget,
} from "@/lib/api-base";

/**
 * Local ↔ Production API switch (login / register).
 * Choice is stored in localStorage so it survives refresh.
 */
export function ApiTargetSwitch({ className }: { className?: string }) {
  const [target, setTarget] = useState<ApiTarget>("local");

  useEffect(() => {
    setTarget(getApiTarget());
    const onChange = () => setTarget(getApiTarget());
    window.addEventListener(API_TARGET_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(API_TARGET_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  function pick(next: ApiTarget) {
    setApiTarget(next);
    setTarget(next);
  }

  const url = getApiUrlForTarget(target);

  return (
    <div
      className={
        className ??
        "rounded-xl border border-[#d9e0ea] bg-[#f7f9fc] px-3 py-2.5"
      }
    >
      <p className="text-[0.7rem] font-medium text-[#5a6b7d]">API server</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {(
          [
            { id: "local" as const, label: "Local" },
            { id: "production" as const, label: "Production" },
          ] as const
        ).map((opt) => {
          const active = target === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => pick(opt.id)}
              className={
                active
                  ? "h-9 rounded-lg bg-[#1a56db] text-[0.8125rem] font-semibold text-white shadow-[0_1px_2px_rgba(26,86,219,0.35)]"
                  : "h-9 rounded-lg border border-[#cfd8e6] bg-white text-[0.8125rem] font-medium text-[#0b1f33] hover:bg-[#e8eefb]"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p
        className="mt-1.5 truncate font-mono text-[0.65rem] text-[#8b9bb0]"
        title={url}
      >
        {url}
      </p>
    </div>
  );
}
