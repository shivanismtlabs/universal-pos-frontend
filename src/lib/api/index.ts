import { apiRequest, ApiError } from "./client";
import { useAuthStore } from "../auth-store";
import type { TenantBootstrap } from "../bootstrap-types";
import {
  parseUnitsFromSettings,
  type MeasureUnitRow,
} from "../measure-units";

function token() {
  return useAuthStore.getState().accessToken;
}

/** Product image helpers: real photo search (Openverse) + optional AI (Pollinations) */
export const aiApi = {
  /** Real Creative Commons photos — use this for catalog realism */
  searchRealProductImage(body: { name: string; hint?: string }) {
    return apiRequest<{
      provider: string;
      prompt: string;
      mime: string;
      bytes: number;
      imageBase64: string;
      sourceUrl?: string;
      attribution?: {
        title?: string;
        license?: string;
        landingUrl?: string | null;
      };
    }>("/ai/product-image/search-real", {
      method: "POST",
      body,
      token: token(),
    });
  },

  generateProductImage(body: { name: string; hint?: string }) {
    return apiRequest<{
      provider: string;
      prompt: string;
      mime: string;
      bytes: number;
      imageBase64: string;
      sourceUrl?: string;
    }>("/ai/product-image", {
      method: "POST",
      body,
      token: token(),
    });
  },

  /** When server cannot reach Pollinations, FE fetches this URL in the browser. */
  productImageFallbackUrl(body: { name: string; hint?: string }) {
    return apiRequest<{ prompt: string; url: string }>(
      "/ai/product-image/fallback-url",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },
};

function stationToken() {
  return useAuthStore.getState().stationToken;
}

function identityToken() {
  return useAuthStore.getState().identityToken;
}

function isMissingRoute(e: unknown) {
  return e instanceof ApiError && (e.status === 404 || e.status === 405);
}

async function persistMeasureUnits(items: MeasureUnitRow[]) {
  await apiRequest("/tenants/me", {
    method: "PATCH",
    body: { settings: { units: items } },
    token: token(),
  });
  return { items: parseUnitsFromSettings({ units: items }) };
}

async function unitsFromTenantMe() {
  const me = await apiRequest<{ settings?: unknown }>("/tenants/me", {
    token: token(),
  });
  return { items: parseUnitsFromSettings(me?.settings) };
}

async function listMeasureUnits() {
  try {
    return await apiRequest<{ items: MeasureUnitRow[] }>(
      "/tenants/me/units",
      { token: token() },
    );
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  try {
    return await apiRequest<{ items: MeasureUnitRow[] }>("/units", {
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  return unitsFromTenantMe();
}

async function createMeasureUnit(body: {
  code: string;
  name: string;
  decimalQty?: boolean;
}) {
  try {
    return await apiRequest("/tenants/me/units", {
      method: "POST",
      body,
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  try {
    return await apiRequest("/units", {
      method: "POST",
      body,
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  const { items } = await unitsFromTenantMe();
  const code = body.code.trim();
  if (items.some((u) => u.code.toLowerCase() === code.toLowerCase())) {
    throw new Error(`Unit "${code}" already exists`);
  }
  items.push({
    code,
    name: body.name.trim(),
    decimalQty: body.decimalQty === true,
    active: true,
    system: false,
  });
  return persistMeasureUnits(items);
}

async function updateMeasureUnit(
  code: string,
  body: { name?: string; decimalQty?: boolean; active?: boolean },
) {
  const enc = encodeURIComponent(code);
  try {
    return await apiRequest(`/tenants/me/units/${enc}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  try {
    return await apiRequest(`/units/${enc}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  const { items } = await unitsFromTenantMe();
  const idx = items.findIndex(
    (u) => u.code.toLowerCase() === code.toLowerCase(),
  );
  if (idx < 0) throw new Error("Unit not found");
  const cur = items[idx]!;
  if (body.active === false && cur.code === "pcs") {
    throw new Error("Piece (pcs) must stay active");
  }
  items[idx] = {
    ...cur,
    name: body.name?.trim() || cur.name,
    decimalQty:
      body.decimalQty === undefined ? cur.decimalQty : body.decimalQty,
    active: body.active === undefined ? cur.active : body.active,
  };
  return persistMeasureUnits(items);
}

async function deleteMeasureUnit(code: string) {
  const enc = encodeURIComponent(code);
  try {
    return await apiRequest(`/tenants/me/units/${enc}`, {
      method: "DELETE",
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  try {
    return await apiRequest(`/units/${enc}`, {
      method: "DELETE",
      token: token(),
    });
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  const { items } = await unitsFromTenantMe();
  const cur = items.find((u) => u.code.toLowerCase() === code.toLowerCase());
  if (!cur) throw new Error("Unit not found");
  if (cur.system) {
    throw new Error("Built-in units cannot be deleted — deactivate them instead");
  }
  return persistMeasureUnits(
    items.filter((u) => u.code.toLowerCase() !== code.toLowerCase()),
  );
}

type AuthUserPayload = {
        id: string;
        email: string;
        fullName: string;
        roles: string[];
  permissions?: string[];
        storeId?: string | null;
  locationId?: string | null;
        tenantId: string;
  pinSet?: boolean;
};

export type PortalSessionResponse = {
  stage?: "select_org" | "app";
  requiresOrganizationSelection?: boolean;
  requires2fa?: boolean;
  totpToken?: string;
  identity?: {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
  };
  organizations?: Array<{
    tenantId: string;
    name: string;
    slug: string;
    currencyCode: string;
    role?: string;
  }>;
  identityToken?: string | null;
  identityRefreshToken?: string | null;
  user?: AuthUserPayload;
  tenant?: { id: string; slug: string; name: string };
  accessToken?: string | null;
  stationToken?: string | null;
  refreshToken?: string | null;
};

export const authApi = {
  login(body: {
    email: string;
    password: string;
    tenantSlug?: string;
  }) {
    return apiRequest<PortalSessionResponse>("/auth/login", {
      method: "POST",
      body,
    });
  },

  login2fa(body: { totpToken: string; code: string }) {
    return apiRequest<PortalSessionResponse>("/auth/login/2fa", {
      method: "POST",
      body,
    });
  },

  signup(body: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    return apiRequest<PortalSessionResponse>("/auth/signup", {
      method: "POST",
      body,
    });
  },

  registerTenant(body: Record<string, unknown>) {
    return apiRequest<{
      tenant: { id: string; slug: string; name: string };
      store: { id: string; name: string };
      user: {
        id: string;
        email: string;
        fullName: string;
        roles?: string[];
        tenantId?: string;
      };
      accessToken: string;
      stationToken: string;
      refreshToken: string;
    }>("/auth/register-tenant", { method: "POST", body });
  },

  googleAuth(body: {
    idToken: string;
    mode?: "login" | "register";
    tenantName?: string;
  }) {
    return apiRequest<PortalSessionResponse>("/auth/google", {
      method: "POST",
      body,
    });
  },

  listOrganizations() {
    return apiRequest<PortalSessionResponse>("/auth/organizations", {
      token: identityToken(),
    });
  },

  createOrganization(body: {
    organizationName: string;
    /** Universal profile: retail | grocery | restaurant | salon | service | other | general */
    businessType: string;
    /** Other profile: custom item field labels → business_configs.item_fields */
    customItemFields?: Array<{ label: string }>;
    /** When type is Other / unlisted — what they call the business */
    businessLabel?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryCode?: string;
    currencyCode?: string;
    locale?: string;
    fiscalYearStart?: string;
    inventoryStartDate?: string;
    taxId?: string;
    storeName?: string;
    tenantSlug?: string;
    email?: string;
    website?: string;
    addressLine2?: string;
    timezone?: string;
    organizationType?: string;
    pan?: string;
  }) {
    return apiRequest<PortalSessionResponse>("/auth/organizations", {
      method: "POST",
      body,
      token: identityToken(),
    });
  },

  selectOrganization(tenantId: string) {
    return apiRequest<PortalSessionResponse>("/auth/select-organization", {
      method: "POST",
      body: { tenantId },
      token: identityToken(),
    });
  },

  registerUser(body: {
    tenantSlug: string;
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    return apiRequest<{
      tenant: { id: string; slug: string; name: string };
      store: { id: string; name: string } | null;
      user: AuthUserPayload;
      accessToken: string;
      stationToken: string;
      refreshToken: string;
    }>("/auth/register-user", { method: "POST", body });
  },

  me() {
    return apiRequest<{
      id: string;
      email: string;
      fullName: string;
      roles: string[];
      permissions?: string[];
      primaryStoreId?: string | null;
      locationId?: string | null;
      storeId?: string | null;
      tenantId?: string;
      tenant?: { id: string; slug: string; name: string };
      pinSet?: boolean;
      pinSwitchEnabled?: boolean;
    }>("/auth/me", { token: token() });
  },

  forgotPassword(email: string) {
    return apiRequest<{
      ok: boolean;
      message: string;
      maskedEmail?: string;
      devCode?: string;
    }>("/auth/password/forgot", {
      method: "POST",
      body: { email },
    });
  },

  resetPassword(body: { email: string; otp: string; newPassword: string }) {
    return apiRequest<{ ok: boolean; message: string }>("/auth/password/reset", {
      method: "POST",
      body,
    });
  },

  forgotPin(userId: string) {
    return apiRequest<{
      ok: boolean;
      message: string;
      maskedEmail?: string;
      devCode?: string;
    }>("/auth/pin/forgot", {
      method: "POST",
      body: { userId },
    });
  },

  resetPinOtp(body: { userId: string; otp: string; newPin: string }) {
    return apiRequest<{ ok: boolean; message: string }>("/auth/pin/reset-otp", {
      method: "POST",
      body,
    });
  },

  logout() {
    const t = token() ?? stationToken();
    return apiRequest<null>("/auth/logout", {
      method: "POST",
      token: t,
    });
  },

  refresh(refreshToken: string) {
    return apiRequest<{
      accessToken: string;
      stationToken: string;
      refreshToken: string;
    }>("/auth/refresh", { method: "POST", body: { refreshToken } });
  },

  setOwnPin(pin: string) {
    return apiRequest<{ pinSet: boolean }>("/auth/pin/set", {
      method: "POST",
      body: { pin },
      token: token(),
    });
  },

  setUserPin(userId: string, pin: string) {
    return apiRequest<{ pinSet: boolean }>(`/auth/pin/set/${userId}`, {
      method: "POST",
      body: { pin },
      token: token(),
    });
  },

  listPinStaff(locationId: string) {
    const t = stationToken() ?? token();
    return apiRequest<
      Array<{
        id: string;
        fullName: string;
        email: string;
        roles: string[];
        pinSet: boolean;
      }>
    >(`/auth/pin/staff?locationId=${encodeURIComponent(locationId)}`, {
      token: t,
    });
  },

  pinLogin(body: { locationId: string; userId: string; pin: string }) {
    return apiRequest<{
      user: AuthUserPayload;
      accessToken: string;
    }>("/auth/pin/login", {
      method: "POST",
      body,
      token: stationToken(),
    });
  },
};

export const customersApi = {
  list(params?: { q?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        fullName: string;
        phone: string;
        email?: string | null;
        eventDate?: string | null;
        notes?: string | null;
        dateOfBirth?: string | null;
        marketingOptIn?: boolean;
        loyaltyPoints?: number;
        storeCreditBalance?: string | number;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/customers${q ? `?${q}` : ""}`, { token: token() });
  },

  create(body: Record<string, unknown>) {
    return apiRequest<{
      id: string;
      fullName: string;
      phone: string;
    }>("/customers", { method: "POST", body, token: token() });
  },

  get(id: string) {
    return apiRequest<{
      id: string;
      fullName: string;
      phone: string;
      email?: string | null;
      notes?: string | null;
      eventDate?: string | null;
      dateOfBirth?: string | null;
      marketingOptIn?: boolean;
      loyaltyPoints?: number;
      storeCreditBalance?: string | number;
      creditLimit?: number | null;
      summary?: {
        orderCount: number;
        openDueCount: number;
        openDueTotal: number;
        loyaltyPoints: number;
        storeCreditBalance: number;
        noteCount: number;
        totalSpent?: number;
        lastVisitAt?: string | null;
        lastVisitOrder?: string | null;
        creditLimit?: number | null;
        availableCredit?: number | null;
        activeMembership?: {
          id: string;
          status: string;
          planName: string;
          productId: string;
          currentPeriodEnd: string;
          price: number;
        } | null;
      };
      partyMemberships?: Array<{
        roleLabel?: string | null;
        party: { id: string; name: string; eventDate?: string | null };
      }>;
    }>(`/customers/${id}`, {
      token: token(),
    });
  },

  listOrders(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        kind: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        discountTotal: number;
        balanceDue: number;
        grandTotal: number;
        currencyCode: string;
        createdAt: string;
      }>;
    }>(`/customers/${customerId}/orders?limit=${limit}`, { token: token() });
  },

  listDues(customerId: string, limit = 50) {
    return apiRequest<{
      totalDue: number;
      items: Array<{
        id: string;
        orderNumber: string;
        kind: string;
        status: string;
        balanceDue: number;
        currencyCode: string;
        createdAt: string;
      }>;
    }>(`/customers/${customerId}/dues?limit=${limit}`, { token: token() });
  },

  listPayments(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        type: string;
        method: string;
        amount: number;
        createdAt: string;
        orderId: string;
        orderNumber: string;
        orderKind: string;
        orderStatus: string;
      }>;
    }>(`/customers/${customerId}/payments?limit=${limit}`, {
      token: token(),
    });
  },

  listMemberships(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        status: string;
        billingPeriodDays: number;
        price: number;
        startsAt: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
        cancelledAt: string | null;
        product: { id: string; name: string; skuCode: string | null };
      }>;
    }>(`/customers/${customerId}/memberships?limit=${limit}`, {
      token: token(),
    });
  },

  listActivity(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        kind: string;
        title: string;
        detail: string | null;
        amount: number | null;
        createdAt: string;
        href?: string | null;
      }>;
    }>(`/customers/${customerId}/activity?limit=${limit}`, {
      token: token(),
    });
  },

  listLoyaltyLedger(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        kind: string;
        points: number;
        balanceAfter: number;
        note?: string | null;
        orderId?: string | null;
        createdAt: string;
      }>;
    }>(`/customers/${customerId}/loyalty-ledger?limit=${limit}`, {
      token: token(),
    });
  },

  listStoreCredit(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        kind: string;
        amount: number;
        balanceAfter: number;
        note?: string | null;
        orderId?: string | null;
        createdAt: string;
        actorName?: string | null;
      }>;
    }>(`/customers/${customerId}/store-credit?limit=${limit}`, {
      token: token(),
    });
  },

  adjustStoreCredit(
    customerId: string,
    body: { amount: number; note?: string },
  ) {
    return apiRequest<{
      customerId: string;
      storeCreditBalance: number;
      amount: number;
      kind: string;
    }>(`/customers/${customerId}/store-credit`, {
      method: "POST",
      body,
      token: token(),
    });
  },

  listNotes(customerId: string, limit = 50) {
    return apiRequest<{
      items: Array<{
        id: string;
        body: string;
        createdAt: string;
        createdByName?: string | null;
      }>;
    }>(`/customers/${customerId}/notes?limit=${limit}`, { token: token() });
  },

  addNote(customerId: string, body: string) {
    return apiRequest<{
      id: string;
      body: string;
      createdAt: string;
      createdByName?: string | null;
    }>(`/customers/${customerId}/notes`, {
      method: "POST",
      body: { body },
      token: token(),
    });
  },

  softDelete(id: string) {
    return apiRequest<{ id: string; deleted: boolean }>(`/customers/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },

  update(id: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(`/customers/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },

  listMeasurements(customerId: string) {
    return apiRequest<
      Array<{
        id: string;
        heightCm?: string | number | null;
        weightKg?: string | number | null;
        chest?: string | number | null;
        waist?: string | number | null;
        inseam?: string | number | null;
        sleeve?: string | number | null;
        shoeSize?: string | null;
        takenAt: string;
      }>
    >(`/customers/${customerId}/measurements`, { token: token() });
  },

  addMeasurement(customerId: string, body: Record<string, unknown>) {
    return apiRequest(`/customers/${customerId}/measurements`, {
      method: "POST",
      body,
      token: token(),
    });
  },

  listParties() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        eventDate?: string | null;
        primaryCustomer?: {
          id: string;
          fullName: string;
          phone: string;
        } | null;
        members?: Array<{
          customerId: string;
          roleLabel?: string | null;
          customer: { id: string; fullName: string; phone: string };
        }> | null;
      }>
    >("/parties", { token: token() });
  },

  createParty(body: Record<string, unknown>) {
    return apiRequest<{ id: string; name: string }>("/parties", {
      method: "POST",
      body,
      token: token(),
    });
  },

  getParty(id: string) {
    return apiRequest<Record<string, unknown>>(`/parties/${id}`, {
      token: token(),
    });
  },

  addPartyMember(partyId: string, body: { customerId: string; roleLabel?: string }) {
    return apiRequest(`/parties/${partyId}/members`, {
      method: "POST",
      body,
      token: token(),
    });
  },

  removePartyMember(partyId: string, customerId: string) {
    return apiRequest(`/parties/${partyId}/members/${customerId}`, {
      method: "DELETE",
      token: token(),
    });
  },
};

export const inventoryApi = {
  listCategories() {
    return apiRequest<Array<{ id: string; name: string }>>("/categories", {
      token: token(),
    });
  },
  createCategory(body: { name: string }) {
    return apiRequest<{ id: string; name: string }>("/categories", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listStyles() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        styleCode?: string;
        skuCode?: string;
        color?: string;
        fulfillmentMode?: string;
        kind?: string;
        basePrice?: string | number;
        trackSerial?: boolean;
        trackQty?: boolean;
        categoryId?: string | null;
        category?: { id: string; name: string } | null;
        meta?: { color?: string } | null;
        photoUrl?: string | null;
        _count?: { stockUnits?: number; stockLevels?: number };
      }>
    >("/product-styles", { token: token() }).then((rows) =>
      rows.map((r) => ({
        ...r,
        styleCode: r.styleCode ?? r.skuCode ?? "",
        color:
          r.color ??
          (typeof r.meta?.color === "string" ? r.meta.color : undefined),
        photoUrl: r.photoUrl ?? null,
      })),
    );
  },
  createStyle(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/product-styles", {
      method: "POST",
      body,
      token: token(),
    });
  },
  async listUnits(params?: {
    page?: number;
    limit?: number;
    barcodeSku?: string;
    storeId?: string;
    availabilityStatus?: string;
    size?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.barcodeSku) qs.set("barcodeSku", params.barcodeSku);
    if (params?.storeId) qs.set("storeId", params.storeId);
    if (params?.availabilityStatus)
      qs.set("availabilityStatus", params.availabilityStatus);
    if (params?.size) qs.set("size", params.size);
    const q = qs.toString();
    const res = await apiRequest<{
      items: Array<{
        id: string;
        barcodeSku: string;
        variantLabel?: string | null;
        size?: string;
        status?: string;
        availabilityStatus?: string;
        condition: string;
        depositAmount: string | number;
        meta?: { rentalPrice?: number | string } | null;
        product?: {
          name: string;
          skuCode?: string;
          basePrice?: string | number;
        };
        productStyle?: { name: string; styleCode: string; color?: string };
        rentalPrice?: string | number;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/inventory-units${q ? `?${q}` : ""}`, { token: token() });

    return {
      ...res,
      items: res.items.map((u) => ({
        id: u.id,
        barcodeSku: u.barcodeSku,
        size: u.variantLabel ?? u.size ?? "",
        availabilityStatus: u.status ?? u.availabilityStatus ?? "available",
        condition: u.condition,
        rentalPrice:
          u.meta?.rentalPrice ??
          u.product?.basePrice ??
          u.rentalPrice ??
          0,
        depositAmount: u.depositAmount,
        productStyle: u.productStyle ??
          (u.product
            ? {
                name: u.product.name,
                styleCode: u.product.skuCode ?? "",
              }
            : undefined),
      })),
    };
  },
  createUnit(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/inventory-units", {
      method: "POST",
      body,
      token: token(),
    });
  },

  availability(params: {
    startDate: string;
    endDate: string;
    productStyleId?: string;
    storeId?: string;
    size?: string;
  }) {
    const qs = new URLSearchParams();
    qs.set("startDate", params.startDate);
    qs.set("endDate", params.endDate);
    if (params.productStyleId) qs.set("productStyleId", params.productStyleId);
    if (params.storeId) qs.set("storeId", params.storeId);
    if (params.size) qs.set("size", params.size);
    return apiRequest<{
      startDate: string;
      endDate: string;
      availableCount: number;
      units: Array<{
        id: string;
        barcodeSku: string;
        size: string;
        availabilityStatus: string;
        rentalPrice: string | number;
        productStyle?: { name: string; styleCode: string };
      }>;
    }>(`/inventory/availability?${qs}`, { token: token() });
  },

  reserve(body: {
    inventoryUnitId: string;
    startDate: string;
    endDate: string;
  }) {
    return apiRequest<{ id: string }>("/inventory/reservations", {
      method: "POST",
      body,
      token: token(),
    });
  },

  releaseReservation(id: string, reason?: string) {
    return apiRequest(`/inventory/reservations/${id}/release`, {
      method: "POST",
      body: reason ? { reason } : {},
      token: token(),
    });
  },

  listRetailSkus(params?: {
    storeId?: string;
    page?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.storeId) qs.set("storeId", params.storeId);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        sku: string;
        qtyOnHand: number;
        sellPrice: string | number;
        productStyle?: { name: string; styleCode: string };
        product?: { id: string; name: string; skuCode?: string };
        store?: { name: string };
        location?: { id: string; name: string; code?: string };
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/retail-skus${q ? `?${q}` : ""}`, { token: token() });
  },

  createRetailSku(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/retail-skus", {
      method: "POST",
      body,
      token: token(),
    });
  },

  listStockAtLocation(locationId: string, q?: string) {
    const qs = new URLSearchParams({ locationId });
    if (q) qs.set("q", q);
    return apiRequest<
      Array<{
        stockLevelId: string;
        productId: string;
        sku: string;
        sellUnit: string;
        qtyOnHand: number;
        sellPrice: string | number;
        name: string;
        productSku: string;
        trackQty: boolean;
        fulfillmentMode?: string;
        photoUrl?: string | null;
      }>
    >(`/stock-levels?${qs}`, { token: token() });
  },

  transferStock(body: {
    fromLocationId: string;
    toLocationId: string;
    notes?: string;
    lines: Array<{ productId: string; qty: number }>;
  }) {
    return apiRequest<{
      id?: string;
      fromLocationId: string;
      toLocationId: string;
      notes: string | null;
      lines: Array<{
        productId: string;
        productName: string;
        sku: string;
        qty: number;
        fromQtyOnHand: number;
        toQtyOnHand: number;
      }>;
    }>("/stock-transfers", { method: "POST", body, token: token() });
  },

  listStockTransfers(params?: { page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        createdAt: string;
        notes?: string | null;
        fromLocationId?: string | null;
        toLocationId?: string | null;
        fromLocationName: string;
        toLocationName: string;
        lineCount: number;
        totalQty: number;
        lines: Array<{
          productId?: string | null;
          productName: string;
          sku: string;
          qty: number;
        }>;
        actorName: string;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/stock-transfers${q ? `?${q}` : ""}`, { token: token() });
  },

  listLevels(params?: {
    locationId?: string;
    q?: string;
    lowStock?: boolean;
    includeZero?: boolean;
    page?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.lowStock) qs.set("lowStock", "true");
    if (params?.includeZero) qs.set("includeZero", "true");
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        stockLevelId: string;
        productId: string;
        locationId: string;
        sku: string;
        name: string;
        productSku: string;
        sellUnit: string;
        qtyOnHand: number;
        qtyDamaged: number;
        sellableQty: number;
        reorderPoint: number | null;
        reorderQty: number | null;
        isLowStock: boolean;
        sellPrice: number;
        location?: { id: string; name: string; type?: string };
        photoUrl?: string | null;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/inventory/levels${q ? `?${q}` : ""}`, { token: token() });
  },

  lowStock(locationId?: string) {
    const qs = locationId ? `?locationId=${locationId}` : "";
    return apiRequest<{
      count: number;
      items: Array<{
        stockLevelId: string;
        name: string;
        sku: string;
        qtyOnHand: number;
        reorderPoint: number | null;
        location?: { name: string };
      }>;
    }>(`/inventory/low-stock${qs}`, { token: token() });
  },

  stockIn(body: {
    locationId: string;
    reason?: string;
    lines: Array<{
      stockLevelId?: string;
      productId?: string;
      qty: number;
      reason?: string;
    }>;
  }) {
    return apiRequest<{ locationId: string; lines: unknown[] }>(
      "/inventory/stock-in",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },

  stockOut(body: {
    locationId: string;
    reason?: string;
    lines: Array<{
      stockLevelId?: string;
      productId?: string;
      qty: number;
      reason?: string;
    }>;
  }) {
    return apiRequest<{ locationId: string; lines: unknown[] }>(
      "/inventory/stock-out",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },

  adjust(body: {
    locationId: string;
    stockLevelId?: string;
    productId?: string;
    delta: number;
    reason?: string;
  }) {
    return apiRequest<{ stockLevelId: string; qtyOnHand: number }>(
      "/inventory/adjust",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },

  markDamaged(body: {
    locationId: string;
    stockLevelId?: string;
    productId?: string;
    qty: number;
    reason?: string;
  }) {
    return apiRequest<{ stockLevelId: string; qtyDamaged: number }>(
      "/inventory/damage",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },

  restoreDamaged(body: {
    locationId: string;
    stockLevelId?: string;
    productId?: string;
    qty: number;
    reason?: string;
  }) {
    return apiRequest<{ stockLevelId: string; qtyDamaged: number }>(
      "/inventory/damage/restore",
      {
        method: "POST",
        body,
        token: token(),
      },
    );
  },

  setReorder(body: {
    locationId: string;
    stockLevelId?: string;
    productId?: string;
    reorderPoint?: number;
    reorderQty?: number;
    sellPrice?: number;
  }) {
    return apiRequest<{ stockLevelId: string; reorderPoint: number | null }>(
      "/inventory/reorder",
      {
        method: "PATCH",
        body,
        token: token(),
      },
    );
  },

  listLedger(params?: {
    locationId?: string;
    productId?: string;
    type?: string;
    limit?: number;
    page?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.productId) qs.set("productId", params.productId);
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.page) qs.set("page", String(params.page));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        type: string;
        qtyDelta: number;
        qtyAfter: number;
        damageDelta: number;
        reason?: string | null;
        createdAt: string;
        product?: { name: string; skuCode: string };
        location?: { name: string };
        actor?: { fullName: string } | null;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/inventory/ledger${q ? `?${q}` : ""}`, { token: token() });
  },

  createCount(body: { locationId: string; notes?: string }) {
    return apiRequest<{
      id: string;
      status: string;
      locationId: string;
      notes?: string | null;
    }>("/inventory/counts", {
      method: "POST",
      body,
      token: token(),
    });
  },

  listCounts(locationId?: string) {
    const qs = locationId ? `?locationId=${locationId}` : "";
    return apiRequest<
      Array<{
        id: string;
        status: string;
        notes?: string | null;
        createdAt: string;
        completedAt?: string | null;
        location?: { name: string };
        lineCount: number;
      }>
    >(`/inventory/counts${qs}`, { token: token() });
  },

  getCount(id: string) {
    return apiRequest<{
      id: string;
      status: string;
      locationId: string;
      lines: Array<{
        id: string;
        stockLevelId: string;
        productId: string;
        systemQty: number;
        countedQty: number | null;
        variance: number | null;
        product?: { name: string; skuCode: string };
        sellUnit: string;
      }>;
    }>(`/inventory/counts/${id}`, { token: token() });
  },

  saveCountLines(
    id: string,
    lines: Array<{ stockLevelId: string; countedQty: number; notes?: string }>,
  ) {
    return apiRequest<{ id: string; status: string }>(
      `/inventory/counts/${id}/lines`,
      {
        method: "POST",
        body: { lines },
        token: token(),
      },
    );
  },

  completeCount(id: string, apply = true) {
    return apiRequest<{ id: string; status: string }>(
      `/inventory/counts/${id}/complete`,
      {
        method: "POST",
        body: { apply },
        token: token(),
      },
    );
  },
};

export const ordersApi = {
  list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    kind?: string;
    q?: string;
    customerId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.q) qs.set("q", params.q);
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        status: string;
        kind?: string;
        meta?: Record<string, unknown> | null;
        balanceDue: string | number;
        subtotal: string | number;
        depositTotal?: string | number;
        customer?: { id?: string; fullName: string; phone: string };
        productSummary?: string;
        productNames?: string[];
        itemCount?: number;
        pickupDate?: string | null;
        returnDueDate?: string | null;
        eventDate?: string | null;
        createdAt?: string;
        rentalExt?: {
          lifecycle: string;
          pickupDate?: string | null;
          returnDueDate?: string | null;
        } | null;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/orders${q ? `?${q}` : ""}`, { token: token() });
  },

  create(body: Record<string, unknown>) {
    return apiRequest<{ id: string; orderNumber: string }>("/orders", {
      method: "POST",
      body,
      token: token(),
    });
  },

  get(id: string) {
    return apiRequest<{
      id: string;
      orderNumber: string;
      status: string;
      kind?: string;
      meta?: Record<string, unknown> | null;
      locationId?: string;
      subtotal: string | number;
      taxTotal: string | number;
      depositTotal: string | number;
      balanceDue: string | number;
      eventDate?: string | null;
      pickupDate?: string | null;
      returnDueDate?: string | null;
      partyId?: string | null;
      customer?: { id: string; fullName: string; phone: string };
      rentalExt?: {
        lifecycle: string;
        eventDate?: string | null;
        pickupDate?: string | null;
        returnDueDate?: string | null;
        partyId?: string | null;
      } | null;
      items: Array<{
        id: string;
        itemType?: string;
        itemKind?: string;
        description?: string | null;
        quantity?: number | string;
        unitPrice: string | number;
        lineTotal?: string | number;
        discount?: string | number;
        taxAmount: string | number;
        size?: string | null;
        inventoryUnitId?: string | null;
        stockUnitId?: string | null;
        stockLevelId?: string | null;
        productId?: string | null;
        product?: {
          id: string;
          name: string;
          skuCode?: string | null;
          taxCode?: string | null;
        } | null;
        inventoryUnit?: {
          id: string;
          barcodeSku: string;
          size: string;
          rentalPrice: string | number;
        } | null;
        stockUnit?: {
          id: string;
          barcodeSku: string;
          variantLabel?: string | null;
        } | null;
        stockLevel?: {
          id: string;
          sku?: string | null;
          product?: {
            id?: string;
            name?: string | null;
            skuCode?: string | null;
            taxCode?: string | null;
          } | null;
        } | null;
        retailSku?: { id: string; sku: string } | null;
        wearer?: { id: string; fullName: string } | null;
      }>;
      payments: Array<{
        id: string;
        amount: string | number;
        method: string;
        status: string;
        type: string;
        createdAt?: string;
      }>;
      createdAt?: string;
      location?: { id: string; name: string; address?: string | null } | null;
      store?: { id: string; name: string; address?: string | null } | null;
    }>(`/orders/${id}`, { token: token() });
  },

  update(id: string, body: Record<string, unknown>) {
    return apiRequest(`/orders/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },

  updateStatus(id: string, status: string) {
    return apiRequest(`/orders/${id}/status`, {
      method: "POST",
      body: { status },
      token: token(),
    });
  },

  changeRentalLifecycle(id: string, lifecycle: string) {
    return apiRequest(`/orders/${id}/rental-lifecycle`, {
      method: "POST",
      body: { lifecycle },
      token: token(),
    });
  },

  addItem(orderId: string, body: Record<string, unknown>) {
    return apiRequest(`/orders/${orderId}/items`, {
      method: "POST",
      body,
      token: token(),
    });
  },

  removeItem(orderId: string, itemId: string) {
    return apiRequest(`/orders/${orderId}/items/${itemId}`, {
      method: "DELETE",
      token: token(),
    });
  },
};

export const resourcesApi = {
  list(params?: {
    page?: number;
    limit?: number;
    type?: string;
    q?: string;
    locationId?: string;
    status?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.type) qs.set("type", params.type);
    if (params?.q) qs.set("q", params.q);
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return apiRequest<{
      data: Array<{
        id: string;
        name: string;
        type: string;
        capacity: number;
        status: string;
        locationId?: string | null;
        meta?: Record<string, unknown> | null;
      }>;
      meta: { page: number; limit: number; total: number; totalPages?: number };
    }>(`/resources${q ? `?${q}` : ""}`, { token: token() });
  },
  create(body: {
    name: string;
    type: string;
    capacity?: number;
    locationId?: string;
    status?: string;
    meta?: Record<string, unknown>;
  }) {
    return apiRequest<{
      id: string;
      name: string;
      type: string;
      capacity: number;
      status: string;
    }>("/resources", { method: "POST", body, token: token() });
  },
  update(id: string, body: Record<string, unknown>) {
    return apiRequest(`/resources/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
};

export const jobsApi = {
  listJobs(params?: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<{
      data: Array<{
        id: string;
        title: string;
        status: string;
        estimatedCost?: number | null;
        customer?: { fullName: string; phone?: string };
        asset?: { id: string; name: string; identifier?: string | null };
      }>;
      meta: { page: number; limit: number; total: number };
    }>(`/jobs${q ? `?${q}` : ""}`, { token: token() });
  },
  createAsset(body: {
    customerId: string;
    name: string;
    assetType: string;
    identifier?: string;
    meta?: Record<string, unknown>;
  }) {
    return apiRequest<{
      id: string;
      name: string;
      assetType: string;
      identifier?: string | null;
    }>("/assets", { method: "POST", body, token: token() });
  },
  createJob(body: {
    customerId: string;
    title: string;
    assetId?: string;
    problem?: string;
    estimatedCost?: number;
    lines?: Array<{
      description: string;
      kind?: string;
      qty?: number;
      unitPrice?: number;
      productId?: string;
    }>;
  }) {
    return apiRequest<{ id: string; title: string; status: string }>("/jobs", {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export const appointmentsApi = {
  list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    from?: string;
    to?: string;
    customerId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        aptType: string;
        status: string;
        startsAt: string;
        endsAt?: string | null;
        fittingNotes?: string | null;
        notes?: string | null;
        meta?: { serviceName?: string } | null;
        customer?: { fullName: string; phone: string };
        store?: { name: string };
        resource?: { id: string; name: string; type: string } | null;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/appointments${q ? `?${q}` : ""}`, { token: token() });
  },

  create(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/appointments", {
      method: "POST",
      body,
      token: token(),
    });
  },

  update(id: string, body: Record<string, unknown>) {
    return apiRequest(`/appointments/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },

  remove(id: string) {
    return apiRequest(`/appointments/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
};

export const returnsApi = {
  list(params?: { page?: number; limit?: number; orderId?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.orderId) qs.set("orderId", params.orderId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        inspectStatus?: string | null;
        cleaningRequired: boolean;
        cleaningCompletedAt?: string | null;
        inspectNotes?: string | null;
        notes?: string | null;
        order?: { orderNumber: string };
        stockUnit?: {
          id: string;
          barcodeSku: string;
          variant?: string | null;
          size?: string | null;
        } | null;
        inventoryUnit?: {
          barcodeSku: string;
          size?: string | null;
          variant?: string | null;
        } | null;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/returns${q ? `?${q}` : ""}`, { token: token() });
  },

  candidates() {
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        lifecycle: string | null;
        customerName: string;
        customerPhone?: string | null;
        unitsOut: Array<{
          stockUnitId: string;
          barcode: string;
          barcodeSku: string;
          variant?: string | null;
          size?: string | null;
          title?: string | null;
          productId?: string | null;
        }>;
      }>;
    }>("/returns/candidates", { token: token() });
  },

  create(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/returns", {
      method: "POST",
      body,
      token: token(),
    });
  },

  inspect(id: string, body: Record<string, unknown>) {
    return apiRequest(`/returns/${id}/inspect`, {
      method: "POST",
      body,
      token: token(),
    });
  },

  completeCleaning(id: string) {
    return apiRequest(`/returns/${id}/cleaning/complete`, {
      method: "POST",
      token: token(),
    });
  },

  settleDeposit(
    orderId: string,
    body: {
      refundAmount: number;
      idempotencyKey: string;
      reason?: string;
    },
  ) {
    return apiRequest<{
      orderId: string;
      held: number;
      refunded: number;
      forfeited: number;
    }>(`/returns/orders/${orderId}/settle-deposit`, {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export const paymentsApi = {
  list(orderId?: string) {
    const q = orderId ? `?orderId=${orderId}` : "";
    return apiRequest<{
      items: Array<{
        id: string;
        amount: string | number;
        method: string;
        status: string;
        type: string;
        paidAt?: string | null;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/payments${q}`, { token: token() });
  },

  create(body: Record<string, unknown>) {
    return apiRequest("/payments", {
      method: "POST",
      body,
      token: token(),
    });
  },

  stripeConfig() {
    return apiRequest<{
      enabled: boolean;
      publishableKey: string | null;
      mode: string;
      webhookConfigured?: boolean;
    }>("/payments/stripe/config", { token: token() });
  },

  methods() {
    return apiRequest<{
      items: Array<{
        method: string;
        displayName: string;
        primary: boolean;
        configured: boolean;
        available: boolean;
        reason?: string;
        requiresProvider: boolean;
        supportsOffline: boolean;
      }>;
    }>("/payments/methods", { token: token() });
  },

  createStripeIntent(body: {
    orderId: string;
    amount: number;
    type?: string;
    method?: string;
    idempotencyKey?: string;
  }) {
    return apiRequest<{
      publishableKey: string;
      clientSecret: string;
      paymentIntentId: string;
      amount: number;
      amountPaise: number;
      currency: string;
      name: string;
      description: string;
      customerName: string;
    }>("/payments/stripe/intent", {
      method: "POST",
      body,
      token: token(),
    });
  },

  verifyStripe(body: {
    orderId: string;
    paymentIntentId: string;
    amount: number;
    type?: string;
    method?: string;
  }) {
    return apiRequest<{
      payment: unknown;
      needsSaleFinalize?: boolean;
      balanceDue?: string | number | null;
    }>("/payments/stripe/verify", {
      method: "POST",
      body,
      token: token(),
    });
  },

  refund(
    paymentId: string,
    body: { amount: number; idempotencyKey: string; reason?: string },
  ) {
    return apiRequest(`/payments/${paymentId}/refund`, {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export const posApi = {
  saleSchema() {
    return apiRequest<{
      mode: "sale";
      label: string;
      description: string;
      fields: Array<{
        key: string;
        label: string;
        required: boolean;
        type: string;
        hint?: string;
      }>;
    }>("/pos/sale/schema", { token: token() });
  },
  /** Schema for any registered commerce mode (sale|rental|service|subscription|…) */
  modeSchema(mode: string) {
    return apiRequest<{
      mode: string;
      label: string;
      description: string;
      fields: Array<{
        key: string;
        label: string;
        required: boolean;
        type: string;
        hint?: string;
      }>;
      categoryExamples?: string[];
      lifecycle?: string[];
    }>(`/pos/${encodeURIComponent(mode)}/schema`, { token: token() });
  },
  saleFloor(locationId?: string) {
    const qs = locationId
      ? `?locationId=${encodeURIComponent(locationId)}`
      : "";
    return apiRequest<{
      schema: {
        mode: "sale";
        fields: Array<{
          key: string;
          label: string;
          required: boolean;
          type: string;
          hint?: string;
        }>;
      };
      locationId: string;
      counts: {
        categories: number;
        products: number;
        stockRows: number;
        inStock: number;
      };
      categories: Array<{ id: string; name: string }>;
      items: Array<{
        id: string;
        productId?: string;
        sku: string;
        sellPrice: string | number;
        qtyOnHand: number;
        name: string;
        category?: { id: string; name: string } | null;
      }>;
    }>(`/pos/sale/floor${qs}`, { token: token() });
  },
  addSaleCategory(body: { name: string; parentId?: string }) {
    return apiRequest<{ id: string; name: string; parentId?: string | null }>(
      "/pos/sale/categories",
      {
      method: "POST",
      body,
      token: token(),
      },
    );
  },
  addSaleProduct(body: {
    title: string;
    description?: string;
    categoryId: string;
    sku: string;
    sellUnit?: "pcs" | "pack" | "kg" | "g" | "L" | "ml";
    price: number;
    qty: number;
    locationId?: string;
    image?: string;
    photoUrl?: string;
    manufacturer?: string;
    barcode?: string;
    costPrice?: number;
    reorderPoint?: number;
    hsnOrSac?: string;
    trackInventory?: boolean;
    itemType?: "goods" | "service";
    itemStructure?: "single" | "variants";
    brand?: string;
    upc?: string;
    ean?: string;
    mpn?: string;
    isbn?: string;
    taxPreference?: "taxable" | "non_taxable";
    taxRatePercent?: number;
    openingStockValue?: number;
    returnable?: boolean;
    batchTracking?: boolean;
    serialTracking?: boolean;
    dimLength?: number;
    dimWidth?: number;
    dimHeight?: number;
    dimUnit?: string;
    weight?: number;
    weightUnit?: string;
    isComposite?: boolean;
    multiUnitBaseQty?: number;
    multiUnitBaseUnit?: string;
    loyaltyPoints?: number;
    perishable?: boolean;
    expiryAutoDiscountDays?: number;
    expiryAutoDiscountPercent?: number;
    modifiers?: string[];
    /** BusinessConfig item_fields → product.meta (ERD extra_fields) */
    extraFields?: Record<string, unknown>;
  }) {
    return apiRequest<{
      mode: "sale";
      fieldsUsed: string[];
      product: {
        id: string;
        title: string;
        sku: string;
        image?: string | null;
        photoUrl?: string | null;
        category?: { id: string; name: string };
      };
      stockLevel: {
        id: string;
        sku: string;
        sellPrice: string | number;
        qtyOnHand: number;
        sellUnit?: string;
      };
      posItem: {
        id: string;
        sku: string;
        name: string;
        sellPrice: string | number;
        qtyOnHand: number;
        sellUnit?: string;
        image?: string | null;
        photoUrl?: string | null;
      };
    }>("/pos/sale/products", {
      method: "POST",
      body,
      token: token(),
    });
  },
  /** Bulk import items (CSV rows) — Universal POS sale catalog */
  importSaleProducts(body: {
    items: Array<{
      title: string;
      sku: string;
      categoryName?: string;
      categoryId?: string;
      sellUnit?: "pcs" | "pack" | "kg" | "g" | "L" | "ml";
      price: number;
      qty?: number;
      description?: string;
      manufacturer?: string;
      barcode?: string;
      costPrice?: number;
      reorderPoint?: number;
      hsnOrSac?: string;
      trackInventory?: boolean;
      image?: string;
      photoUrl?: string;
    }>;
    locationId?: string;
    createCategories?: boolean;
    defaultCategoryId?: string;
  }) {
    return apiRequest<{
      mode: "sale";
      imported: number;
      failed: number;
      created: Array<{ sku: string; title: string; id: string }>;
      errors: Array<{ row: number; sku?: string; message: string }>;
    }>("/pos/sale/products/import", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listSaleProducts(params?: {
    locationId?: string;
    q?: string;
    categoryId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    const q = qs.toString();
    return apiRequest<{
      locationId: string;
      fields: Array<{
        key: string;
        label: string;
        required: boolean;
        type: string;
        hint?: string;
      }>;
      items: Array<{
        id: string;
        productId: string;
        sku: string;
        title: string;
        description?: string | null;
        image?: string | null;
        photoUrl?: string | null;
        images?: string[];
        price: string | number;
        qty: number;
        sellUnit?: string;
        isActive: boolean;
        category?: { id: string; name: string } | null;
      }>;
    }>(`/pos/sale/products${q ? `?${q}` : ""}`, { token: token() });
  },
  getSaleProduct(id: string) {
    return apiRequest<{
      id: string;
      productId: string;
      sku: string;
      title: string;
      description?: string | null;
      image?: string | null;
      photoUrl?: string | null;
      images?: string[];
      price: string | number;
      qty: number;
      sellUnit?: string;
      isActive: boolean;
      category?: { id: string; name: string } | null;
    }>(`/pos/sale/products/${id}`, { token: token() });
  },
  updateSaleProduct(
    id: string,
    body: {
      title?: string;
      description?: string;
      categoryId?: string;
      sellUnit?: "pcs" | "pack" | "kg" | "g" | "L" | "ml";
      price?: number;
      qty?: number;
      isActive?: boolean;
      image?: string;
      photoUrl?: string;
    },
  ) {
    return apiRequest<{
      id: string;
      productId: string;
      sku: string;
      title: string;
      description?: string | null;
      image?: string | null;
      photoUrl?: string | null;
      price: string | number;
      qty: number;
      sellUnit?: string;
      isActive: boolean;
      category?: { id: string; name: string } | null;
    }>(`/pos/sale/products/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  uploadSaleProductImage(id: string, imageBase64: string) {
    return apiRequest<{
      id: string;
      image?: string | null;
      photoUrl?: string | null;
      images?: string[];
      title: string;
    }>(`/pos/sale/products/${id}/image`, {
      method: "POST",
      body: { imageBase64 },
      token: token(),
    });
  },

  removeSaleProductImage(id: string, imageUrl: string) {
    return apiRequest<{
      id: string;
      image?: string | null;
      photoUrl?: string | null;
      images?: string[];
      title: string;
    }>(`/pos/sale/products/${id}/image/remove`, {
      method: "POST",
      body: { imageUrl },
      token: token(),
    });
  },
  uploadRentalProductImage(id: string, imageBase64: string) {
    return apiRequest<{
      id: string;
      image?: string | null;
      photoUrl?: string | null;
      title?: string;
    }>(`/pos/rental/products/${id}/image`, {
      method: "POST",
      body: { imageBase64 },
      token: token(),
    });
  },
  adjustSaleStock(id: string, body: { delta: number; reason?: string }) {
    return apiRequest<{
      id: string;
      sku: string;
      qty: number;
      sellUnit?: string;
      delta: number;
      beforeQty?: number;
      reason?: string | null;
    }>(`/pos/sale/products/${id}/adjust-stock`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  /** Zoho Adjustments history — qty change audit */
  listSaleStockAdjustments(limit?: number) {
    const qs = limit ? `?limit=${limit}` : "";
    return apiRequest<{
      items: Array<{
        id: string;
        createdAt: string;
        stockLevelId?: string | null;
        actorName: string;
        productName: string;
        sku: string;
        beforeQty: number;
        afterQty: number;
        delta: number;
        sellUnit?: string;
        reason?: string | null;
        locationId?: string | null;
      }>;
    }>(`/pos/sale/stock-adjustments${qs}`, { token: token() });
  },
  listSaleCategories() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        parentId?: string | null;
        productCount: number;
      }>
    >("/pos/sale/categories", { token: token() });
  },
  renameSaleCategory(id: string, body: { name: string }) {
    return apiRequest<{ id: string; name: string }>(
      `/pos/sale/categories/${id}`,
      {
        method: "PATCH",
        body,
        token: token(),
      },
    );
  },
  listRecentSales(limit?: number) {
    const qs = limit ? `?limit=${limit}` : "";
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        status: string;
        subtotal: string | number;
        balanceDue: string | number;
        createdAt: string;
        customerName: string;
        itemCount: number;
      }>;
    }>(`/pos/sale/recent${qs}`, { token: token() });
  },
  saleCatalog(params?: {
    locationId?: string;
    q?: string;
    limit?: number;
    page?: number;
    lowStock?: boolean;
    maxQty?: number;
    forPurchase?: boolean;
    categoryId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.lowStock) qs.set("lowStock", "1");
    if (params?.maxQty) qs.set("maxQty", String(params.maxQty));
    if (params?.forPurchase) qs.set("forPurchase", "1");
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    const q = qs.toString();
    return apiRequest<{
      locationId: string;
      lowStock?: boolean;
      maxQty?: number;
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
      items: Array<{
        id: string;
        sku: string;
        sellPrice: string | number;
        costPrice?: number | null;
        qtyOnHand: number;
        sellUnit?: string;
        trackQty?: boolean;
        lowStock?: boolean;
        name: string;
        productSku?: string;
        barcode?: string | null;
        description?: string | null;
        image?: string | null;
        photoUrl?: string | null;
        images?: string[];
        taxCode?: string | null;
        taxRatePercent?: number | null;
        category?: { id: string; name: string } | null;
        kind?: string;
        requiresVariant?: boolean;
        variantOptions?: Array<{
          id: string;
          skuCode: string;
          barcode?: string | null;
          label: string;
        }>;
        requiresBatch?: boolean;
        batchOptions?: Array<{
          id: string;
          batchCode: string;
          qtyOnHand: number;
          expiresAt?: string | null;
        }>;
        requiresSerial?: boolean;
        location?: { id: string; name: string; code?: string | null };
      }>;
    }>(`/pos/sale/catalog${q ? `?${q}` : ""}`, { token: token() });
  },
  saleLookup(sku: string, locationId?: string) {
    const qs = new URLSearchParams({ sku });
    if (locationId) qs.set("locationId", locationId);
    return apiRequest<{
      id: string;
      productId?: string;
      sku: string;
      sellPrice: string | number;
      qtyOnHand: number;
      sellUnit?: string;
      trackQty?: boolean;
      name: string;
      productSku?: string;
      barcode?: string | null;
      image?: string | null;
      photoUrl?: string | null;
      images?: string[];
      taxCode?: string | null;
      taxRatePercent?: number | null;
      category?: { id: string; name: string } | null;
      kind?: string;
      requiresVariant?: boolean;
      variantOptions?: Array<{
        id: string;
        skuCode: string;
        barcode?: string | null;
        label: string;
      }>;
      requiresBatch?: boolean;
      batchOptions?: Array<{
        id: string;
        batchCode: string;
        qtyOnHand: number;
        expiresAt?: string | null;
      }>;
      requiresSerial?: boolean;
    }>(`/pos/sale/lookup?${qs}`, { token: token() });
  },
  saleCheckout(body: {
    locationId: string;
    customerId?: string;
    items: Array<{
      stockLevelId: string;
      quantity: number;
      unitPrice?: number;
      variantId?: string;
      batchId?: string;
      serialNumber?: string;
    }>;
    payments: Array<{
      method: string;
      amount: number;
      idempotencyKey: string;
      type?: string;
      giftCardCode?: string;
      bankReference?: string;
      bankAccountName?: string;
      bankAccountNumber?: string;
      bankIfsc?: string;
      bankName?: string;
      emiTenureMonths?: number;
      emiProvider?: string;
      emiReference?: string;
    }>;
    cashTendered?: number;
    note?: string;
    discountAmount?: number;
    couponCode?: string;
    loyaltyPointsToRedeem?: number;
    allowPartial?: boolean;
    sendReceipt?: boolean;
    sendReceiptChannels?: Array<"email" | "sms" | "whatsapp">;
    meta?: Record<string, unknown>;
  }) {
    return apiRequest<{
      order: {
        id: string;
        orderNumber: string;
        status: string;
        balanceDue: string | number;
      };
      change: string | number;
      cashTendered: string | number | null;
      receipt: ReceiptPayload;
      replayed?: boolean;
      partial?: boolean;
      balanceDue?: string | number;
      loyaltyPointsRedeemed?: number;
      pointsEarned?: number;
    }>("/pos/sale/checkout", {
      method: "POST",
      body,
      token: token(),
    });
  },
  prepareSale(body: {
    locationId: string;
    customerId?: string;
    items: Array<{
      stockLevelId: string;
      quantity: number;
      unitPrice?: number;
      variantId?: string;
      batchId?: string;
      serialNumber?: string;
    }>;
    note?: string;
    discountAmount?: number;
    meta?: Record<string, unknown>;
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      balanceDue: string | number;
      currencyCode: string;
      awaitingStripePayment: boolean;
    }>("/pos/sale/prepare", {
      method: "POST",
      body,
      token: token(),
    });
  },
  cancelPreparedSale(orderId: string) {
    return apiRequest<{ id: string; status: string }>(
      `/pos/sale/prepare/${orderId}/cancel`,
      { method: "POST", token: token() },
    );
  },
  finalizeStripeSale(orderId: string) {
    return apiRequest<ReceiptPayload>(`/pos/sale/prepare/${orderId}/finalize`, {
      method: "POST",
      token: token(),
    });
  },

  parkSale(body: {
    locationId: string;
    customerId?: string;
    items: Array<{
      stockLevelId: string;
      quantity: number;
      unitPrice?: number;
    }>;
    note?: string;
    discountAmount?: number;
    label?: string;
  }) {
    return apiRequest<{
      id: string;
      orderNumber: string;
      balanceDue: string | number;
      label?: string | null;
    }>("/pos/sale/park", { method: "POST", body, token: token() });
  },
  listParkedSales(locationId?: string) {
    const qs = locationId
      ? `?locationId=${encodeURIComponent(locationId)}`
      : "";
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        customerName: string;
        balanceDue: string | number;
        itemCount?: number;
        label?: string | null;
        updatedAt?: string;
      }>;
    }>(`/pos/sale/parked${qs}`, { token: token() });
  },
  resumeParkedSale(orderId: string) {
    return apiRequest<{
      id: string;
      orderNumber: string;
      customerId: string | null;
      locationId: string;
      discountAmount: number;
      note: string | null;
      cart: Array<{
        stockLevelId: string;
        sku: string;
        name: string;
        unitPrice: number;
        qty: number;
        maxQty: number;
        sellUnit?: string;
      }>;
    }>(`/pos/sale/parked/${orderId}/resume`, {
      method: "POST",
      token: token(),
    });
  },
  discardParkedSale(orderId: string) {
    return apiRequest<{ id: string; status: string }>(
      `/pos/sale/parked/${orderId}/discard`,
      { method: "POST", token: token() },
    );
  },
  openRegister(body: { locationId: string; openingFloat?: number }) {
    return apiRequest<{
      id: string;
      locationId: string;
      openingFloat: string | number;
      openedAt: string;
    }>("/pos/sale/register/open", { method: "POST", body, token: token() });
  },
  currentRegister(locationId?: string) {
    const qs = locationId
      ? `?locationId=${encodeURIComponent(locationId)}`
      : "";
    return apiRequest<{
      session: {
        id: string;
        openingFloat: string | number;
        openedAt: string;
      } | null;
      locationId: string;
    }>(`/pos/sale/register/current${qs}`, { token: token() });
  },
  closeRegister(
    id: string,
    body: { closingCash: number; note?: string },
  ) {
    return apiRequest(`/pos/sale/register/${id}/close`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  saleReturn(body: {
    orderId: string;
    items: Array<{
      stockLevelId: string;
      quantity: number;
      condition?: string;
    }>;
    refundMethod: string;
    amount?: number;
    reasonCode: string;
    reason?: string;
    parentPaymentId?: string;
    idempotencyKey: string;
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      refundPaymentId: string | null;
      amount: string | number;
      status?: string;
      returnEventId?: string | null;
      message?: string;
      storeCreditBalance?: number | null;
      restocked: Array<{
        stockLevelId: string;
        quantity: number;
        condition?: string;
      }>;
    }>("/pos/sale/returns", { method: "POST", body, token: token() });
  },
  listSaleReturns(params?: { status?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        status: string;
        statusLabel?: string;
        reasonCode?: string | null;
        notes?: string | null;
        refundAmount: number | null;
        refundMethod?: string | null;
        orderId: string;
        orderNumber?: string;
        customerName?: string | null;
        receivedBy?: string | null;
        approvedBy?: string | null;
        createdAt: string;
        exchangeOrderId?: string | null;
        exchangeOrderNumber?: string | null;
        invoiceNumber?: string | null;
        items?: unknown;
      }>;
    }>(`/pos/sale/returns${q ? `?${q}` : ""}`, { token: token() });
  },
  returnedQuantities(orderId: string) {
    return apiRequest<{
      orderId: string;
      byStockLevelId: Record<string, number>;
      remainingRefundable?: number;
    }>(`/pos/sale/returns/returned-qty/${orderId}`, { token: token() });
  },
  approveSaleReturn(id: string) {
    return apiRequest(`/pos/sale/returns/${id}/approve`, {
      method: "POST",
      token: token(),
    });
  },
  rejectSaleReturn(id: string, reason?: string) {
    return apiRequest(`/pos/sale/returns/${id}/reject`, {
      method: "POST",
      body: { reason },
      token: token(),
    });
  },
  listRefundReasons(appliesTo?: string) {
    const qs = appliesTo
      ? `?appliesTo=${encodeURIComponent(appliesTo)}`
      : "";
    return apiRequest<
      Array<{
        id: string;
        code: string;
        label: string;
        isActive: boolean;
        appliesTo?: string;
      }>
    >(`/pos/refund-reasons${qs}`, { token: token() });
  },
  createRefundReason(body: {
    code: string;
    label: string;
    sortOrder?: number;
    appliesTo?: string;
  }) {
    return apiRequest("/pos/refund-reasons", {
      method: "POST",
      body,
      token: token(),
    });
  },
  seedRefundReasons() {
    return apiRequest("/pos/refund-reasons/seed", {
      method: "POST",
      token: token(),
    });
  },
  saleExchange(body: {
    orderId: string;
    returnItems: Array<{
      stockLevelId: string;
      quantity: number;
      condition?: string;
    }>;
    replaceItems: Array<{
      stockLevelId: string;
      quantity: number;
      unitPrice?: number;
    }>;
    settleMethod: string;
    reasonCode?: string;
    reason?: string;
    idempotencyKey: string;
  }) {
    return apiRequest<{
      return: unknown;
      replacement: {
        orderId: string;
        orderNumber: string;
        invoiceId?: string | null;
        invoiceNumber?: string | null;
        replaceTotal: number;
        returnAmount: number;
        net: number;
        balanceDue: number;
      };
      links?: {
        originalOrderId: string;
        returnEventId: string | null;
        exchangeOrderId: string;
        invoiceId: string | null;
      };
      message: string;
      replayed?: boolean;
    }>("/pos/sale/exchange", { method: "POST", body, token: token() });
  },

  rentalSchema() {
    return apiRequest<{
      mode: "rental";
      label: string;
      description: string;
      fields: Array<{
        key: string;
        label: string;
        required: boolean;
        type: string;
        hint?: string;
      }>;
      ops: string[];
      categoryExamples?: string[];
      lifecycle?: string[];
    }>("/pos/rental/schema", { token: token() });
  },
  rentalFloor(locationId?: string) {
    const qs = locationId
      ? `?locationId=${encodeURIComponent(locationId)}`
      : "";
    return apiRequest<{
      schema: {
        mode: "rental";
        label?: string;
        description?: string;
        fields: Array<{
          key: string;
          label: string;
          required: boolean;
          type: string;
          hint?: string;
        }>;
        ops: string[];
        categoryExamples?: string[];
        lifecycle?: string[];
      };
      locationId: string;
      counts: {
        categories: number;
        products: number;
        units: number;
        available: number;
        checkedOut: number;
      };
      categories: Array<{ id: string; name: string }>;
      units: Array<RentalUnitRow>;
    }>(`/pos/rental/floor${qs}`, { token: token() });
  },
  listRentalCategories() {
    return apiRequest<
      Array<{ id: string; name: string; productCount: number }>
    >("/pos/rental/categories", { token: token() });
  },
  addRentalCategory(body: { name: string }) {
    return apiRequest<{ id: string; name: string }>("/pos/rental/categories", {
      method: "POST",
      body,
      token: token(),
    });
  },
  renameRentalCategory(id: string, body: { name: string }) {
    return apiRequest<{ id: string; name: string }>(
      `/pos/rental/categories/${id}`,
      { method: "PATCH", body, token: token() },
    );
  },
  listRentalProducts(params?: { q?: string; categoryId?: string }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    const q = qs.toString();
    return apiRequest<{
      fields: Array<{
        key: string;
        label: string;
        required: boolean;
        type: string;
        hint?: string;
      }>;
      items: Array<{
        id: string;
        title: string;
        sku: string;
        description?: string | null;
        rentalPrice: string | number;
        deposit: string | number;
        isActive: boolean;
        category?: { id: string; name: string } | null;
        unitCount: number;
        image?: string | null;
        photoUrl?: string | null;
      }>;
    }>(`/pos/rental/products${q ? `?${q}` : ""}`, { token: token() });
  },
  addRentalProduct(body: {
    title: string;
    description?: string;
    categoryId: string;
    sku: string;
    rentalPrice: number;
    deposit?: number;
    barcode: string;
    variant?: string;
    locationId?: string;
  }) {
    return apiRequest<{
      mode: "rental";
      product: { id: string; title: string; sku: string };
      unit: RentalUnitRow;
    }>("/pos/rental/products", { method: "POST", body, token: token() });
  },
  updateRentalProduct(
    id: string,
    body: {
      title?: string;
      description?: string;
      categoryId?: string;
      rentalPrice?: number;
      isActive?: boolean;
    },
  ) {
    return apiRequest(`/pos/rental/products/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  listRentalUnits(params?: {
    locationId?: string;
    q?: string;
    categoryId?: string;
    productId?: string;
    status?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    if (params?.productId) qs.set("productId", params.productId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return apiRequest<{ locationId: string; items: RentalUnitRow[] }>(
      `/pos/rental/units${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  addRentalUnit(body: {
    productId: string;
    barcode: string;
    variant?: string;
    rentalPrice?: number;
    deposit?: number;
    locationId?: string;
  }) {
    return apiRequest<RentalUnitRow>("/pos/rental/units", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateRentalUnit(
    id: string,
    body: {
      variant?: string;
      rentalPrice?: number;
      deposit?: number;
      isActive?: boolean;
    },
  ) {
    return apiRequest<RentalUnitRow>(`/pos/rental/units/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  rentalCatalog(params?: { locationId?: string; q?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{ locationId: string; items: RentalUnitRow[] }>(
      `/pos/rental/catalog${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  rentalLookup(barcode: string, locationId?: string) {
    const qs = new URLSearchParams({ barcode });
    if (locationId) qs.set("locationId", locationId);
    return apiRequest<RentalUnitRow>(`/pos/rental/lookup?${qs}`, {
      token: token(),
    });
  },
  listRecentRentals(limit?: number) {
    const qs = limit ? `?limit=${limit}` : "";
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        status: string;
        lifecycle: string | null;
        subtotal: string | number;
        balanceDue: string | number;
        createdAt: string;
        customerName: string;
        itemCount: number;
      }>;
    }>(`/pos/rental/recent${qs}`, { token: token() });
  },
  rentalExchange(body: {
    orderId: string;
    fromStockUnitId: string;
    toStockUnitId: string;
    reason?: string;
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      fromStockUnitId: string;
      toStockUnitId: string;
      lifecycle: string;
    }>("/pos/rental/exchange", { method: "POST", body, token: token() });
  },

  rentalExtend(body: {
    orderId: string;
    newReturnDueDate: string;
    ratePerDay?: number;
    extensionAmount?: number;
    payment?: {
      method: string;
      amount: number;
      idempotencyKey: string;
      type?: string;
    };
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      previousReturnDueDate: string;
      newReturnDueDate: string;
      extraDays: number;
      extensionFee: number;
      balanceDue: string | number;
    }>("/pos/rental/extend", { method: "POST", body, token: token() });
  },

  checkout(body: {
    orderId: string;
    payments: Array<{
      method: string;
      amount: number;
      idempotencyKey: string;
      type?: string;
    }>;
    markReady?: boolean;
  }) {
    return apiRequest<{
      order: { id: string; status: string };
      payments: unknown[];
    }>("/pos/checkout", {
      method: "POST",
      body,
      token: token(),
    });
  },
  receipt(orderId: string) {
    return apiRequest<ReceiptPayload>(`/pos/orders/${orderId}/receipt`, {
      token: token(),
    });
  },
};

type RentalUnitRow = {
  id: string;
  barcode: string;
  barcodeSku: string;
  variant?: string | null;
  size?: string | null;
  status: string;
  deposit: string | number;
  rentalPrice: string | number;
  productId: string;
  title: string;
  sku: string;
  isActive?: boolean;
  category?: { id: string; name: string } | null;
  image?: string | null;
  photoUrl?: string | null;
};

type ReceiptPayload = {
  orderNumber: string;
  status: string;
  kind?: string;
  currencyCode?: string;
  store: {
    name: string;
    code?: string | null;
    address?: string | null;
    shopName?: string | null;
    taxId?: string | null;
  };
  customer: {
    fullName: string;
    phone: string;
    email?: string | null;
  } | null;
  cashier?: string | null;
  branding?: { productName?: string; tagline?: string };
  receiptFooter?: string;
  items: Array<{
    itemType: string;
    description?: string | null;
    quantity?: string | number;
    unitPrice: string | number;
    lineTotal?: string | number;
    inventoryUnit?: { barcodeSku: string; size?: string | null } | null;
    retailSku?: { sku: string } | null;
    product?: { name: string; skuCode?: string } | null;
  }>;
  totals: {
    subtotal: string | number;
    taxTotal: string | number;
    discountTotal?: string | number;
    depositTotal: string | number;
    balanceDue: string | number;
  };
  payments: Array<{
    method: string;
    type: string;
    amount: string | number;
    paidAt?: string | null;
    createdAt?: string | null;
  }>;
  cashTendered?: string | number | null;
  change?: string | number | null;
  printedAt: string;
};

export const tenantsApi = {
  me() {
    return apiRequest<{
      id: string;
      name: string;
      slug: string;
      gstin?: string | null;
      taxId?: string | null;
      currencyCode?: string;
      locale?: string;
      branding?: Record<string, unknown> | null;
      settings?: Record<string, unknown> | null;
    }>("/tenants/me", { token: token() });
  },
  listStores() {
    return apiRequest<
      Array<{ id: string; name: string; code?: string | null; isMain?: boolean }>
    >("/stores", { token: token() });
  },
  listLocations() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        code?: string | null;
        type?: string;
        isActive?: boolean;
        address?: string | null;
        phone?: string | null;
        email?: string | null;
        businessHours?: string | null;
        timezone?: string | null;
        currencyCode?: string | null;
        managerUserId?: string | null;
        defaultWarehouseId?: string | null;
        parentLocationId?: string | null;
        branchId?: string;
      }>
    >("/locations", { token: token() });
  },
  createLocation(body: {
    name: string;
    code?: string;
    type?: string;
    address?: string;
    phone?: string;
    email?: string;
    businessHours?: string;
    timezone?: string;
    currencyCode?: string;
    managerUserId?: string;
    defaultWarehouseId?: string;
    parentLocationId?: string;
  }) {
    return apiRequest("/locations", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateLocation(
    id: string,
    body: {
      name?: string;
      code?: string;
      type?: string;
      address?: string | null;
      isActive?: boolean;
      phone?: string;
      email?: string;
      businessHours?: string;
      timezone?: string;
      currencyCode?: string;
      managerUserId?: string;
      defaultWarehouseId?: string | null;
      parentLocationId?: string | null;
    },
  ) {
    return apiRequest(`/locations/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  branchDashboard(locationId: string) {
    return apiRequest<{
      branch: { id: string; name: string; code: string };
      today: {
        salesTotal: number;
        orders: number;
        refunds: number;
        expensesTotal: number;
        expensesCount: number;
      };
      inventory: {
        value: number;
        lowStock: number;
        outOfStock: number;
      };
      registerOpen: boolean;
    }>(`/locations/${locationId}/dashboard`, { token: token() });
  },
  multiStoreDashboard() {
    return apiRequest<{
      totalStores: number;
      activeStores: number;
      today: { salesTotal: number; orders: number };
      byBranch: Array<{
        locationId: string;
        name: string;
        code: string;
        todaySales: number;
        todayOrders: number;
      }>;
    }>("/multi-store/dashboard", { token: token() });
  },
  updateMe(body: {
    name?: string;
    currencyCode?: string;
    locale?: string;
    timezone?: string;
    branding?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    taxId?: string;
    gstin?: string;
    taxMode?: string;
    tax?: {
      ratePercent?: number;
      inclusive?: boolean;
      receiptFooter?: string;
    };
    maxCashierDiscountPercent?: number;
    pinSwitchEnabled?: boolean;
    upiVpa?: string;
    upiPayeeName?: string;
  }) {
    return apiRequest("/tenants/me", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  uploadLogo(imageBase64: string) {
    return apiRequest<{ logoUrl: string }>("/tenants/me/logo", {
      method: "POST",
      body: { imageBase64 },
      token: token(),
    });
  },
  removeLogo() {
    return apiRequest<{ logoUrl: null }>("/tenants/me/logo/remove", {
      method: "POST",
      token: token(),
    });
  },
  listUnits() {
    return listMeasureUnits();
  },
  createUnit(body: { code: string; name: string; decimalQty?: boolean }) {
    return createMeasureUnit(body);
  },
  updateUnit(
    code: string,
    body: { name?: string; decimalQty?: boolean; active?: boolean },
  ) {
    return updateMeasureUnit(code, body);
  },
  deleteUnit(code: string) {
    return deleteMeasureUnit(code);
  },
};

export const securityApi = {
  settings() {
    return apiRequest<{
      ipAllowlist: string[];
      idleTimeoutMinutes: number;
      encryptBackups: boolean;
      encryption: {
        passwordsHashed: boolean;
        totpSecretsEncrypted: boolean;
        backupEncryptionAvailable: boolean;
        dedicatedDataKey: boolean;
        note: string;
      };
    }>("/security/settings", { token: token() });
  },
  updateSettings(body: {
    ipAllowlist?: string[];
    idleTimeoutMinutes?: number;
    encryptBackups?: boolean;
  }) {
    return apiRequest("/security/settings", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  auditLogs(params?: {
    q?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.action) q.set("action", params.action);
    if (params?.entityType) q.set("entityType", params.entityType);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        action: string;
        label: string;
        entityType: string;
        entityId?: string | null;
        ip?: string | null;
        createdAt: string;
        actor?: { id: string; name: string; email: string } | null;
      }>;
    }>(`/security/audit-logs${qs ? `?${qs}` : ""}`, { token: token() });
  },
  my2fa() {
    return apiRequest<{ enabled: boolean; enabledAt?: string | null }>(
      "/security/2fa",
      { token: token() },
    );
  },
  setup2fa() {
    return apiRequest<{ secret: string; otpauthUrl: string; qrUrl: string }>(
      "/security/2fa/setup",
      { method: "POST", body: {}, token: token() },
    );
  },
  enable2fa(code: string) {
    return apiRequest<{ enabled: boolean; backupCodes: string[] }>(
      "/security/2fa/enable",
      { method: "POST", body: { code }, token: token() },
    );
  },
  disable2fa(password: string) {
    return apiRequest("/security/2fa/disable", {
      method: "POST",
      body: { password },
      token: token(),
    });
  },
  exportBackup() {
    return apiRequest<Record<string, unknown>>("/security/backup/export", {
      method: "POST",
      body: {},
      token: token(),
    });
  },
  restoreBackup(backup: Record<string, unknown>) {
    return apiRequest<{
      ok: boolean;
      productsUpserted: number;
      customersUpserted: number;
      categoriesUpserted: number;
    }>("/security/backup/restore", {
      method: "POST",
      body: { backup },
      token: token(),
    });
  },
  myIp() {
    return apiRequest<{ ip: string; userAgent?: string | null }>(
      "/security/whoami-ip",
      { token: token() },
    );
  },
};

export const appsApi = {
  bootstrap() {
    return apiRequest<TenantBootstrap>(
      "/tenants/me/bootstrap",
      { token: token() },
    );
  },
  search(q: string, limit = 8) {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return apiRequest<{
      q: string;
      products: Array<{
        id: string;
        name: string;
        sku: string;
        barcode?: string | null;
        price: number;
        kind: string;
        category?: string | null;
        href: string;
      }>;
      customers: Array<{
        id: string;
        fullName: string;
        phone: string;
        email?: string | null;
        dateOfBirth?: string | null;
        marketingOptIn?: boolean;
        href: string;
      }>;
    }>(`/search?${qs}`, { token: token() });
  },
  listModules() {
    return apiRequest<
      Array<{
        code: string;
        name: string;
        status: string;
        dependsOn?: string[];
      }>
    >("/tenants/me/modules", { token: token() });
  },
  enableModule(code: string, config?: Record<string, unknown>) {
    return apiRequest(`/tenants/me/modules/${code}/enable`, {
      method: "POST",
      body: config ? { config } : {},
      token: token(),
    });
  },
  disableModule(code: string) {
    return apiRequest(`/tenants/me/modules/${code}/disable`, {
      method: "POST",
      token: token(),
    });
  },
  listFeatureFlags() {
    return apiRequest<Array<{ key: string; enabled: boolean }>>(
      "/tenants/me/feature-flags",
      { token: token() },
    );
  },
  setFeatureFlag(body: { key: string; enabled: boolean }) {
    return apiRequest("/tenants/me/feature-flags", {
      method: "POST",
      body,
      token: token(),
    });
  },
  setCommerceModes(body: {
    mode?: string;
    modes?: string[];
    shopTitle?: string;
    tagline?: string;
  }) {
    return apiRequest<{
      setupComplete: boolean;
      modes: string[];
      primary?: string;
      schemas: Record<string, unknown>;
      registeredModes?: string[];
      rentalLifecycle?: string[];
    }>("/tenants/me/commerce-modes", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listBusinessConfigs() {
    return apiRequest<{
      catalog: Array<{
        id: string;
        label: string;
        description: string;
        defaultCommerceModes: string[];
        billingStyle: string;
        screens: string[];
      }>;
      coreEntities: string[];
    }>("/commerce/business-configs", { token: token() });
  },
  setBusinessConfig(body: {
    businessType: string;
    applyDefaultModes?: boolean;
    applyDefaultCapabilities?: boolean;
    businessLabel?: string;
  }) {
    return apiRequest<{
      businessType: string;
      config: Record<string, unknown>;
      commerceModes: string[];
      capabilities?: string[];
    }>("/tenants/me/business-config", {
      method: "POST",
      body,
      token: token(),
    });
  },
  setCapabilities(body: { capabilities: string[] }) {
    return apiRequest<{
      capabilities: string[];
      screens: string[];
    }>("/tenants/me/capabilities", {
      method: "POST",
      body,
      token: token(),
    });
  },
  recommendSetup(body: {
    businessType?: string;
    sells?: string[];
    needs?: string[];
  }) {
    return apiRequest<{
      businessType: string;
      label: string;
      commerceModes: string[];
      capabilities: string[];
      screens: string[];
      billingStyle: string;
      gettingStartedHints: string[];
    }>("/commerce/recommend-setup", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listCapabilities() {
    return apiRequest<{
      capabilities: Array<{
        code: string;
        label: string;
        description: string;
      }>;
      codes: string[];
    }>("/commerce/capabilities", { token: token() });
  },
  createCatalogItem(body: {
    mode: string;
    title: string;
    description?: string;
    categoryId: string;
    sku: string;
    locationId?: string;
    price?: number;
    qty?: number;
    rentalPrice?: number;
    deposit?: number;
    barcode?: string;
    size?: string;
    billingPeriod?: number;
    durationMinutes?: number;
  }) {
    return apiRequest<{
      mode: "sale" | "rental" | "service" | "subscription";
      product: {
        id: string;
        title: string;
        sku: string;
        description?: string | null;
        fulfillmentMode?: string;
      };
      stockLevel?: { id: string; qtyOnHand?: number; sellPrice?: string | number };
      unit?: { id: string };
    }>("/catalog/items", {
      method: "POST",
      body,
      token: token(),
    });
  },
  dashboardCatalog() {
    return apiRequest<{
      setupComplete?: boolean;
      modes: Array<"sale" | "rental">;
      primary?: "sale" | "rental" | null;
      fields?: {
        sale: unknown;
        rental: unknown;
        fitMeasurements: Array<{ key: string; label: string }>;
      };
      rentalLifecycle?: string[];
      counts: {
        categories: number;
        products: number;
        saleStockRows: number;
        rentalUnits: number;
        openOrders: number;
      };
      categories: Array<{ id: string; name: string }>;
      products: Array<{
        id: string;
        title: string;
        description?: string | null;
        sku: string;
        mode: string;
        price: string | number;
        category?: { id: string; name: string } | null;
        stockLevels: number;
        stockUnits: number;
      }>;
      openOrders?: Array<{
        id: string;
        orderNumber: string;
        status: string;
        kind: string;
        balanceDue: string | number;
        customer?: {
          id: string;
          fullName: string;
          phone?: string | null;
        } | null;
        lifecycle?: string | null;
        pickupDate?: string | null;
        returnDueDate?: string | null;
      }>;
      recentReturns?: Array<{
        id: string;
        notes?: string | null;
        createdAt: string;
        orderNumber?: string | null;
        barcodeSku?: string | null;
        size?: string | null;
      }>;
    }>("/tenants/me/dashboard-catalog", { token: token() });
  },
};

export type CustomFieldEntityKey =
  | "customer"
  | "product"
  | "order"
  | "service_job"
  | "rental"
  | "subscription";

export const customFieldsApi = {
  listDefinitions(entity?: CustomFieldEntityKey) {
    const q = entity ? `?entity=${encodeURIComponent(entity)}` : "";
    return apiRequest<
      Array<{
        id: string;
        entity: CustomFieldEntityKey;
        fieldKey: string;
        label: string;
        dataType: string;
        required: boolean;
        options?: unknown;
        moduleCode?: string | null;
        sortOrder?: number | null;
      }>
    >(`/custom-fields/definitions${q}`, { token: token() });
  },
  createDefinition(body: {
    entity: CustomFieldEntityKey;
    fieldKey: string;
    label: string;
    dataType: string;
    required?: boolean;
    options?: unknown;
    moduleCode?: string;
    sortOrder?: number;
  }) {
    return apiRequest("/custom-fields/definitions", {
      method: "POST",
      body,
      token: token(),
    });
  },
};

/** Customer memberships (commerce subscription mode — not SaaS /plan) */
export const subscriptionsApi = {
  summary() {
    return apiRequest<{
      plans: number;
      activeMembers: number;
      expired: number;
      cancelled: number;
    }>("/subscriptions/summary", { token: token() });
  },
  listPlans() {
    return apiRequest<{
      items: Array<{
        id: string;
        title: string;
        sku: string;
        description?: string | null;
        price: string | number;
        billingPeriodDays: number;
        isActive: boolean;
        category?: { id: string; name: string } | null;
        activeMembers: number;
      }>;
      counts: { plans: number; activePlans: number };
    }>("/subscriptions/plans", { token: token() });
  },
  createPlan(body: {
    title: string;
    description?: string;
    categoryId: string;
    sku: string;
    price: number;
    billingPeriodDays: number;
  }) {
    return apiRequest("/subscriptions/plans", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updatePlan(
    id: string,
    body: {
      title?: string;
      description?: string;
      price?: number;
      billingPeriodDays?: number;
      isActive?: boolean;
    },
  ) {
    return apiRequest(`/subscriptions/plans/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  list(params?: { status?: string; customerId?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.customerId) qs.set("customerId", params.customerId);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        status: string;
        billingPeriodDays: number;
        price: string | number;
        startsAt: string;
        currentPeriodEnd: string;
        customer: { id: string; fullName: string; phone: string };
        plan: { id: string; title: string; sku: string; price?: string | number };
      }>;
      counts: { active: number; listed: number };
    }>(`/subscriptions${q ? `?${q}` : ""}`, { token: token() });
  },
  enroll(body: {
    customerId: string;
    productId: string;
    paymentMethod?: string;
    idempotencyKey?: string;
  }) {
    return apiRequest<{
      subscription: { id: string; status: string; currentPeriodEnd: string };
      order: { id: string; orderNumber: string };
      payment: { id: string; amount: string | number; method: string };
    }>("/subscriptions/enroll", {
      method: "POST",
      body,
      token: token(),
    });
  },
  renew(id: string, body?: { paymentMethod?: string; idempotencyKey?: string }) {
    return apiRequest(`/subscriptions/${id}/renew`, {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
  cancel(id: string) {
    return apiRequest(`/subscriptions/${id}/cancel`, {
      method: "POST",
      token: token(),
    });
  },
  checkInStatus(id: string) {
    return apiRequest<{
      subscriptionId: string;
      status: string;
      isCheckedIn: boolean;
      customer: { id: string; fullName: string; phone: string; email?: string | null };
      plan: { id: string; title: string; sku: string; price: string | number };
      startsAt: string;
      currentPeriodEnd: string;
      cancelledAt: string | null;
      lastVisitAt: string | null;
      currentSessionStartedAt: string | null;
      history: Array<{ id: string; action: string; at: string; note?: string | null }>;
    }>(`/subscriptions/${id}/check-in`, { token: token() });
  },
  checkIn(id: string, body?: { locationId?: string; note?: string }) {
    return apiRequest(`/subscriptions/${id}/check-in`, {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
  checkOut(id: string, body?: { locationId?: string; note?: string }) {
    return apiRequest(`/subscriptions/${id}/check-out`, {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
};

/** Billable services catalog + charge */
export const servicesCommerceApi = {
  summary() {
    return apiRequest<{ services: number; openAppointments: number }>(
      "/services/summary",
      { token: token() },
    );
  },
  list() {
    return apiRequest<{
      items: Array<{
        id: string;
        title: string;
        sku: string;
        description?: string | null;
        price: string | number;
        durationMinutes?: number | null;
        isActive: boolean;
        category?: { id: string; name: string } | null;
      }>;
      counts: { services: number; active: number };
    }>("/services", { token: token() });
  },
  create(body: {
    title: string;
    description?: string;
    categoryId: string;
    sku: string;
    price: number;
    durationMinutes?: number;
  }) {
    return apiRequest("/services", {
      method: "POST",
      body,
      token: token(),
    });
  },
  setActive(id: string, isActive: boolean) {
    return apiRequest(`/services/${id}/active`, {
      method: "PATCH",
      body: { isActive },
      token: token(),
    });
  },
  bill(body: {
    customerId: string;
    productId: string;
    paymentMethod?: "cash" | "card" | "upi";
    appointmentId?: string;
    idempotencyKey?: string;
  }) {
    return apiRequest<{
      order: { id: string; orderNumber: string };
      payment: { amount: string | number; method: string };
      service: { title: string; price: string | number };
    }>("/services/bill", {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export type DailySalesReport = {
  date: string;
  timezone: string;
  currencyCode: string;
  businessType: string;
  summary: {
    orderCount: number;
    grossSales: number;
    discounts: number;
    tax: number;
    netSales: number;
    refunds: number;
    netRevenue: number;
    avgOrderValue: number;
  };
  comparison: {
    previousDay: {
      date: string;
      netRevenue: number;
      orderCount: number;
      changePct: number | null;
    };
    sameDayLastWeek: {
      date: string;
      netRevenue: number;
      orderCount: number;
      changePct: number | null;
    };
  };
  hourly: Array<{
    hour: number;
    label: string;
    sales: number;
    orders: number;
  }>;
  byPaymentMethod: Array<{
    method: string;
    amount: number;
    count: number;
    pct: number;
  }>;
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    qty: number;
    revenue: number;
  }>;
  topProducts: Array<{
    productId: string | null;
    name: string;
    sku: string;
    qty: number;
    revenue: number;
  }>;
  registerReconciliation: Array<{
    id: string;
    locationName: string;
    openedBy: string;
    openedAt: string;
    closedAt: string | null;
    openingFloat: number;
    closingCash: number | null;
    expectedCash: number;
    variance: number | null;
    status: string;
  }>;
  variations: {
    channelSplit: Array<{ key: string; count: number; sales: number }>;
    fulfillmentSplit: Array<{ key: string; count: number; sales: number }>;
    tableTurnover: number | null;
    avgDiningMinutes: number | null;
    appointments: {
      completed: number;
      noShows: number;
      scheduled: number;
      checkedIn: number;
      cancelled: number;
    };
  };
  transactions: {
    page: number;
    pageSize: number;
    total: number;
    items: Array<{
      id: string;
      orderNumber: string;
      kind: string;
      status: string;
      createdAt: string;
      customerName: string;
      cashierName: string;
      locationName: string;
      subtotal: number;
      discountTotal: number;
      taxTotal: number;
      net: number;
      balanceDue: number;
      paymentMethods: string[];
    }>;
  };
  registerSessions: Array<{
    id: string;
    label: string;
    locationId: string;
    openedAt: string;
    closedAt: string | null;
  }>;
};

export type TopSellingRankBy = "revenue" | "units" | "margin" | "orders";

export type TopSellingProductRow = {
  rank?: number;
  productId: string | null;
  key: string;
  name: string;
  sku: string;
  categoryId: string | null;
  categoryName: string | null;
  itemKind: string;
  unitsSold: number;
  grossRevenue: number;
  profitContribution: number;
  profitMarginPct: number;
  orderCount: number;
  pctOfTotalSales: number;
  trend: {
    direction: "up" | "down" | "flat";
    changePct: number | null;
    prevRevenue: number;
    prevUnits: number;
  };
  frequentlyBoughtWith: Array<{
    productId: string | null;
    key: string;
    name: string;
    sku: string;
    coOrderCount: number;
    strengthPct: number;
  }>;
};

export type TopSellingProductsReport = {
  title: string;
  businessType: string;
  tenantName: string;
  timezone: string;
  currencyCode: string;
  period: {
    from: string;
    to: string;
    days: number;
    prevFrom: string;
    prevTo: string;
  };
  filters: {
    locationId: string | null;
    categoryId: string | null;
    mealPeriod: string;
    rankBy: TopSellingRankBy;
    topN: number;
    includeCrossSell: boolean;
  };
  labels: {
    units: string;
    orders: string;
    revenue: string;
    profit: string;
    entity: string;
  };
  showMealPeriod: boolean;
  emphasizeMargin: boolean;
  totals: {
    grossRevenue: number;
    unitsSold: number;
    profitContribution: number;
    orderCount: number;
    productCount: number;
  };
  pool: TopSellingProductRow[];
  items: Array<TopSellingProductRow & { rank: number }>;
  chart: Array<{
    rank: number;
    name: string;
    sku: string;
    revenue: number;
    units: number;
    marginPct: number;
    profit: number;
    orders: number;
  }>;
};

export type ProfitAndLossReport = {
  tenantName: string;
  timezone: string;
  currencyCode: string;
  businessType: string;
  costingMethod: string;
  costingNote: string;
  period: {
    from: string;
    to: string;
    preset: string;
    locationIds: string[];
  };
  current: {
    grossSales: number;
    returnsRefunds: number;
    discounts: number;
    netSales: number;
    cogs: number;
    costOfService: number;
    totalDirectCost: number;
    grossProfit: number;
    grossMarginPct: number | null;
    operatingExpenses: number;
    expensesByCategory: Array<{
      categoryId: string | null;
      name: string;
      amount: number;
    }>;
    operatingProfit: number;
    taxCollected: number;
    taxExpense: number;
    netProfit: number;
    netMarginPct: number | null;
  };
  previous: {
    from: string;
    to: string;
    netSales: number;
    grossProfit: number;
    operatingExpenses: number;
    netProfit: number;
  } | null;
  comparison: {
    netSalesPct: number | null;
    grossProfitPct: number | null;
    netProfitPct: number | null;
    opexPct: number | null;
  } | null;
  statement: Array<{
    key: string;
    label: string;
    amount: number | null;
    indent: number;
    bold?: boolean;
    section?: boolean;
    pct?: number | null;
  }>;
  waterfall: Array<{ key: string; label: string; value: number }>;
};

export type InventoryReportParams = {
  locationId?: string;
  locationIds?: string[];
  categoryId?: string;
  supplierId?: string;
  productId?: string;
  q?: string;
  from?: string;
  to?: string;
  costingMethod?: "standard" | "weighted_average" | "fifo" | "lifo";
  expiryWindowDays?: 30 | 60 | 90;
  inventoryClass?: "all" | "ingredient" | "finished";
  consolidated?: boolean;
  velocityDays?: number;
  leadTimeDays?: number;
  limit?: number;
};

function inventoryQs(params?: InventoryReportParams) {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.locationIds?.length)
    qs.set("locationIds", params.locationIds.join(","));
  if (params.categoryId) qs.set("categoryId", params.categoryId);
  if (params.supplierId) qs.set("supplierId", params.supplierId);
  if (params.productId) qs.set("productId", params.productId);
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.costingMethod) qs.set("costingMethod", params.costingMethod);
  if (params.expiryWindowDays)
    qs.set("expiryWindowDays", String(params.expiryWindowDays));
  if (params.inventoryClass && params.inventoryClass !== "all")
    qs.set("inventoryClass", params.inventoryClass);
  if (params.consolidated) qs.set("consolidated", "true");
  if (params.velocityDays) qs.set("velocityDays", String(params.velocityDays));
  if (params.leadTimeDays) qs.set("leadTimeDays", String(params.leadTimeDays));
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

export type InventoryStockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type InventoryCurrentStockReport = {
  generatedAt: string;
  timeZone: string;
  currencyCode: string;
  businessType: string;
  consolidated: boolean;
  costingMethod: string;
  summary: {
    skuCount: number;
    totalQty: number;
    totalValue: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  variations?: {
    restaurantIngredientSplit?: boolean;
    byClass?: Array<{
      inventoryClass: string;
      count: number;
      value: number;
    }>;
  };
  items: Array<{
    stockLevelId: string;
    productId: string;
    locationId: string;
    locationName: string;
    item: string;
    sku: string;
    categoryId: string | null;
    category: string | null;
    qtyOnHand: number;
    qtyDamaged: number;
    unitCost: number;
    stockValue: number;
    reorderPoint: number | null;
    reorderQty: number | null;
    status: InventoryStockStatus;
    inventoryClass: string;
    unitOfMeasure: string;
  }>;
};

export type InventoryStockMovementReport = {
  from: string;
  to: string;
  summary: {
    stockIn: number;
    stockOut: number;
    adjustments: number;
    eventCount: number;
  };
  items: Array<{
    id: string;
    at: string;
    type: string;
    direction: string;
    quantity: number;
    runningBalance: number;
    damageDelta: number;
    reason: string | null;
    item: string;
    sku: string | null;
    category: string | null;
    locationName: string;
    actorName: string | null;
  }>;
};

export type InventoryValuationReport = {
  costingMethod: string;
  costingNote: string;
  summary: { totalValue: number; totalQty: number; skuCount: number };
  byCategory: Array<{ key: string; value: number; qty: number; lines: number }>;
  byBranch: Array<{ key: string; value: number; qty: number; lines: number }>;
  items: Array<{
    item: string;
    sku: string;
    category: string | null;
    locationName: string;
    qtyOnHand: number;
    unitCost: number;
    value: number;
  }>;
};

export type InventoryAdjustmentsReport = {
  from: string;
  to: string;
  summary: {
    eventCount: number;
    netQty: number;
    damageQty: number;
    byReason: Array<{ code: string; count: number }>;
  };
  items: Array<{
    id: string;
    at: string;
    type: string;
    reasonCode: string;
    reason: string | null;
    quantity: number;
    damageDelta: number;
    item: string;
    sku: string | null;
    locationName: string;
    approvedBy: string | null;
  }>;
};

export type InventoryReorderReport = {
  velocityDays: number;
  summary: {
    itemCount: number;
    outOfStock: number;
    lowStock: number;
    withSupplier: number;
  };
  items: Array<{
    stockLevelId: string;
    productId: string;
    locationId: string;
    locationName: string;
    item: string;
    sku: string;
    category: string | null;
    qtyOnHand: number;
    reorderPoint: number;
    suggestedQty: number;
    avgDailySales: number;
    leadTimeDays: number;
    status: InventoryStockStatus;
    supplierId: string | null;
    supplierName: string | null;
    unitCost: number | null;
    canCreatePo: boolean;
  }>;
};

export type InventoryExpiryReport = {
  expiryWindowDays: number;
  summary: {
    batchCount: number;
    expired: number;
    critical: number;
    warning: number;
    atRiskValue: number;
  };
  items: Array<{
    batchId: string;
    batchCode: string;
    item: string;
    sku: string | null;
    category: string | null;
    locationName: string;
    expiresAt: string;
    daysLeft: number;
    urgency: "expired" | "critical" | "warning";
    qtyOnHand: number;
    stockValue: number;
  }>;
};

export type SlowMovingStockReport = {
  generatedAt: string;
  timeZone: string;
  currencyCode: string;
  businessType: string;
  title: string;
  labels: {
    entity: string;
    velocity: string;
    actionHint: string;
  };
  inactiveDays: number;
  velocityLookbackDays: number;
  filters: {
    locationId: string | null;
    categoryId: string | null;
    supplierId: string | null;
    minStockValue: number;
    inactiveDays: number;
  };
  summary: {
    itemCount: number;
    totalCapitalLocked: number;
    neverSoldCount: number;
    criticalCount: number;
    highCount: number;
    avgDaysSinceSale: number | null;
  };
  histogram: Array<{
    key: string;
    label: string;
    itemCount: number;
    stockValue: number;
  }>;
  items: Array<{
    productId: string;
    locationId: string;
    locationName: string;
    item: string;
    sku: string;
    categoryId: string | null;
    category: string | null;
    qtyOnHand: number;
    unitCost: number;
    stockValue: number;
    lastSaleDate: string | null;
    daysSinceLastSale: number | null;
    avgMonthlyVelocity: number;
    neverSold: boolean;
    severity: "critical" | "high" | "medium" | "watch";
    suggestedAction: string;
    suggestedActionCode: string;
    supplierId: string | null;
    supplierName: string | null;
  }>;
};

export type CustomerReportsParams = {
  from?: string;
  to?: string;
  locationId?: string;
  customerId?: string;
  rankBy?: "spend" | "visits" | "profit";
  segment?: string;
  minSpend?: number;
  minDue?: number;
  q?: string;
  limit?: number;
};

function customerReportQs(params?: CustomerReportsParams) {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.customerId) qs.set("customerId", params.customerId);
  if (params.rankBy) qs.set("rankBy", params.rankBy);
  if (params.segment) qs.set("segment", params.segment);
  if (params.minSpend != null && params.minSpend > 0)
    qs.set("minSpend", String(params.minSpend));
  if (params.minDue != null && params.minDue > 0)
    qs.set("minDue", String(params.minDue));
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

export type CustomerPurchaseHistoryReport = {
  period: { from: string; to: string };
  customer: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    loyaltyPoints: number;
    storeCreditBalance: number;
    profileHref: string;
  };
  summary: { orderCount: number; totalSpent: number; openDue: number };
  items: Array<{
    orderId: string;
    orderNumber: string;
    date: string;
    status: string;
    branch: string;
    amount: number;
    balanceDue: number;
    paymentMethodLabel: string;
    lineItems: Array<{
      name: string;
      sku: string | null;
      qty: number;
      lineTotal: number;
    }>;
    href: string;
  }>;
};

export type CustomerTopReport = {
  period: { from: string; to: string };
  rankBy: string;
  summary: {
    customerCount: number;
    totalSpend: number;
    totalVisits: number;
    totalProfit: number;
  };
  items: Array<{
    rank: number;
    customerId: string;
    fullName: string;
    phone: string;
    email?: string | null;
    visits: number;
    totalSpend: number;
    profitContributed: number;
    avgTicket: number;
    lastVisit: string | null;
    rfmSegment: string;
    profileHref: string;
  }>;
};

export type CustomerNewVsReturningReport = {
  period: { from: string; to: string };
  summary: {
    newCustomers: number;
    returningCustomers: number;
    totalOrders: number;
    retentionRatePct: number | null;
    retainedFromPrior: number;
    priorActiveCustomers: number;
  };
  series: Array<{
    date: string;
    newCustomers: number;
    returningVisits: number;
  }>;
};

export type CustomerRfmReport = {
  period: { from: string; to: string };
  pie: Array<{ segment: string; customerCount: number; totalSpend: number }>;
  items: Array<{
    customerId: string;
    fullName: string;
    phone: string;
    recencyDays: number;
    frequency: number;
    monetary: number;
    rScore: number;
    fScore: number;
    mScore: number;
    segment: string;
    lastVisit: string | null;
    profileHref: string;
  }>;
};

export type CustomerOutstandingReport = {
  asOf: string;
  summary: {
    customerCount: number;
    totalOutstanding: number;
    criticalCount: number;
  };
  agingBuckets: Array<{
    key: string;
    label: string;
    amount: number;
    severity: string;
  }>;
  items: Array<{
    customerId: string;
    fullName: string;
    phone: string;
    totalDue: number;
    oldestDays: number;
    severity: string;
    buckets: Record<string, number>;
    profileHref: string;
    orders: Array<{
      orderId: string;
      orderNumber: string;
      balanceDue: number;
      daysOverdue: number;
      agingBucket: string;
      branch: string;
      orderDate: string;
    }>;
  }>;
};

export type CustomerLoyaltyReport = {
  period: { from: string; to: string };
  loyaltyEnabled: boolean;
  expireDaysConfigured: number | null;
  summary: {
    customerCount: number;
    pointsEarned: number;
    pointsRedeemed: number;
    pointsOutstanding: number;
    pointsExpiring: number;
  };
  items: Array<{
    customerId: string;
    fullName: string;
    phone: string;
    balance: number;
    earned: number;
    redeemed: number;
    adjusted: number;
    expiringPoints: number;
    profileHref: string;
  }>;
};

export type EmployeeSalesReport = {
  title: string;
  businessType: string;
  period: { from: string; to: string };
  commission: {
    enabled: boolean;
    type: string;
    ratePercent: number;
    note: string;
  };
  summary: {
    staffCount: number;
    totalSales: number;
    totalTransactions: number;
    totalCommission: number;
    totalRefunds: number;
    totalHours: number;
  };
  chart: Array<{
    rank: number;
    name: string;
    sales: number;
    transactions: number;
    salesPerHour: number | null;
  }>;
  leaderboard: Array<{
    rank: number;
    userId: string;
    fullName: string;
    email: string;
    roleLabel: string;
    roles: string[];
    employeeCode: string | null;
    totalSales: number;
    salesInShift: number;
    transactions: number;
    avgTicket: number;
    itemsSold: number;
    upsellRatePct: number;
    commissionEarned: number;
    refundAmount: number;
    refundCount: number;
    voidCount: number;
    hoursWorked: number;
    salesPerHour: number | null;
    tipsEarned: number;
    tipPct: number | null;
    tablesServed: number;
    servicesPerformed: number;
    rebookingRatePct: number | null;
  }>;
  detail: {
    user: { id: string; fullName: string; email: string };
    transactions: Array<{
      orderId: string;
      orderNumber: string;
      date: string;
      status: string;
      branch: string;
      amount: number;
      paymentMethods: string[];
      items: Array<{
        name: string;
        sku: string | null;
        qty: number;
        lineTotal: number;
      }>;
      href: string;
    }>;
  } | null;
};

export type FinanceReportParams = {
  from?: string;
  to?: string;
  locationId?: string;
};

export type TaxReport = {
  generatedAt: string;
  tenantName: string;
  timeZone: string;
  currencyCode: string;
  businessType: string;
  period: { from: string; to: string };
  summary: {
    taxableSales: number;
    outputTax: number;
    invoiceTax: number;
    cgst: number;
    sgst: number;
    igst: number;
    inputTax: number;
    netTaxPayable: number;
    orderCount: number;
    invoiceCount: number;
    purchaseInvoiceCount: number;
  };
  breakdown: Array<{ key: string; label: string; amount: number }>;
  invoices: Array<{
    invoiceNumber: string;
    orderNumber: string | null;
    branch: string | null;
    date: string;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
  }>;
};

export type SupplierReport = {
  generatedAt: string;
  tenantName: string;
  currencyCode: string;
  period: { from: string; to: string };
  summary: {
    supplierCount: number;
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    purchaseTax: number;
    poCount: number;
    paymentsInPeriod: number;
  };
  agingBuckets: Array<{
    key: string;
    label: string;
    amount: number;
    severity: string;
  }>;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    invoiceCount: number;
    billed: number;
    paid: number;
    outstanding: number;
    tax: number;
    poCount: number;
    aging: {
      d0_30: number;
      d30_60: number;
      d60_90: number;
      d90: number;
    };
  }>;
};

export type CashFlowReport = {
  generatedAt: string;
  tenantName: string;
  currencyCode: string;
  period: { from: string; to: string };
  summary: {
    cashIn: number;
    cashOut: number;
    netCash: number;
    customerReceipts: number;
    expenses: number;
    supplierPayments: number;
    refunds: number;
    pettyCash: number;
  };
  operating: Array<{ key: string; label: string; amount: number }>;
  inflowByMethod: Array<{ method: string; amount: number }>;
  series: Array<{
    date: string;
    inflow: number;
    outflow: number;
    net: number;
  }>;
};

export type ExpenseReport = {
  generatedAt: string;
  tenantName: string;
  currencyCode: string;
  period: { from: string; to: string };
  summary: {
    expenseCount: number;
    total: number;
    pettyCash: number;
    categoryCount: number;
  };
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    amount: number;
    count: number;
    pct: number;
  }>;
  series: Array<{ date: string; amount: number }>;
  items: Array<{
    id: string;
    date: string;
    amount: number;
    category: string;
    branch: string | null;
    paymentMethod: string;
    isPettyCash: boolean;
    notes: string | null;
    createdBy: string | null;
  }>;
};

export type DashboardFinanceReport = {
  period: { from: string; to: string };
  tax: {
    outputTax: number;
    inputTax: number;
    netTaxPayable: number;
  };
  cashFlow: {
    cashIn: number;
    cashOut: number;
    netCash: number;
    series: Array<{
      date: string;
      inflow: number;
      outflow: number;
      net: number;
    }>;
  };
  expenses: {
    total: number;
    byCategory: Array<{
      categoryId: string | null;
      name: string;
      amount: number;
      count: number;
      pct: number;
    }>;
  };
  suppliers: {
    outstanding: number;
    agingBuckets: Array<{
      key: string;
      label: string;
      amount: number;
      severity: string;
    }>;
  };
};

export type MonthlySalesReport = {
  period: {
    year: number;
    month: number;
    key: string;
    label: string;
    start: string;
    end: string;
    useFiscal: boolean;
    fiscalStartMonth: number;
  };
  timezone: string;
  currencyCode: string;
  businessType: string;
  tenantName: string;
  summary: {
    revenue: number;
    orderCount: number;
    avgDailySales: number;
    avgOrderValue: number;
    daysInMonth: number;
  };
  comparison: {
    previousMonth: {
      period: string;
      revenue: number;
      orderCount: number;
      changePct: number | null;
    };
    sameMonthLastYear: {
      period: string;
      revenue: number;
      orderCount: number;
      changePct: number | null;
    };
  };
  daily: Array<{
    date: string;
    sales: number;
    orders: number;
    weekday: number;
    isWeekend: boolean;
  }>;
  weeks: Array<{
    week: number;
    label: string;
    from: string;
    to: string;
    sales: number;
    orders: number;
    weekendSales: number;
    weekdaySales: number;
  }>;
  bestDay: {
    date: string;
    sales: number;
    orders: number;
  } | null;
  worstDay: {
    date: string;
    sales: number;
    orders: number;
  } | null;
  target: {
    amount: number | null;
    achieved: number;
    pct: number | null;
  };
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    revenue: number;
    qty: number;
    pct: number;
  }>;
  byBranch: Array<{
    locationId: string;
    name: string;
    revenue: number;
    orders: number;
    pct: number;
  }>;
  customers: {
    newAcquired: number;
    returning: number;
    withOrders: number;
  };
  locations: Array<{ id: string; name: string }>;
  emailSchedule: {
    enabled: boolean;
    recipients: string[];
    lastSentFor?: string | null;
  };
};

export const reportsApi = {
  dailySales(params: {
    date: string;
    locationId?: string;
    employeeId?: string;
    paymentMethod?: string;
    registerSessionId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) {
    const qs = new URLSearchParams();
    qs.set("date", params.date);
    if (params.locationId) qs.set("locationId", params.locationId);
    if (params.employeeId) qs.set("employeeId", params.employeeId);
    if (params.paymentMethod) qs.set("paymentMethod", params.paymentMethod);
    if (params.registerSessionId)
      qs.set("registerSessionId", params.registerSessionId);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params.sortBy) qs.set("sortBy", params.sortBy);
    if (params.sortDir) qs.set("sortDir", params.sortDir);
    return apiRequest<DailySalesReport>(`/reports/daily-sales?${qs}`, {
      token: token(),
    });
  },
  topSellingProducts(params: {
    from?: string;
    to?: string;
    locationId?: string;
    categoryId?: string;
    rankBy?: TopSellingRankBy;
    topN?: 10 | 20 | 50 | 100;
    mealPeriod?: "all" | "breakfast" | "lunch" | "dinner";
    includeCrossSell?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.locationId) qs.set("locationId", params.locationId);
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    if (params.rankBy) qs.set("rankBy", params.rankBy);
    if (params.topN) qs.set("topN", String(params.topN));
    if (params.mealPeriod && params.mealPeriod !== "all")
      qs.set("mealPeriod", params.mealPeriod);
    if (params.includeCrossSell === false) qs.set("includeCrossSell", "false");
    return apiRequest<TopSellingProductsReport>(
      `/reports/top-selling-products?${qs}`,
      { token: token() },
    );
  },
  monthlySales(params: {
    year?: number;
    month?: number;
    useFiscal?: boolean;
    locationIds?: string[];
    categoryId?: string;
    compareTo?: "previous_month" | "same_month_last_year";
  }) {
    const qs = new URLSearchParams();
    if (params.year) qs.set("year", String(params.year));
    if (params.month) qs.set("month", String(params.month));
    if (params.useFiscal) qs.set("useFiscal", "true");
    if (params.locationIds?.length)
      qs.set("locationIds", params.locationIds.join(","));
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    if (params.compareTo) qs.set("compareTo", params.compareTo);
    return apiRequest<MonthlySalesReport>(`/reports/monthly-sales?${qs}`, {
      token: token(),
    });
  },
  getMonthlyEmailSchedule() {
    return apiRequest<{
      enabled: boolean;
      recipients: string[];
      lastSentFor?: string | null;
    }>("/reports/monthly-sales/email-schedule", { token: token() });
  },
  updateMonthlyEmailSchedule(body: {
    enabled?: boolean;
    recipients?: string[];
  }) {
    return apiRequest("/reports/monthly-sales/email-schedule", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  sendMonthlyScheduled(force?: boolean) {
    const q = force ? "?force=true" : "";
    return apiRequest<{
      sent: boolean;
      reason?: string;
      periodKey?: string;
      results?: Array<{ email: string; status: string }>;
    }>(`/reports/monthly-sales/send-scheduled${q}`, {
      method: "POST",
      token: token(),
    });
  },
  upsertMonthlyTarget(body: {
    year: number;
    month: number;
    amount?: number | null;
    setAsDefault?: boolean;
  }) {
    return apiRequest("/reports/monthly-sales/target", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  profitAndLoss(params: {
    from?: string;
    to?: string;
    preset?: string;
    locationIds?: string[];
    compare?: boolean;
    costingMethod?: "standard" | "weighted_average" | "fifo";
  }) {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.preset) qs.set("preset", params.preset);
    if (params.locationIds?.length)
      qs.set("locationIds", params.locationIds.join(","));
    if (params.compare === false) qs.set("compare", "false");
    if (params.compare === true) qs.set("compare", "true");
    if (params.costingMethod) qs.set("costingMethod", params.costingMethod);
    return apiRequest<ProfitAndLossReport>(
      `/reports/profit-and-loss?${qs}`,
      { token: token() },
    );
  },
  inventoryCurrentStock(params?: InventoryReportParams) {
    return apiRequest<InventoryCurrentStockReport>(
      `/reports/inventory/current-stock${inventoryQs(params)}`,
      { token: token() },
    );
  },
  inventoryStockMovement(params?: InventoryReportParams) {
    return apiRequest<InventoryStockMovementReport>(
      `/reports/inventory/stock-movement${inventoryQs(params)}`,
      { token: token() },
    );
  },
  inventoryValuation(params?: InventoryReportParams) {
    return apiRequest<InventoryValuationReport>(
      `/reports/inventory/valuation${inventoryQs(params)}`,
      { token: token() },
    );
  },
  inventoryAdjustments(params?: InventoryReportParams) {
    return apiRequest<InventoryAdjustmentsReport>(
      `/reports/inventory/adjustments${inventoryQs(params)}`,
      { token: token() },
    );
  },
  inventoryReorderSuggestions(params?: InventoryReportParams) {
    return apiRequest<InventoryReorderReport>(
      `/reports/inventory/reorder-suggestions${inventoryQs(params)}`,
      { token: token() },
    );
  },
  inventoryExpiry(params?: InventoryReportParams) {
    return apiRequest<InventoryExpiryReport>(
      `/reports/inventory/expiry${inventoryQs(params)}`,
      { token: token() },
    );
  },
  slowMovingStock(params: {
    inactiveDays?: 30 | 60 | 90;
    locationId?: string;
    categoryId?: string;
    supplierId?: string;
    minStockValue?: number;
    velocityLookbackDays?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.inactiveDays)
      qs.set("inactiveDays", String(params.inactiveDays));
    if (params.locationId) qs.set("locationId", params.locationId);
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    if (params.supplierId) qs.set("supplierId", params.supplierId);
    if (params.minStockValue != null && params.minStockValue > 0)
      qs.set("minStockValue", String(params.minStockValue));
    if (params.velocityLookbackDays)
      qs.set("velocityLookbackDays", String(params.velocityLookbackDays));
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<SlowMovingStockReport>(
      `/reports/inventory/slow-moving${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  customerPurchaseHistory(params: CustomerReportsParams & { customerId: string }) {
    return apiRequest<CustomerPurchaseHistoryReport>(
      `/reports/customers/purchase-history${customerReportQs(params)}`,
      { token: token() },
    );
  },
  customerTop(params?: CustomerReportsParams) {
    return apiRequest<CustomerTopReport>(
      `/reports/customers/top${customerReportQs(params)}`,
      { token: token() },
    );
  },
  customerNewVsReturning(params?: CustomerReportsParams) {
    return apiRequest<CustomerNewVsReturningReport>(
      `/reports/customers/new-vs-returning${customerReportQs(params)}`,
      { token: token() },
    );
  },
  customerRfm(params?: CustomerReportsParams) {
    return apiRequest<CustomerRfmReport>(
      `/reports/customers/rfm${customerReportQs(params)}`,
      { token: token() },
    );
  },
  customerOutstanding(params?: CustomerReportsParams) {
    return apiRequest<CustomerOutstandingReport>(
      `/reports/customers/outstanding${customerReportQs(params)}`,
      { token: token() },
    );
  },
  customerLoyalty(params?: CustomerReportsParams) {
    return apiRequest<CustomerLoyaltyReport>(
      `/reports/customers/loyalty${customerReportQs(params)}`,
      { token: token() },
    );
  },
  employeeSales(params: {
    from?: string;
    to?: string;
    locationId?: string;
    employeeIds?: string[];
    role?: string;
    detailUserId?: string;
    shiftSalesOnly?: boolean;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.locationId) qs.set("locationId", params.locationId);
    if (params.employeeIds?.length)
      qs.set("employeeIds", params.employeeIds.join(","));
    if (params.role) qs.set("role", params.role);
    if (params.detailUserId) qs.set("detailUserId", params.detailUserId);
    if (params.shiftSalesOnly) qs.set("shiftSalesOnly", "true");
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<EmployeeSalesReport>(
      `/reports/employee-sales${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  taxReport(params?: FinanceReportParams) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<TaxReport>(`/reports/tax${q ? `?${q}` : ""}`, {
      token: token(),
    });
  },
  supplierReport(params?: FinanceReportParams) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<SupplierReport>(
      `/reports/suppliers${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  cashFlowReport(params?: FinanceReportParams) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<CashFlowReport>(
      `/reports/cash-flow${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  expenseReport(params?: FinanceReportParams) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<ExpenseReport>(
      `/reports/expenses${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  dashboardFinance(params?: FinanceReportParams) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<DashboardFinanceReport>(
      `/reports/dashboard-finance${q ? `?${q}` : ""}`,
      { token: token() },
    );
  },
  reportPacks() {
    return apiRequest<{
      sale: boolean;
      rental: boolean;
      service: boolean;
      subscription: boolean;
      inventory: boolean;
      kitchen: boolean;
      commerceModes: string[];
    }>("/reports/packs", { token: token() });
  },
  rentalOps(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      from: string | null;
      to: string | null;
      locationId: string | null;
      summary: {
        orderCount: number;
        revenue: number;
        tax: number;
        balanceDue: number;
        overdueCount: number;
        utilizationPct: number | null;
        availableUnits: number;
        unitsOut: number;
        unitsTotal: number;
        openDeposits: number;
        openDepositUnits: number;
        damageEvents: number;
        damageCharges: number;
        cleaningQueue: number;
      };
      byLifecycle: Array<{ lifecycle: string; count: number }>;
      byUnitStatus: Array<{ status: string; count: number }>;
      overdue: Array<{
        orderId: string;
        orderNumber: string;
        customerName: string;
        phone: string | null;
        locationName: string;
        lifecycle: string;
        pickupDate: string | null;
        returnDueDate: string | null;
        balanceDue: number;
      }>;
    }>(`/reports/rental-ops${q ? `?${q}` : ""}`, { token: token() });
  },
  subscriptionsReport(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      from: string | null;
      to: string | null;
      locationId: string | null;
      summary: {
        active: number;
        startedInPeriod: number;
        cancelledInPeriod: number;
        checkInsInPeriod: number;
        monthlyRecurring: number;
        churnPct: number;
      };
      byStatus: Array<{ status: string; count: number; priceSum: number }>;
      upcomingRenewals: Array<{
        id: string;
        planName: string;
        customerName: string;
        phone: string;
        renewsAt: string;
        price: number;
        billingPeriodDays: number;
      }>;
    }>(`/reports/subscriptions${q ? `?${q}` : ""}`, { token: token() });
  },
  listReportSchedules() {
    return apiRequest<{
      schedules: Array<{
        id: string;
        reportKey: string;
        cadence: "daily" | "weekly" | "monthly";
        recipients: string[];
        enabled: boolean;
        lastSentFor: string | null;
      }>;
      availableKeys: string[];
      packs: {
        sale: boolean;
        rental: boolean;
        subscription: boolean;
        inventory: boolean;
      };
    }>("/reports/schedules", { token: token() });
  },
  upsertReportSchedules(items: Array<{
    id?: string;
    reportKey: string;
    cadence: "daily" | "weekly" | "monthly";
    recipients: string[];
    enabled?: boolean;
  }>) {
    return apiRequest("/reports/schedules", {
      method: "PATCH",
      body: { items },
      token: token(),
    });
  },
  sendReportSchedules(force?: boolean) {
    const q = force ? "?force=true" : "";
    return apiRequest<{
      today: string;
      sent: number;
      results: Array<{
        id: string;
        reportKey: string;
        sent: boolean;
        reason?: string;
      }>;
    }>(`/reports/schedules/send${q}`, {
      method: "POST",
      token: token(),
    });
  },
  salesSummary(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      byStatus?: Array<{ status: string; count: number }>;
      byKind?: Array<{
        kind: string;
        count: number;
        subtotal: string | number;
      }>;
      totals?: {
        subtotal?: string | number;
        taxTotal?: string | number;
        balanceDue?: string | number;
        orderCount?: number;
      };
      [key: string]: unknown;
    }>(`/reports/sales-summary${q ? `?${q}` : ""}`, { token: token() });
  },
  paymentsSummary(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      byMethod?: Array<{
        method: string;
        count: number;
        amount: string | number;
      }>;
      [key: string]: unknown;
    }>(`/reports/payments-summary${q ? `?${q}` : ""}`, { token: token() });
  },
  inventoryUtilization(locationId?: string) {
    const qs = new URLSearchParams();
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      byAvailabilityStatus: Array<{
        availabilityStatus: string;
        count: number;
      }>;
      saleStock?: { skuCount: number; qtyOnHand: string | number };
    }>(`/reports/inventory-utilization${q ? `?${q}` : ""}`, {
      token: token(),
    });
  },
  balances(locationId?: string) {
    const qs = new URLSearchParams();
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        status: string;
        balanceDue: string | number;
        pickupDate?: string | null;
        returnDueDate?: string | null;
        customer?: { fullName: string; phone: string };
      }>;
    }>(`/reports/balances${q ? `?${q}` : ""}`, { token: token() });
  },
  productVelocity(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      topMovers: Array<{
        name: string;
        sku: string;
        qty: number;
        revenue: number;
      }>;
      slowMovers: Array<{
        name: string;
        sku: string;
        qty: number;
        revenue: number;
      }>;
    }>(`/reports/product-velocity${q ? `?${q}` : ""}`, { token: token() });
  },
  staffSales(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      staff: Array<{
        userId: string;
        name: string;
        orderCount: number;
        subtotal: number;
        taxTotal: number;
      }>;
    }>(`/reports/staff-sales${q ? `?${q}` : ""}`, { token: token() });
  },
  taxSummary(from?: string, to?: string, locationId?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (locationId) qs.set("locationId", locationId);
    const q = qs.toString();
    return apiRequest<{
      orders: {
        count: number;
        subtotal: string | number;
        taxTotal: string | number;
      };
      invoices: {
        count: number;
        cgst: string | number;
        sgst: string | number;
        igst: string | number;
        grandTotal: string | number;
      };
    }>(`/reports/tax-summary${q ? `?${q}` : ""}`, { token: token() });
  },
};

export type ExpenseCategory = {
  id: string;
  name: string;
  parentId?: string | null;
  isActive?: boolean;
  receiptRequired?: boolean;
  accountCode?: string | null;
  sortOrder?: number;
  parent?: { id: string; name: string } | null;
};

export type ExpenseRow = {
  id: string;
  expenseNumber?: string | null;
  amount: string | number;
  netAmount?: string | number | null;
  taxAmount?: string | number;
  taxRatePercent?: string | number | null;
  spentAt: string;
  paymentMethod: string;
  payee?: string | null;
  reference?: string | null;
  notes?: string | null;
  isPettyCash: boolean;
  isReimbursement?: boolean;
  status: string;
  receiptUrl?: string | null;
  rejectReason?: string | null;
  category?: { id: string; name: string; receiptRequired?: boolean } | null;
  location?: { id: string; name: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  approvedAt?: string | null;
};

export const expensesApi = {
  listCategories(activeOnly?: boolean) {
    const qs = activeOnly ? "?activeOnly=true" : "";
    return apiRequest<ExpenseCategory[]>(`/expenses/categories${qs}`, {
      token: token(),
    });
  },
  createCategory(body: {
    name: string;
    parentId?: string;
    receiptRequired?: boolean;
    accountCode?: string;
    sortOrder?: number;
  }) {
    return apiRequest<ExpenseCategory>("/expenses/categories", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateCategory(
    id: string,
    body: {
      name?: string;
      parentId?: string | null;
      isActive?: boolean;
      receiptRequired?: boolean;
      accountCode?: string | null;
      sortOrder?: number;
    },
  ) {
    return apiRequest<ExpenseCategory>(`/expenses/categories/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  deleteCategory(id: string) {
    return apiRequest(`/expenses/categories/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  seedCategories() {
    return apiRequest<ExpenseCategory[]>("/expenses/categories/seed", {
      method: "POST",
      token: token(),
    });
  },
  summary(params?: { from?: string; to?: string; locationId?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    const q = qs.toString();
    return apiRequest<{
      todayTotal: number;
      monthTotal: number;
      pendingTotal: number;
      approvedTotal: number;
      rejectedTotal: number;
      pettyCashBalance: number;
      byCategory: Array<{ categoryId: string | null; name: string; total: number }>;
      byPaymentMethod: Array<{ method: string; total: number }>;
    }>(`/expenses/summary${q ? `?${q}` : ""}`, { token: token() });
  },
  list(params?: {
    from?: string;
    to?: string;
    locationId?: string;
    categoryId?: string;
    status?: string;
    pettyCash?: boolean;
    page?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    if (params?.status) qs.set("status", params.status);
    if (params?.pettyCash) qs.set("pettyCash", "true");
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: ExpenseRow[];
      total: number;
      count: number;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/expenses${q ? `?${q}` : ""}`, { token: token() });
  },
  get(id: string) {
    return apiRequest<ExpenseRow>(`/expenses/${id}`, { token: token() });
  },
  create(body: {
    amount: number;
    spentAt: string;
    categoryId?: string;
    locationId?: string;
    paymentMethod?: string;
    notes?: string;
    payee?: string;
    reference?: string;
    isPettyCash?: boolean;
    isReimbursement?: boolean;
    taxable?: boolean;
    receiptBase64?: string;
    receiptOverride?: boolean;
    saveAsDraft?: boolean;
    idempotencyKey?: string;
  }) {
    return apiRequest<ExpenseRow>("/expenses", {
      method: "POST",
      body,
      token: token(),
    });
  },
  update(
    id: string,
    body: Record<string, unknown>,
  ) {
    return apiRequest<ExpenseRow>(`/expenses/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  uploadReceipt(id: string, imageBase64: string) {
    return apiRequest<{ id: string; receiptUrl: string }>(
      `/expenses/${id}/receipt`,
      {
        method: "POST",
        body: { imageBase64 },
        token: token(),
      },
    );
  },
  approve(id: string) {
    return apiRequest(`/expenses/${id}/approve`, {
      method: "POST",
      token: token(),
    });
  },
  reject(id: string, reason?: string) {
    return apiRequest(`/expenses/${id}/reject`, {
      method: "POST",
      body: { reason },
      token: token(),
    });
  },
  void(id: string) {
    return apiRequest(`/expenses/${id}/void`, {
      method: "POST",
      token: token(),
    });
  },
  remove(id: string) {
    return apiRequest(`/expenses/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  pettyCash(locationId?: string) {
    const qs = locationId
      ? `?locationId=${encodeURIComponent(locationId)}`
      : "";
    return apiRequest<{
      id: string;
      name: string;
      balance: number;
      locationId?: string | null;
    }>(`/expenses/petty-cash${qs}`, { token: token() });
  },
  pettyCashLedger(params?: { locationId?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        kind: string;
        direction: string;
        amount: number;
        balanceAfter: number;
        reference?: string | null;
        notes?: string | null;
        expenseId?: string | null;
        createdAt: string;
      }>;
    }>(`/expenses/petty-cash/ledger${q ? `?${q}` : ""}`, { token: token() });
  },
  pettyCashOpening(body: {
    amount: number;
    locationId?: string;
    notes?: string;
  }) {
    return apiRequest("/expenses/petty-cash/opening", {
      method: "POST",
      body,
      token: token(),
    });
  },
  pettyCashReplenish(body: {
    amount: number;
    locationId?: string;
    reference?: string;
    notes?: string;
    paymentMethod?: string;
  }) {
    return apiRequest("/expenses/petty-cash/replenish", {
      method: "POST",
      body,
      token: token(),
    });
  },
  pettyCashAdjust(body: {
    amount: number;
    direction: "credit" | "debit";
    notes: string;
    locationId?: string;
  }) {
    return apiRequest("/expenses/petty-cash/adjust", {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export const loyaltyApi = {
  listCoupons() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        description?: string | null;
        discountType: string;
        discountValue: string | number;
        isActive: boolean;
        redemptionCount: number;
        maxRedemptions?: number | null;
      }>
    >("/loyalty/coupons", { token: token() });
  },
  createCoupon(body: {
    code: string;
    description?: string;
    discountType: "percent" | "fixed";
    discountValue: number;
    minOrderAmount?: number;
    maxRedemptions?: number;
  }) {
    return apiRequest("/loyalty/coupons", {
      method: "POST",
      body,
      token: token(),
    });
  },
  patchCoupon(id: string, body: { isActive?: boolean; description?: string }) {
    return apiRequest(`/loyalty/coupons/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  validateCoupon(code: string, orderSubtotal: number) {
    return apiRequest<{
      couponId: string;
      code: string;
      amountOff: number;
      discountType: string;
      discountValue: number;
    }>("/loyalty/coupons/validate", {
      method: "POST",
      body: { code, orderSubtotal },
      token: token(),
    });
  },
  getSettings() {
    return apiRequest<{
      enabled: boolean;
      earnPerCurrency: number;
      currencyPerPoint: number;
    }>("/loyalty/settings", { token: token() });
  },
  patchSettings(body: {
    enabled?: boolean;
    earnPerCurrency?: number;
    currencyPerPoint?: number;
  }) {
    return apiRequest("/loyalty/settings", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  quotePoints(customerId: string, points: number, maxAmount?: number) {
    return apiRequest<{
      customerId: string;
      pointsAvailable: number;
      points: number;
      amountOff: number;
      currencyPerPoint: number;
    }>("/loyalty/points/quote", {
      method: "POST",
      body: { customerId, points, maxAmount },
      token: token(),
    });
  },
  listLedger(params?: { kind?: "earn" | "redeem" | "adjust"; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        kind: string;
        points: number;
        balanceAfter: number;
        orderId?: string | null;
        note?: string | null;
        createdAt: string;
        customer: {
          id: string;
          fullName: string;
          phone?: string | null;
        };
      }>;
    }>(`/loyalty/ledger${q ? `?${q}` : ""}`, { token: token() });
  },
  listGiftCards() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        initialValue: string | number;
        balance: string | number;
        status: string;
        expiresAt?: string | null;
        customer?: { id: string; fullName: string; phone: string } | null;
      }>
    >("/loyalty/gift-cards", { token: token() });
  },
  issueGiftCard(body: {
    code?: string;
    initialValue: number;
    customerId?: string;
    expiresAt?: string;
    note?: string;
  }) {
    return apiRequest("/loyalty/gift-cards", {
      method: "POST",
      body,
      token: token(),
    });
  },
  lookupGiftCard(code: string) {
    return apiRequest<{
      id: string;
      code: string;
      balance: string | number;
      status: string;
      expiresAt?: string | null;
    }>("/loyalty/gift-cards/lookup", {
      method: "POST",
      body: { code },
      token: token(),
    });
  },
  patchGiftCard(id: string, body: { status?: "active" | "disabled"; note?: string }) {
    return apiRequest(`/loyalty/gift-cards/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
};

export const healthApi = {
  check() {
    return apiRequest<{ status: string; service: string }>("/health");
  },
};

export const notifyApi = {
  config() {
    return apiRequest<{
      bsp: string;
      configured: boolean;
      mock: boolean;
      source: string | null;
      appName: string;
      ready: boolean;
      channels?: {
        whatsapp: boolean;
        sms: boolean;
        email: boolean;
        emailMode?: string;
        smsMode?: string;
        note?: string;
      };
      birthdayReminders?: {
        optional: boolean;
        requiresMarketingOptIn: boolean;
        templateKey: string;
      };
    }>("/notify/config", { token: token() });
  },

  inbox(params?: {
    status?: string;
    type?: string;
    locationId?: string;
    limit?: number;
    page?: number;
  }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.type) q.set("type", params.type);
    if (params?.locationId) q.set("locationId", params.locationId);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.page) q.set("page", String(params.page));
    const qs = q.toString();
    return apiRequest<{
      unreadCount: number;
      items: Array<{
        id: string;
        type: string;
        severity: string;
        status: string;
        title: string;
        body: string;
        href?: string | null;
        locationId?: string | null;
        location?: { id: string; name: string; code: string } | null;
        payload?: Record<string, unknown>;
        createdAt: string;
        readAt?: string | null;
        resolvedAt?: string | null;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/notify/inbox${qs ? `?${qs}` : ""}`, { token: token() });
  },

  unreadCount() {
    return apiRequest<{ unreadCount: number }>("/notify/inbox/unread-count", {
      token: token(),
    });
  },

  scanDuePayments() {
    return apiRequest<{ ok?: boolean; skipped?: boolean }>("/notify/due-scan", {
      method: "POST",
      token: token(),
    });
  },

  markRead(id: string) {
    return apiRequest(`/notify/inbox/${id}/read`, {
      method: "PATCH",
      token: token(),
    });
  },

  markAllRead() {
    return apiRequest<{ updated: number }>("/notify/inbox/mark-all-read", {
      method: "POST",
      body: {},
      token: token(),
    });
  },

  tenantNotificationSettings() {
    return apiRequest<{
      types: Array<{
        code: string;
        label: string;
        description: string;
        urgent: boolean;
        enabled: boolean;
        recipientRoles: string[];
        digestMinutes: number;
        reAlertHours: number;
      }>;
    }>("/notify/settings/types", { token: token() });
  },

  updateTenantNotificationSettings(types: Array<{ code: string; enabled: boolean }>) {
    return apiRequest("/notify/settings/types", {
      method: "PATCH",
      body: { types },
      token: token(),
    });
  },

  myNotificationPrefs() {
    return apiRequest<
      Array<{
        type: string;
        label: string;
        description: string;
        enabled: boolean;
        inApp: boolean;
        email: boolean;
        push: boolean;
        sms: boolean;
      }>
    >("/notify/settings/preferences", { token: token() });
  },

  updateMyNotificationPrefs(
    prefs: Array<{
      type: string;
      enabled?: boolean;
      inApp?: boolean;
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    }>,
  ) {
    return apiRequest("/notify/settings/preferences", {
      method: "PATCH",
      body: { prefs },
      token: token(),
    });
  },

  pushStatus() {
    return apiRequest<{ firebaseConfigured: boolean }>("/notify/push/status", {
      token: token(),
    });
  },

  registerPushToken(tokenValue: string, platform: "web" | "android" | "ios" = "web") {
    return apiRequest("/notify/push/register", {
      method: "POST",
      body: { token: tokenValue, platform },
      token: token(),
    });
  },

  unregisterPushToken(tokenValue: string) {
    return apiRequest("/notify/push/unregister", {
      method: "POST",
      body: { token: tokenValue },
      token: token(),
    });
  },

  send(body: {
    customerId?: string;
    phone?: string;
    email?: string;
    channel: "whatsapp" | "sms" | "email";
    templateKey: string;
    payload?: Record<string, unknown>;
  }) {
    return apiRequest<{
      id: string;
      status: string;
      templateKey: string;
      channel: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }>("/notify/send", {
      method: "POST",
      body,
      token: token(),
    });
  },

  sendInvoice(body: {
    orderId: string;
    channels?: Array<"email" | "sms" | "whatsapp">;
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      results: Array<{
        channel: string;
        status: string;
        error?: string;
      }>;
    }>("/notify/invoice", {
      method: "POST",
      body,
      token: token(),
    });
  },

  birthdaysUpcoming(days = 30) {
    return apiRequest<{
      timezone: string;
      windowDays: number;
      count: number;
      items: Array<{
        id: string;
        fullName: string;
        phone: string;
        email?: string | null;
        dateOfBirth: string;
        daysUntil: number;
        marketingOptIn: boolean;
        canSend: boolean;
      }>;
    }>(`/notify/birthdays/upcoming?days=${days}`, { token: token() });
  },

  sendBirthdaysToday(channels?: Array<"email" | "sms" | "whatsapp">) {
    return apiRequest<{
      sentFor: number;
      results: Array<Record<string, unknown>>;
      note: string;
    }>("/notify/birthdays/send-today", {
      method: "POST",
      body: channels ? { channels } : {},
      token: token(),
    });
  },

  listLogs(params?: { page?: number; limit?: number; customerId?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        channel: string;
        templateKey: string;
        status: string;
        payload: Record<string, unknown>;
        createdAt: string;
        customer?: { fullName: string; phone: string } | null;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/notify/logs${q ? `?${q}` : ""}`, { token: token() });
  },
};

export const billingApi = {
  listFees(orderId: string) {
    return apiRequest<
      Array<{
        id: string;
        feeType: string;
        amount: string | number;
        reason?: string | null;
      }>
    >(`/orders/${orderId}/fees`, { token: token() });
  },
  createFee(
    orderId: string,
    body: {
      feeType: "late" | "damage" | "other";
      amount: number;
      reason?: string;
    },
  ) {
    return apiRequest(`/orders/${orderId}/fees`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  applyLateFee(orderId: string, dailyRate?: number) {
    return apiRequest(`/orders/${orderId}/fees/late`, {
      method: "POST",
      body: dailyRate ? { dailyRate } : {},
      token: token(),
    });
  },
  listLayaway(orderId: string) {
    return apiRequest<
      Array<{
        id: string;
        dueBy: string;
        installmentAmount: string | number;
        status: string;
      }>
    >(`/orders/${orderId}/layaway`, { token: token() });
  },
  createLayaway(
    orderId: string,
    installments: Array<{ dueBy: string; installmentAmount: number }>,
  ) {
    return apiRequest(`/orders/${orderId}/layaway`, {
      method: "POST",
      body: { installments },
      token: token(),
    });
  },
  updateLayaway(id: string, status: "pending" | "paid" | "waived") {
    return apiRequest(`/layaway/${id}`, {
      method: "PATCH",
      body: { status },
      token: token(),
    });
  },
  listInvoices(orderId: string) {
    return apiRequest<
      Array<{
        id: string;
        invoiceNumber: string;
        gstin?: string | null;
        taxIdSnapshot?: string | null;
        placeOfSupply?: string | null;
        cgst: string | number;
        sgst: string | number;
        igst: string | number;
        grandTotal: string | number;
        createdAt: string;
        taxBreakdown?: Record<string, unknown> | null;
      }>
    >(`/orders/${orderId}/invoices`, { token: token() });
  },
  createInvoice(
    orderId: string,
    body?: { gstin?: string; placeOfSupply?: string; useIgst?: boolean },
  ) {
    return apiRequest(`/orders/${orderId}/invoices`, {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
};

export const usersApi = {
  list() {
    return apiRequest<
      Array<{
        id: string;
        email: string;
        fullName: string;
        phone?: string | null;
        isActive: boolean;
        primaryStoreId?: string | null;
        roles: string[];
        pinSet?: boolean;
      }>
    >("/users", { token: token() });
  },
  create(body: {
    email: string;
    fullName: string;
    password: string;
    phone?: string;
    roleCode?: string;
    primaryStoreId?: string;
  }) {
    return apiRequest("/users", { method: "POST", body, token: token() });
  },
  update(
    id: string,
    body: {
      fullName?: string;
      phone?: string;
      isActive?: boolean;
      primaryStoreId?: string;
    },
  ) {
    return apiRequest(`/users/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  assignRole(id: string, roleCode: string) {
    return apiRequest(`/users/${id}/roles`, {
      method: "POST",
      body: { roleCode },
      token: token(),
    });
  },
};

export type AttendanceRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  workDate?: string | null;
  shiftId?: string | null;
  shift?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes: number;
  status: string;
  method: string;
  notes?: string | null;
  minutes: number | null;
  workingHours?: string | null;
};

export const iamApi = {
  listPermissions() {
    return apiRequest<
      Array<{ id: string; code: string; description?: string | null }>
    >("/iam/permissions", { token: token() });
  },
  listRoles() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        isSystem: boolean;
        userCount: number;
        permissions: string[];
      }>
    >("/iam/roles", { token: token() });
  },
  createRole(body: { name: string; code?: string; permissions?: string[] }) {
    return apiRequest("/iam/roles", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateRole(
    id: string,
    body: { name?: string; permissions?: string[] },
  ) {
    return apiRequest(`/iam/roles/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  deleteRole(id: string) {
    return apiRequest(`/iam/roles/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  clockIn(body?: { method?: string; notes?: string }) {
    return apiRequest("/iam/attendance/clock-in", {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
  clockOut(body?: { method?: string; notes?: string }) {
    return apiRequest("/iam/attendance/clock-out", {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
  openAttendance() {
    return apiRequest<{
      id: string;
      clockInAt: string | null;
      clockOutAt?: string | null;
      workDate?: string | null;
      status?: string;
    } | null>("/iam/attendance/open", { token: token() });
  },
  listAttendance(params?: {
    from?: string;
    to?: string;
    workDate?: string;
    userId?: string;
    shiftId?: string;
    status?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.workDate) qs.set("workDate", params.workDate);
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.shiftId) qs.set("shiftId", params.shiftId);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return apiRequest<AttendanceRow[]>(`/iam/attendance${q ? `?${q}` : ""}`, {
      token: token(),
    });
  },
  getAttendance(id: string) {
    return apiRequest<AttendanceRow>(`/iam/attendance/${id}`, {
      token: token(),
    });
  },
  createAttendance(body: {
    userId: string;
    workDate: string;
    shiftId?: string;
    clockIn?: string;
    clockOut?: string;
    breakMinutes?: number;
    status: string;
    notes?: string;
  }) {
    return apiRequest<AttendanceRow>("/iam/attendance", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateAttendance(
    id: string,
    body: {
      userId?: string;
      workDate?: string;
      shiftId?: string | null;
      clockIn?: string | null;
      clockOut?: string | null;
      breakMinutes?: number;
      status?: string;
      notes?: string | null;
    },
  ) {
    return apiRequest<AttendanceRow>(`/iam/attendance/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  deleteAttendance(id: string) {
    return apiRequest<{ ok: boolean }>(`/iam/attendance/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  listShifts() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        startTime: string;
        endTime: string;
        daysOfWeek: number[];
        isActive: boolean;
        color?: string | null;
      }>
    >("/iam/shifts", { token: token() });
  },
  createShift(body: {
    name: string;
    startTime: string;
    endTime: string;
    daysOfWeek?: number[];
    color?: string;
  }) {
    return apiRequest("/iam/shifts", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateShift(
    id: string,
    body: {
      name?: string;
      startTime?: string;
      endTime?: string;
      isActive?: boolean;
    },
  ) {
    return apiRequest(`/iam/shifts/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  deleteShift(id: string) {
    return apiRequest(`/iam/shifts/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  listAssignments(params?: { from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return apiRequest<
      Array<{
        id: string;
        workDate: string;
        user: { id: string; fullName: string };
        shift: { id: string; name: string; startTime: string; endTime: string };
      }>
    >(`/iam/shift-assignments${q ? `?${q}` : ""}`, { token: token() });
  },
  assignShift(body: {
    shiftId: string;
    userId: string;
    workDate: string;
    notes?: string;
  }) {
    return apiRequest("/iam/shift-assignments", {
      method: "POST",
      body,
      token: token(),
    });
  },
  removeAssignment(id: string) {
    return apiRequest(`/iam/shift-assignments/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  webauthnRegisterOptions(clientOrigin?: string) {
    return apiRequest<Record<string, unknown>>(
      "/iam/webauthn/register/options",
      {
        method: "POST",
        body: clientOrigin ? { clientOrigin } : {},
        token: token(),
      },
    );
  },
  webauthnRegisterVerify(body: {
    response: unknown;
    label?: string;
    clientOrigin?: string;
  }) {
    return apiRequest("/iam/webauthn/register/verify", {
      method: "POST",
      body,
      token: token(),
    });
  },
  webauthnCredentials() {
    return apiRequest<
      Array<{
        id: string;
        label?: string | null;
        deviceType?: string | null;
        createdAt: string;
      }>
    >("/iam/webauthn/credentials", { token: token() });
  },
  webauthnDeleteCredential(id: string) {
    return apiRequest(`/iam/webauthn/credentials/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  webauthnLoginOptions(email: string, clientOrigin?: string) {
    return apiRequest<Record<string, unknown>>(
      "/iam/webauthn/login/options",
      {
        method: "POST",
        body: { email, ...(clientOrigin ? { clientOrigin } : {}) },
      },
    );
  },
  webauthnLoginVerify(
    email: string,
    response: unknown,
    clientOrigin?: string,
  ) {
    return apiRequest("/iam/webauthn/login/verify", {
      method: "POST",
      body: { email, response, ...(clientOrigin ? { clientOrigin } : {}) },
    });
  },
};

export const documentsApi = {
  list(params?: { orderId?: string; customerId?: string }) {
    const qs = new URLSearchParams();
    if (params?.orderId) qs.set("orderId", params.orderId);
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<
      Array<{
        id: string;
        docType: string;
        storageKey: string;
        customerAcknowledged: boolean;
        signedAt?: string | null;
        createdAt: string;
      }>
    >(`/documents${q ? `?${q}` : ""}`, { token: token() });
  },
  create(body: {
    docType: "agreement" | "id_proof" | "damage_photo";
    storageKey: string;
    orderId?: string;
    customerId?: string;
  }) {
    return apiRequest("/documents", { method: "POST", body, token: token() });
  },
  acknowledge(id: string) {
    return apiRequest(`/documents/${id}/acknowledge`, {
      method: "POST",
      token: token(),
    });
  },
};

export type SupplierWriteBody = {
  name?: string;
  code?: string;
  legalName?: string;
  supplierType?: string;
  category?: string;
  status?: string;
  contact?: string;
  designation?: string;
  phone?: string;
  phoneAlt?: string;
  email?: string;
  website?: string;
  notes?: string;
  taxId?: string;
  taxCategory?: string;
  taxExempt?: boolean;
  registrationNo?: string;
  paymentTerm?: string;
  dueDays?: number;
  creditLimit?: number;
  currencyCode?: string;
  preferredPayMethod?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankIdentifier?: string;
  payHandle?: string;
};

export type SupplierRow = {
  id: string;
  code?: string;
  name: string;
  legalName?: string | null;
  supplierType?: string | null;
  category?: string | null;
  status?: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  paymentTerm?: string | null;
  dueDays?: number | null;
  creditLimit?: string | number | null;
};

export type SupplierDetail = SupplierRow & {
  designation?: string | null;
  phoneAlt?: string | null;
  website?: string | null;
  notes?: string | null;
  taxId?: string | null;
  taxCategory?: string | null;
  taxExempt?: boolean;
  registrationNo?: string | null;
  currencyCode?: string | null;
  preferredPayMethod?: string | null;
  bank?: Record<string, string | null | boolean>;
  contacts?: Array<{
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary: boolean;
  }>;
  addresses?: Array<{
    id: string;
    kind: string;
    line1: string;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  }>;
  documents?: Array<{
    id: string;
    docType: string;
    fileUrl: string;
    fileName?: string | null;
    expiresAt?: string | null;
    createdAt: string;
  }>;
  notesFeed?: Array<{ id: string; body: string; createdAt?: string }>;
};

export const suppliersApi = {
  list(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiRequest<SupplierRow[]>(`/suppliers${q}`, { token: token() });
  },
  get(id: string) {
    return apiRequest<SupplierDetail>(`/suppliers/${id}`, { token: token() });
  },
  create(body: SupplierWriteBody) {
    return apiRequest<SupplierRow>("/suppliers", {
      method: "POST",
      body,
      token: token(),
    });
  },
  update(id: string, body: SupplierWriteBody) {
    return apiRequest<SupplierRow>(`/suppliers/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  addContact(
    id: string,
    body: {
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      notes?: string;
      isPrimary?: boolean;
    },
  ) {
    return apiRequest(`/suppliers/${id}/contacts`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  addAddress(
    id: string,
    body: {
      kind?: string;
      line1: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      isDefault?: boolean;
    },
  ) {
    return apiRequest(`/suppliers/${id}/addresses`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  addNote(id: string, body: string) {
    return apiRequest(`/suppliers/${id}/notes`, {
      method: "POST",
      body: { body },
      token: token(),
    });
  },
  addDocument(
    id: string,
    body: {
      docType: string;
      imageBase64: string;
      fileName?: string;
      expiresAt?: string;
      notes?: string;
    },
  ) {
    return apiRequest(`/suppliers/${id}/documents`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  listPos() {
    return apiRequest<
      Array<{
        id: string;
        poType: string;
        status: string;
        expectedDelivery?: string | null;
        linkedOrderId?: string | null;
        supplier?: { name: string };
        lines?: Array<{
          id: string;
          stockLevelId: string;
          qtyOrdered: number;
          qtyReceived: number;
          stockLevel?: {
            id: string;
            sku: string;
            qtyOnHand: number;
            product?: { name: string };
          };
        }>;
      }>
    >("/purchase-orders", { token: token() });
  },
  createPo(body: {
    supplierId: string;
    poType?: string;
    linkedOrderId?: string;
    expectedDelivery?: string;
    notes?: string;
    lines?: Array<{
      stockLevelId: string;
      qtyOrdered: number;
      unitCost?: number;
    }>;
  }) {
    return apiRequest("/purchase-orders", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updatePo(id: string, body: { status?: string; expectedDelivery?: string }) {
    return apiRequest(`/purchase-orders/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  receivePo(
    id: string,
    body: { lines: Array<{ stockLevelId: string; qty: number }> },
  ) {
    return apiRequest<{
      purchaseOrder: { id: string; status: string };
      received: Array<{
        stockLevelId: string;
        sku: string;
        qtyAdded: number;
        qtyOnHand: number;
      }>;
    }>(`/purchase-orders/${id}/receive`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  returnPo(
    id: string,
    body: {
      lines: Array<{ stockLevelId: string; qty: number }>;
      reason?: string;
      reasonCode?: string;
      createCreditNote?: boolean;
      idempotencyKey?: string;
    },
  ) {
    return apiRequest<{
      purchaseOrder: { id: string; status: string };
      returned: Array<{
        stockLevelId: string;
        sku: string;
        qtyReturned: number;
        qtyOnHand: number;
        lineValue?: number;
      }>;
      creditNote?: { id: string; invoiceNumber: string } | null;
      replayed?: boolean;
    }>(`/purchase-orders/${id}/return`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  listGrns(params?: { page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        grnNumber: string;
        supplierId: string;
        purchaseOrderId: string;
        notes?: string | null;
        receivedAt: string;
        supplier?: { id: string; name: string };
        purchaseOrder?: {
          id: string;
          poNumber: string | null;
          status?: string;
        };
        lines?: Array<{
          id: string;
          stockLevelId: string;
          qty: number;
          unitCost: number | null;
          stockLevel?: {
            id: string;
            sku: string;
            product?: { name: string } | null;
          };
        }>;
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/goods-receipts${q ? `?${q}` : ""}`, { token: token() });
  },
  invoiceFromGrn(id: string) {
    return apiRequest<{
      id: string;
      invoiceNumber: string;
      status: string;
      grandTotal: number;
      balanceDue: number;
    }>(`/goods-receipts/${id}/invoice`, {
      method: "POST",
      token: token(),
    });
  },
  listInvoices(params?: { status?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        supplierId: string;
        purchaseOrderId?: string | null;
        goodsReceiptId?: string | null;
        invoiceNumber: string;
        invoiceDate: string;
        dueDate?: string | null;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        amountPaid: number;
        balanceDue: number;
        status: string;
        notes?: string | null;
        supplier?: { id: string; name: string };
        purchaseOrder?: { id: string; poNumber: string | null };
        goodsReceipt?: { id: string; grnNumber: string };
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/supplier-invoices${q ? `?${q}` : ""}`, { token: token() });
  },
  listOutstanding() {
    return apiRequest<
      Array<{
        id: string;
        supplierId: string;
        invoiceNumber: string;
        invoiceDate: string;
        dueDate?: string | null;
        grandTotal: number;
        amountPaid: number;
        balanceDue: number;
        status: string;
        supplier?: { id: string; name: string };
      }>
    >("/supplier-invoices/outstanding", { token: token() });
  },
  getInvoice(id: string) {
    return apiRequest<{
      id: string;
      supplierId: string;
      invoiceNumber: string;
      invoiceDate: string;
      dueDate?: string | null;
      subtotal: number;
      taxTotal: number;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      status: string;
      notes?: string | null;
      supplier?: { id: string; name: string; phone?: string | null; email?: string | null };
      purchaseOrder?: { id: string; poNumber: string | null };
      goodsReceipt?: { id: string; grnNumber: string };
      payments: Array<{
        id: string;
        amount: number;
        method: string;
        kind?: string;
        reference?: string | null;
        notes?: string | null;
        paidAt: string;
      }>;
    }>(`/supplier-invoices/${id}`, { token: token() });
  },
  createInvoice(body: {
    supplierId: string;
    purchaseOrderId?: string;
    goodsReceiptId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    subtotal: number;
    taxTotal?: number;
    notes?: string;
    isCredit?: boolean;
  }) {
    return apiRequest("/supplier-invoices", {
      method: "POST",
      body,
      token: token(),
    });
  },
  payInvoice(
    id: string,
    body: {
      amount: number;
      method?: string;
      kind?: "payment" | "refund";
      reference?: string;
      notes?: string;
      chequeNumber?: string;
      chequeBank?: string;
      chequeDate?: string;
      chequePayee?: string;
    },
  ) {
    return apiRequest<{
      invoice: { id: string; status: string; balanceDue: number };
      payment: { id: string; amount: number; kind?: string };
    }>(`/supplier-invoices/${id}/pay`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  listPayments(params?: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.supplierId) qs.set("supplierId", params.supplierId);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        supplierId: string;
        supplierInvoiceId?: string | null;
        amount: number;
        method: string;
        reference?: string | null;
        notes?: string | null;
        paidAt: string;
        supplier?: { id: string; name: string };
        invoice?: {
          id: string;
          invoiceNumber: string;
          status: string;
        };
      }>;
      meta?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/supplier-payments${q ? `?${q}` : ""}`, { token: token() });
  },
  createPayment(body: {
    supplierId: string;
    supplierInvoiceId?: string;
    amount: number;
    method?: string;
    reference?: string;
    notes?: string;
  }) {
    return apiRequest("/supplier-payments", {
      method: "POST",
      body,
      token: token(),
    });
  },
  supplierLedger(supplierId: string) {
    return apiRequest<{
      supplierId: string;
      balance: number;
      items: Array<{
        at: string;
        kind: "invoice" | "credit" | "payment";
        ref: string;
        debit: number;
        credit: number;
        balance: number;
        note?: string | null;
      }>;
    }>(`/suppliers/${supplierId}/ledger`, { token: token() });
  },
};

export const syncApi = {
  ping() {
    return apiRequest<{ ok: boolean; ts: string }>("/sync/ping", {
      token: token(),
    });
  },

  snapshot(params: { locationId: string; since?: string }) {
    const q = new URLSearchParams();
    q.set("locationId", params.locationId);
    if (params.since) q.set("since", params.since);
    return apiRequest<OfflineSnapshot>(`/sync/snapshot?${q.toString()}`, {
      token: token(),
    });
  },

  pushEvent(body: {
    deviceId: string;
    storeId: string;
    clientEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    return apiRequest("/sync/events", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listEvents(params?: { storeId?: string; deviceId?: string }) {
    const qs = new URLSearchParams();
    if (params?.storeId) qs.set("storeId", params.storeId);
    if (params?.deviceId) qs.set("deviceId", params.deviceId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        eventType: string;
        syncStatus: string;
        clientEventId: string;
        createdAt?: string;
      }>;
    }>(`/sync/events${q ? `?${q}` : ""}`, { token: token() });
  },
};

export type OfflineSnapshot = {
  serverTime: string;
  location: {
    id: string;
    name: string;
    code: string;
    timezone?: string | null;
  };
  incremental: boolean;
  since: string | null;
  offlinePolicy: {
    maxSaleAmount: number | null;
    blockStoreCredit: boolean;
    managerPinAbove: number | null;
    saleHistoryMonths: number;
  };
  tax: { mode: string; currency: string };
  counts: {
    products: number;
    stockLevels: number;
    customers: number;
    coupons: number;
    categories: number;
    staff: number;
  };
  products: Array<{
    id: string;
    name: string;
    shortName?: string | null;
    skuCode: string;
    barcode?: string | null;
    categoryId?: string | null;
    kind: string;
    status: string;
    basePrice: number;
    mrp?: number | null;
    taxCode?: string | null;
    unitOfMeasure: string;
    trackQty: boolean;
    canSell: boolean;
    availableInPos: boolean;
    photoUrl?: string | null;
    updatedAt: string;
  }>;
  stockLevels: Array<{
    id: string;
    productId: string;
    locationId: string;
    sku: string;
    qtyOnHand: number;
    qtyDamaged: number;
    reorderPoint?: number | null;
    sellPrice: number;
    updatedAt: string;
  }>;
  customers: Array<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    creditLimit?: number | null;
    storeCreditBalance: number;
    loyaltyPoints: number;
    updatedAt: string;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    description?: string | null;
    discountType: string;
    discountValue: number;
    minOrderAmount?: number | null;
    maxRedemptions?: number | null;
    redemptionCount: number;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive: boolean;
    updatedAt: string;
  }>;
  categories: Array<{
    id: string;
    name: string;
    parentId?: string | null;
    updatedAt: string;
  }>;
  staff: Array<{
    id: string;
    fullName: string;
    email: string;
    pinHash: string | null;
    primaryLocationId?: string | null;
    roles: string[];
    updatedAt: string;
  }>;
};

export const platformBillingApi = {
  listPlans() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        priceInr?: string | number;
        priceAmount?: string | number;
        limits?: Record<string, unknown>;
        features?: Record<string, unknown>;
      }>
    >("/platform-billing/plans", { token: token() });
  },
  subscription() {
    return apiRequest<{
      id: string;
      status: string;
      plan?: { code: string; name: string; priceInr?: string | number };
      seatsUsed?: number;
      locationsUsed?: number;
      currentPeriodEnd?: string | null;
      stripeEnabled?: boolean;
    } | null>("/platform-billing/subscription", { token: token() });
  },
  /** Free plans only — paid plans must use createCheckout */
  subscribe(planId: string) {
    return apiRequest("/platform-billing/subscription", {
      method: "POST",
      body: { planId },
      token: token(),
    });
  },
  createCheckout(body: {
    planId: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    return apiRequest<{
      free: boolean;
      sessionId: string | null;
      url: string | null;
      amountInr?: number;
      currency?: string;
      subscription?: Record<string, unknown>;
    }>("/platform-billing/checkout", {
      method: "POST",
      body,
      token: token(),
    });
  },
  confirmCheckout(sessionId: string) {
    return apiRequest<{
      alreadyApplied: boolean;
      subscription: {
        id: string;
        status: string;
        plan?: { code: string; name: string };
      } | null;
    }>("/platform-billing/checkout/confirm", {
      method: "POST",
      body: { sessionId },
      token: token(),
    });
  },
  listInvoices() {
    return apiRequest<
      Array<{
        id: string;
        sessionId: string | null;
        createdAt: string;
        planCode: string | null;
        planName: string | null;
        amount: number | string | null;
        currency: string;
        via: string;
      }>
    >("/platform-billing/invoices", { token: token() });
  },
  cancel() {
    return apiRequest("/platform-billing/subscription/cancel", {
      method: "POST",
      token: token(),
    });
  },
};

/** Product Catalog master (definition layer — not location inventory) */
export type CatalogProductKind =
  | "physical"
  | "service"
  | "digital"
  | "bundle"
  | "rental";
export type CatalogProductStatus =
  | "active"
  | "inactive"
  | "draft"
  | "archived";

export type CatalogProductListItem = {
  id: string;
  name: string;
  shortName?: string | null;
  skuCode: string;
  sku?: string;
  barcode?: string | null;
  barcodeType?: string | null;
  kind: CatalogProductKind;
  status: CatalogProductStatus;
  photoUrl?: string | null;
  images?: string[];
  basePrice: number;
  sellingPrice?: number;
  costPrice?: number | null;
  mrp?: number | null;
  unitOfMeasure?: string;
  stockOnHand?: number | null;
  sellUnit?: string | null;
  trackInventory?: boolean;
  trackSerial?: boolean;
  trackBatch?: boolean;
  canSell?: boolean;
  canPurchase?: boolean;
  availableInPos?: boolean;
  category?: { id: string; name: string; parentId?: string | null } | null;
  brand?: { id: string; name: string } | null;
  counts?: { variants: number; batches: number; bundleLines: number };
};

export const catalogApi = {
  listProducts(params?: {
    q?: string;
    categoryId?: string;
    brandId?: string;
    kind?: CatalogProductKind;
    status?: CatalogProductStatus;
    availableInPos?: boolean;
    locationId?: string;
    page?: number;
    limit?: number;
    lowStock?: boolean;
  }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    if (params?.brandId) qs.set("brandId", params.brandId);
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.status) qs.set("status", params.status);
    if (params?.availableInPos != null)
      qs.set("availableInPos", String(params.availableInPos));
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.lowStock) qs.set("lowStock", "true");
    const q = qs.toString();
    return apiRequest<{
      items: CatalogProductListItem[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/catalog/products${q ? `?${q}` : ""}`, { token: token() });
  },
  getProduct(id: string) {
    return apiRequest<
      CatalogProductListItem & {
        shortDescription?: string | null;
        description?: string | null;
        taxCode?: string | null;
        internalCode?: string | null;
        qrCode?: string | null;
        meta?: Record<string, unknown> | null;
        category?: {
          id: string;
          name: string;
          parentId?: string | null;
          parent?: { id: string; name: string } | null;
        } | null;
        variants: Array<{
          id: string;
          name: string;
          skuCode: string;
          barcode?: string | null;
          attributes?: Record<string, unknown>;
          basePrice?: number | null;
          isActive: boolean;
        }>;
        bundleLines: Array<{
          id: string;
          componentProductId: string;
          quantity: number;
          component: { id: string; name: string; skuCode: string };
        }>;
        batches: Array<{
          id: string;
          batchCode: string;
          locationId: string;
          location?: { id: string; name: string };
          expiresAt?: string | null;
          qtyOnHand: number;
          isActive: boolean;
        }>;
        serials: Array<{
          id: string;
          serial: string;
          status: string;
          location?: { id: string; name: string };
        }>;
        inventoryByLocation: Array<{
          stockLevelId: string;
          locationId: string;
          location?: { id: string; name: string };
          qtyOnHand: number;
          sellPrice: number;
          sellUnit: string;
        }>;
        qr: { payload: string; display: string; chartUrl: string };
      }
    >(`/catalog/products/${id}`, { token: token() });
  },
  createProduct(body: Record<string, unknown>) {
    return apiRequest<CatalogProductListItem>(`/catalog/products`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateProduct(id: string, body: Record<string, unknown>) {
    return apiRequest<CatalogProductListItem>(`/catalog/products/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  setStatus(id: string, status: CatalogProductStatus) {
    return apiRequest<CatalogProductListItem>(`/catalog/products/${id}/status`, {
      method: "POST",
      body: { status },
      token: token(),
    });
  },
  duplicate(id: string) {
    return apiRequest<CatalogProductListItem>(
      `/catalog/products/${id}/duplicate`,
      {
        method: "POST",
        token: token(),
      },
    );
  },
  remove(id: string) {
    return apiRequest<{
      ok: boolean;
      deleted?: boolean;
      softDeleted?: boolean;
    }>(`/catalog/products/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  generateSku(body?: { name?: string; kind?: string; prefix?: string }) {
    return apiRequest<{ sku: string; skuCode: string }>("/catalog/sku/generate", {
      method: "POST",
      body: body ?? {},
      token: token(),
    });
  },
  generateBarcode() {
    return apiRequest<{ barcode: string; barcodeType: string }>(
      "/catalog/barcode/generate",
      {
        method: "POST",
        body: {},
        token: token(),
      },
    );
  },
  checkBarcode(code: string, excludeId?: string) {
    const qs = new URLSearchParams({ code });
    if (excludeId) qs.set("excludeId", excludeId);
    return apiRequest<{
      available: boolean;
      barcode: string;
      barcodeType: string;
      reason?: string | null;
    }>(`/catalog/barcode/check?${qs}`, { token: token() });
  },
  listBrands(q?: string) {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        description?: string | null;
        isActive: boolean;
      }>
    >(`/catalog/brands${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
      token: token(),
    });
  },
  createBrand(body: { name: string; description?: string }) {
    return apiRequest("/catalog/brands", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateBrand(
    id: string,
    body: { name?: string; description?: string | null; isActive?: boolean },
  ) {
    return apiRequest(`/catalog/brands/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  removeBrand(id: string) {
    return apiRequest<{
      ok: boolean;
      deleted?: boolean;
      softDeleted?: boolean;
    }>(`/catalog/brands/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  listCategories() {
    return apiRequest<
      Array<{
        id: string;
        name: string;
        description?: string | null;
        parentId?: string | null;
        parent?: { id: string; name: string } | null;
        isActive: boolean;
        sortOrder: number;
        _count?: { products: number; children: number };
      }>
    >("/catalog/categories", { token: token() });
  },
  createCategory(body: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
  }) {
    return apiRequest("/catalog/categories", {
      method: "POST",
      body,
      token: token(),
    });
  },
  updateCategory(
    id: string,
    body: {
      name?: string;
      description?: string | null;
      parentId?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return apiRequest(`/catalog/categories/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  removeCategory(id: string) {
    return apiRequest<{
      ok: boolean;
      deleted?: boolean;
      softDeleted?: boolean;
    }>(`/catalog/categories/${id}`, {
      method: "DELETE",
      token: token(),
    });
  },
  createVariant(
    productId: string,
    body: {
      name: string;
      skuCode?: string;
      barcode?: string;
      attributes?: Record<string, string>;
      basePrice?: number;
    },
  ) {
    return apiRequest(`/catalog/products/${productId}/variants`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  deleteVariant(productId: string, variantId: string) {
    return apiRequest(`/catalog/products/${productId}/variants/${variantId}`, {
      method: "DELETE",
      token: token(),
    });
  },
  setBundleLines(
    productId: string,
    lines: Array<{ componentProductId: string; quantity?: number }>,
  ) {
    return apiRequest(`/catalog/products/${productId}/bundle-lines`, {
      method: "PUT",
      body: { lines },
      token: token(),
    });
  },
  createBatch(
    productId: string,
    body: {
      batchCode: string;
      locationId: string;
      expiresAt?: string;
      manufacturedAt?: string;
      qtyOnHand?: number;
      notes?: string;
    },
  ) {
    return apiRequest(`/catalog/products/${productId}/batches`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  createSerial(
    productId: string,
    body: { serial: string; locationId?: string; label?: string },
  ) {
    return apiRequest(`/catalog/products/${productId}/serials`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  listExpiringBatches(days = 30) {
    return apiRequest<{
      items: Array<{
        id: string;
        batchCode: string;
        expiresAt: string | null;
        qtyOnHand: number;
        product: { id: string; name: string; skuCode: string };
        location: { id: string; name: string };
      }>;
    }>(`/catalog/batches/expiring?days=${days}`, { token: token() });
  },
};

export const accountingApi = {
  settings() {
    return apiRequest<{
      enabled: boolean;
      basis: "cash" | "accrual";
      baseCurrency: string;
      fiscalYearStartMonth: number;
      taxCountry: string;
      inventoryAccountingEnabled: boolean;
      cogsEnabled: boolean;
    }>("/accounting/settings", { token: token() });
  },
  updateSettings(body: Record<string, unknown>) {
    return apiRequest("/accounting/settings", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  overview() {
    return apiRequest<{
      settings: Record<string, unknown>;
      cards: Record<string, string>;
      pnl: Record<string, unknown>;
    }>("/accounting/overview", { token: token() });
  },
  listAccounts(params?: Record<string, string | number | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v != null && v !== "") q.set(k, String(v));
    });
    const s = q.toString();
    return apiRequest<{ items: unknown[]; meta: unknown }>(
      `/accounts${s ? `?${s}` : ""}`,
      { token: token() },
    );
  },
  tree() {
    return apiRequest<unknown[]>("/accounts/tree", { token: token() });
  },
  getAccount(id: string) {
    return apiRequest(`/accounts/${id}`, { token: token() });
  },
  createAccount(body: Record<string, unknown>) {
    return apiRequest("/accounts", { method: "POST", body, token: token() });
  },
  updateAccount(id: string, body: Record<string, unknown>) {
    return apiRequest(`/accounts/${id}`, {
      method: "PATCH",
      body,
      token: token(),
    });
  },
  listJournals(params?: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const s = q.toString();
    return apiRequest<{ items: unknown[]; meta: { total: number } }>(
      `/journal-entries${s ? `?${s}` : ""}`,
      { token: token() },
    );
  },
  getJournal(id: string) {
    return apiRequest(`/journal-entries/${id}`, { token: token() });
  },
  createJournal(body: Record<string, unknown>) {
    return apiRequest("/journal-entries", {
      method: "POST",
      body,
      token: token(),
    });
  },
  postJournal(id: string) {
    return apiRequest(`/journal-entries/${id}/post`, {
      method: "POST",
      token: token(),
    });
  },
  reverseJournal(id: string, reason?: string) {
    return apiRequest(`/journal-entries/${id}/reverse`, {
      method: "POST",
      body: { reason },
      token: token(),
    });
  },
  ledger(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    return apiRequest(`/ledger?${q.toString()}`, { token: token() });
  },
  trialBalance(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    return apiRequest(`/trial-balance?${q}`, { token: token() });
  },
  profitLoss(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    return apiRequest(`/profit-loss?${q}`, { token: token() });
  },
  balanceSheet(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    return apiRequest(`/balance-sheet?${q}`, { token: token() });
  },
  taxReports(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    return apiRequest(`/tax-reports?${q}`, { token: token() });
  },
  periods() {
    return apiRequest<unknown[]>("/accounting-periods", { token: token() });
  },
  createPeriod(body: Record<string, unknown>) {
    return apiRequest("/accounting-periods", {
      method: "POST",
      body,
      token: token(),
    });
  },
  closePeriod(id: string) {
    return apiRequest(`/accounting-periods/${id}/close`, {
      method: "POST",
      token: token(),
    });
  },
  reopenPeriod(id: string) {
    return apiRequest(`/accounting-periods/${id}/reopen`, {
      method: "POST",
      token: token(),
    });
  },
  mappings(locationId?: string) {
    const q = locationId ? `?locationId=${locationId}` : "";
    return apiRequest<unknown[]>(`/account-mappings${q}`, { token: token() });
  },
  upsertMapping(body: Record<string, unknown>) {
    return apiRequest("/account-mappings", {
      method: "POST",
      body,
      token: token(),
    });
  },
  integrations() {
    return apiRequest<unknown[]>("/integrations", { token: token() });
  },
  connect(provider: string, config: Record<string, unknown>) {
    return apiRequest(`/integrations/${provider}/connect`, {
      method: "POST",
      body: { config },
      token: token(),
    });
  },
  disconnect(provider: string) {
    return apiRequest(`/integrations/${provider}/disconnect`, {
      method: "POST",
      token: token(),
    });
  },
  test(provider: string) {
    return apiRequest(`/integrations/${provider}/test`, {
      method: "POST",
      token: token(),
    });
  },
  sync(provider: string) {
    return apiRequest(`/integrations/${provider}/sync`, {
      method: "POST",
      token: token(),
    });
  },
  integrationMappings(provider: string) {
    return apiRequest(`/integrations/${provider}/mappings`, { token: token() });
  },
  upsertIntegrationMapping(provider: string, body: Record<string, unknown>) {
    return apiRequest(`/integrations/${provider}/mappings`, {
      method: "POST",
      body,
      token: token(),
    });
  },
  integrationLogs(provider: string) {
    return apiRequest(`/integrations/${provider}/logs`, { token: token() });
  },
  tallyExport(body: { from: string; to: string }) {
    return apiRequest("/integrations/tally/export", {
      method: "POST",
      body,
      token: token(),
    });
  },
};

