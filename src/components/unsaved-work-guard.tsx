"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/modal-frame";
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
    <ModalFrame
      title="Leave this ticket?"
      subtitle={
        summary ||
        "You have an open bill. Save it as a draft, or leave without saving."
      }
      onClose={cancel}
      closeOnOutside={false}
      zClass="z-[120]"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={cancel}
          >
            Stay
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 text-[#b91c1c] hover:bg-[#fef2f2]"
            disabled={saving}
            onClick={() => runIntent(confirmDiscard(), router)}
          >
            Leave without saving
          </Button>
          {canSave ? (
            <Button
              type="button"
              className="flex-1"
              disabled={saving}
              onClick={() => {
                void confirmSave().then((intent) => runIntent(intent, router));
              }}
            >
              {saving ? "Saving…" : saveLabel}
            </Button>
          ) : null}
        </div>
      }
    >
      <ul className="space-y-2 text-sm text-[#5a6b7d]">
        <li>
          <span className="font-semibold text-[#0b1f33]">Save draft</span> —
          hold the cart. Open again from Counter → Drafts.
        </li>
        <li>
          <span className="font-semibold text-[#0b1f33]">Leave without saving</span>{" "}
          — discard this ticket.
        </li>
        <li>
          To take only part of the money now, stay here and use{" "}
          <span className="font-medium text-[#0b1f33]">Collect part now</span>{" "}
          or split cash + card.
        </li>
      </ul>
    </ModalFrame>
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
