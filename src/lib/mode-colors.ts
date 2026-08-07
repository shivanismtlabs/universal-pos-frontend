/**
 * Mode color map — mirrors registered commerce modes.
 * Add a fifth mode = one entry here (same as commerce-schema.ts).
 */

export type ModeColor = {
  /** Solid accent for badges / borders */
  ink: string;
  /** Soft fill behind badges */
  soft: string;
  /** CSS custom property name for ink */
  cssVar: string;
};

const MODE_COLORS: Record<string, ModeColor> = {
  sale: {
    ink: "#1a56db",
    soft: "#e8eefb",
    cssVar: "--mode-sale",
  },
  rental: {
    ink: "#1e3a5f",
    soft: "#e8eef2",
    cssVar: "--mode-rental",
  },
  service: {
    ink: "#0f766e",
    soft: "#e6f4f2",
    cssVar: "--mode-service",
  },
  subscription: {
    ink: "#6d28d9",
    soft: "#f1eaff",
    cssVar: "--mode-subscription",
  },
  mixed: {
    ink: "#0b1f33",
    soft: "#eef1f5",
    cssVar: "--mode-mixed",
  },
};

const FALLBACK: ModeColor = {
  ink: "#5a6b7d",
  soft: "#eef1f5",
  cssVar: "--mode-fallback",
};

export function getModeColor(mode: string | null | undefined): ModeColor {
  if (!mode) return FALLBACK;
  return MODE_COLORS[mode.toLowerCase()] ?? FALLBACK;
}

export function modeLabel(mode: string | null | undefined): string {
  if (!mode) return "Item";
  const labels: Record<string, string> = {
    sale: "Sale",
    rental: "Rent",
    service: "Service",
    subscription: "Plan",
    mixed: "Mixed",
  };
  return labels[mode.toLowerCase()] ?? mode;
}

export const REGISTERED_MODE_COLORS = MODE_COLORS;
