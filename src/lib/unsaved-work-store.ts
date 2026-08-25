"use client";

import { create } from "zustand";

export type LeaveIntent =
  | { kind: "href"; href: string }
  | { kind: "action"; run: () => void };

type UnsavedWorkState = {
  isDirty: boolean;
  summary: string;
  canSave: boolean;
  saveLabel: string;
  onSave: (() => Promise<boolean>) | null;
  onDiscard: (() => void) | null;
  intent: LeaveIntent | null;
  open: boolean;
  saving: boolean;
  register: (opts: {
    dirty: boolean;
    summary?: string;
    canSave?: boolean;
    saveLabel?: string;
    onSave?: (() => Promise<boolean>) | null;
    onDiscard?: (() => void) | null;
  }) => void;
  clear: () => void;
  /** Returns true if leave was blocked (dialog shown). */
  requestLeave: (intent: LeaveIntent) => boolean;
  cancel: () => void;
  confirmDiscard: () => LeaveIntent | null;
  confirmSave: () => Promise<LeaveIntent | null>;
};

const empty = {
  isDirty: false,
  summary: "",
  canSave: false,
  saveLabel: "Save draft",
  onSave: null as (() => Promise<boolean>) | null,
  onDiscard: null as (() => void) | null,
  intent: null as LeaveIntent | null,
  open: false,
  saving: false,
};

/**
 * Global “ticket in progress” gate — Counter registers dirty work;
 * App shell asks before nav / switch shop / logout.
 */
export const useUnsavedWorkStore = create<UnsavedWorkState>((set, get) => ({
  ...empty,

  register(opts) {
    set({
      isDirty: opts.dirty,
      summary: opts.summary ?? "",
      canSave: opts.canSave ?? false,
      saveLabel: opts.saveLabel ?? "Save draft",
      onSave: opts.onSave ?? null,
      onDiscard: opts.onDiscard ?? null,
      ...(opts.dirty ? {} : { open: false, intent: null }),
    });
  },

  clear() {
    set({ ...empty });
  },

  requestLeave(intent) {
    if (!get().isDirty) return false;
    set({ intent, open: true });
    return true;
  },

  cancel() {
    set({ open: false, intent: null, saving: false });
  },

  confirmDiscard() {
    const { onDiscard, intent } = get();
    onDiscard?.();
    set({ ...empty });
    return intent;
  },

  async confirmSave() {
    const { onSave, intent, canSave } = get();
    if (!canSave || !onSave) {
      return get().confirmDiscard();
    }
    set({ saving: true });
    try {
      const ok = await onSave();
      if (!ok) {
        set({ saving: false });
        return null;
      }
      set({ ...empty });
      return intent;
    } catch {
      set({ saving: false });
      return null;
    }
  },
}));
