/** Tenant bootstrap payload from GET /tenants/me/bootstrap */

export type BootstrapModule = {
  code: string;
  name: string;
  description?: string | null;
  dependsOn?: string[];
  isCore?: boolean;
  navSchema?: unknown;
  status: string;
  config?: Record<string, unknown>;
  enabledAt?: string | null;
};

export type BootstrapNavItem = {
  label: string;
  path: string;
  icon?: string;
  module?: string;
};

export type BootstrapTenant = {
  id: string;
  name: string;
  slug: string;
  taxId?: string | null;
  gstin?: string | null;
  currencyCode?: string;
  locale?: string;
  timezone?: string;
  taxMode?: string;
  branding?: {
    productName?: string;
    tagline?: string;
    primaryColor?: string;
    logoUrl?: string;
  } | null;
  settings?: Record<string, unknown> | null;
};

export type TenantBootstrap = {
  tenant: BootstrapTenant;
  group?: {
    id: string;
    name: string;
    role: string;
    entitlements: string[] | unknown;
    tenantCount: number;
    hideLayer: boolean;
  } | null;
  plan: {
    code: string;
    name: string;
    limits?: Record<string, unknown>;
    features?: Record<string, unknown>;
    seatsUsed?: number;
    locationsUsed?: number;
  } | null;
  organizations: Array<{ id: string; name: string; code?: string }>;
  locations: Array<{
    id: string;
    name: string;
    code?: string | null;
    type?: string;
    isActive?: boolean;
  }>;
  modules: BootstrapModule[];
  featureFlags: Array<{ key: string; enabled: boolean }>;
  nav: BootstrapNavItem[];
  capabilities: {
    offlinePos?: boolean;
    whatsapp?: boolean;
    loyalty?: boolean;
    enabled?: string[];
    screens?: string[];
    catalog?: Array<{
      code: string;
      label: string;
      description: string;
    }>;
  };
  commerce?: {
    setupComplete?: boolean;
    modes: string[];
    registeredModes?: string[];
    modeCatalog?: Array<{
      mode: string;
      label: string;
      description: string;
    }>;
    schemas?: Record<string, CommerceSchema>;
    rentalLifecycle?: string[];
  };
  /** Vertical profile — config-driven meta fields + billing (not industry forks) */
  business?: import("./business-config").BootstrapBusiness;
};

export type CommerceField = {
  key: string;
  label: string;
  required: boolean;
  type: string;
  hint?: string;
};

export type CommerceSchema = {
  mode: "sale" | "rental";
  label: string;
  description: string;
  fields: CommerceField[];
  categoryExamples?: string[];
  lifecycle?: string[];
};
