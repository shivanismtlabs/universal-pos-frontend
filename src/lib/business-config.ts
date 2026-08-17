/**
 * BusinessConfig — FE types + helpers (mirrors backend registry shape).
 * UI should use these helpers instead of if (business === "restaurant").
 */

export type BillingStyle =
  | "counter"
  | "table"
  | "appointment"
  | "rental_checkout";

export type ScreenId =
  | "home"
  | "items"
  | "counter"
  | "orders"
  | "customers"
  | "inventory"
  | "appointments"
  | "reports"
  | "settings";

export type MetaFieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  entity: "item" | "order" | "customer" | "payment" | "inventory";
};

export type BusinessConfig = {
  id: string;
  label: string;
  description: string;
  defaultCommerceModes: string[];
  billing: {
    style: BillingStyle | string;
    allowSplitTender: boolean;
    allowParkCart: boolean;
    requireCustomer: boolean;
  };
  screens: ScreenId[] | string[];
  metaFields: MetaFieldDef[];
  gettingStartedHints?: string[];
};

export type BootstrapBusiness = {
  type: string;
  config: BusinessConfig;
  catalog: Array<{
    id: string;
    label: string;
    description: string;
    defaultCommerceModes: string[];
    billingStyle: string;
    screens: string[];
  }>;
  coreEntities: string[];
  itemMetaFields: MetaFieldDef[];
  orderMetaFields: MetaFieldDef[];
  customerMetaFields: MetaFieldDef[];
  capabilities?: string[];
};

export function fieldsForEntity(
  config: BusinessConfig | null | undefined,
  entity: MetaFieldDef["entity"],
): MetaFieldDef[] {
  if (!config?.metaFields?.length) return [];
  return config.metaFields.filter((f) => f.entity === entity);
}

/** Config-driven screen gate — prefer this over hardcoding routes per industry */
export function screenEnabled(
  config: BusinessConfig | null | undefined,
  screen: ScreenId | string,
): boolean {
  if (!config?.screens?.length) return true;
  return (config.screens as string[]).includes(screen);
}

export function billingRequiresCustomer(
  config: BusinessConfig | null | undefined,
): boolean {
  return Boolean(config?.billing?.requireCustomer);
}

export function billingAllowsPark(
  config: BusinessConfig | null | undefined,
): boolean {
  return config?.billing?.allowParkCart !== false;
}
