"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bookmark, Receipt, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedWorkStore, type LeaveIntent } from "@/lib/unsaved-work-store";

function runIntent(intent: LeaveIntent | null, router: ReturnType<typeof useRouter>) {
  if (!intent) return;
  if (intent.kind === "action") {
    intent.run();
    return;
  }
  router.push(intent.href);
}

/**
 * Confirm Save draft / Leave without saving when Counter (or other screens)
 * have an in-progress ticket.
 */
export function UnsavedWorkGuard() {
  const router = useRouter();
  const open = useUnsavedWorkStore((s) => s.open);
  const summary = useUnsavedWorkStore((s) => s.summary);
  const canSave = useUnsavedWorkStore((s) => s.canSave);
  const saveLabel = useUnsavedWorkStore((s) => s.saveLabel);
  const saving = useUnsavedWorkStore((s) => s.saving);
  const cancel = useUnsavedWorkStore((s) => s.cancel);
  const confirmDiscard = useUnsavedWorkStore((s) => s.confirmDiscard);
  const confirmSave = useUnsavedWorkStore((s) => s.confirmSave);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useUnsavedWorkStore.getState().isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-ticket-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[#d9e0ea] bg-white p-6 shadow-2xl space-y-4"
      >
        {/* Header with Icon and Close Button */}
        <div className="flex items-start gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70 shadow-xs">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="unsaved-ticket-title"
              className="text-base font-semibold text-[#0b1f33]"
            >
              Leave this ticket?
            </h2>
            <p className="mt-0.5 text-xs text-[#5a6b7d] leading-relaxed">
              You have an active sale in progress. Choose an option below before leaving:
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg p-1 text-[#8b9bb0] hover:bg-[#f1f5f9] hover:text-[#0b1f33] transition"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Ticket Summary Badge */}
        {summary ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[#e4e9f0] bg-[#f8fafc] px-3.5 py-2.5 text-xs">
            <Receipt className="size-4 text-[#1a56db] shrink-0" />
            <span className="font-semibold text-[#0b1f33] truncate">
              {summary}
            </span>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {canSave ? (
            <Button
              type="button"
              className="w-full justify-center h-10 bg-[#1a56db] hover:bg-[#1646b3] text-white font-medium text-xs shadow-xs gap-2"
              disabled={saving}
              onClick={() => {
                void confirmSave().then((intent) => runIntent(intent, router));
              }}
            >
              <Bookmark className="size-3.5" />
              {saving ? "Holding ticket…" : `Hold & ${saveLabel}`}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center h-10 border border-[#d9e0ea] text-[#b91c1c] hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 font-medium text-xs gap-2 transition"
            disabled={saving}
            onClick={() => runIntent(confirmDiscard(), router)}
          >
            <Trash2 className="size-3.5" />
            Discard Ticket &amp; Leave
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-center h-9 text-[#5a6b7d] hover:text-[#0b1f33] hover:bg-[#f1f5f9] text-xs font-medium"
            disabled={saving}
            onClick={cancel}
          >
            Stay on Counter
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Use on sidebar / header links: blocks nav when a ticket is in progress. */
export function guardedNavClick(
  e: { preventDefault: () => void },
  href: string,
  onNavigate?: () => void,
) {
  const path = href.split("?")[0] || href;
  if (
    typeof window !== "undefined" &&
    window.location.pathname === path
  ) {
    onNavigate?.();
    return;
  }
  const blocked = useUnsavedWorkStore.getState().requestLeave({
    kind: "href",
    href,
  });
  if (blocked) {
    e.preventDefault();
    return;
  }
  onNavigate?.();
}

/** Wrap org switch / logout / clear actions. */
export function guardedAction(run: () => void) {
  const blocked = useUnsavedWorkStore.getState().requestLeave({
    kind: "action",
    run,
  });
  if (!blocked) run();
}
