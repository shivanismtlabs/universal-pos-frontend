import { apiRequest } from "./client";
import { useAuthStore } from "../auth-store";
import type { TenantBootstrap } from "../bootstrap-types";

function token() {
  return useAuthStore.getState().accessToken;
}

function stationToken() {
  return useAuthStore.getState().stationToken;
}

function identityToken() {
  return useAuthStore.getState().identityToken;
}

type AuthUserPayload = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  storeId?: string | null;
  tenantId: string;
  pinSet?: boolean;
};

export type PortalSessionResponse = {
  stage?: "select_org" | "app";
  requiresOrganizationSelection?: boolean;
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
      primaryStoreId?: string | null;
      tenantId: string;
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
    return apiRequest<Record<string, unknown>>(`/customers/${id}`, {
      token: token(),
    });
  },

  softDelete(id: string) {
    return apiRequest<null>(`/customers/${id}`, {
      method: "DELETE",
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
        balanceDue: string | number;
        subtotal: string | number;
        depositTotal?: string | number;
        customer?: { id?: string; fullName: string; phone: string };
        pickupDate?: string | null;
        returnDueDate?: string | null;
        eventDate?: string | null;
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
        discount?: string | number;
        taxAmount: string | number;
        size?: string | null;
        inventoryUnitId?: string | null;
        stockUnitId?: string | null;
        stockLevelId?: string | null;
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
        retailSku?: { id: string; sku: string } | null;
        wearer?: { id: string; fullName: string } | null;
      }>;
      payments: Array<{
        id: string;
        amount: string | number;
        method: string;
        status: string;
        type: string;
      }>;
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
        fittingNotes?: string | null;
        customer?: { fullName: string; phone: string };
        store?: { name: string };
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
    }>("/payments/stripe/config", { token: token() });
  },

  createStripeIntent(body: {
    orderId: string;
    amount: number;
    type?: string;
    method?: string;
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
    lowStock?: boolean;
    maxQty?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.lowStock) qs.set("lowStock", "1");
    if (params?.maxQty) qs.set("maxQty", String(params.maxQty));
    const q = qs.toString();
    return apiRequest<{
      locationId: string;
      lowStock?: boolean;
      maxQty?: number;
      items: Array<{
        id: string;
        sku: string;
        sellPrice: string | number;
        qtyOnHand: number;
        sellUnit?: string;
        lowStock?: boolean;
        name: string;
        productSku?: string;
        description?: string | null;
        image?: string | null;
        photoUrl?: string | null;
        images?: string[];
        category?: { id: string; name: string } | null;
      }>;
    }>(`/pos/sale/catalog${q ? `?${q}` : ""}`, { token: token() });
  },
  saleLookup(sku: string, locationId?: string) {
    const qs = new URLSearchParams({ sku });
    if (locationId) qs.set("locationId", locationId);
    return apiRequest<{
      id: string;
      sku: string;
      sellPrice: string | number;
      qtyOnHand: number;
      sellUnit?: string;
      name: string;
      productSku?: string;
      image?: string | null;
      photoUrl?: string | null;
      category?: { id: string; name: string } | null;
    }>(`/pos/sale/lookup?${qs}`, { token: token() });
  },
  saleCheckout(body: {
    locationId: string;
    customerId?: string;
    items: Array<{
      stockLevelId: string;
      quantity: number;
      unitPrice?: number;
    }>;
    payments: Array<{
      method: string;
      amount: number;
      idempotencyKey: string;
      type?: string;
    }>;
    cashTendered?: number;
    note?: string;
    discountAmount?: number;
    couponCode?: string;
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
    }>;
    note?: string;
    discountAmount?: number;
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
    items: Array<{ stockLevelId: string; quantity: number }>;
    refundMethod: string;
    amount?: number;
    reason?: string;
    idempotencyKey: string;
  }) {
    return apiRequest<{
      orderId: string;
      orderNumber: string;
      refundPaymentId: string;
      amount: string | number;
      storeCreditBalance?: number | null;
      restocked: Array<{ stockLevelId: string; quantity: number }>;
    }>("/pos/sale/returns", { method: "POST", body, token: token() });
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
      }>
    >("/locations", { token: token() });
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
  }) {
    return apiRequest("/tenants/me", {
      method: "PATCH",
      body,
      token: token(),
    });
  },
};

export const appsApi = {
  bootstrap() {
    return apiRequest<TenantBootstrap>(
      "/tenants/me/bootstrap",
      { token: token() },
    );
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
  }) {
    return apiRequest<{
      businessType: string;
      config: Record<string, unknown>;
      commerceModes: string[];
    }>("/tenants/me/business-config", {
      method: "POST",
      body,
      token: token(),
    });
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

export const reportsApi = {
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

export const expensesApi = {
  listCategories() {
    return apiRequest<Array<{ id: string; name: string }>>(
      "/expenses/categories",
      { token: token() },
    );
  },
  createCategory(name: string) {
    return apiRequest("/expenses/categories", {
      method: "POST",
      body: { name },
      token: token(),
    });
  },
  seedCategories() {
    return apiRequest("/expenses/categories/seed", {
      method: "POST",
      token: token(),
    });
  },
  list(params?: {
    from?: string;
    to?: string;
    locationId?: string;
    categoryId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.locationId) qs.set("locationId", params.locationId);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        amount: string | number;
        spentAt: string;
        paymentMethod: string;
        notes?: string | null;
        isPettyCash: boolean;
        category?: { id: string; name: string } | null;
        location?: { id: string; name: string } | null;
      }>;
      total: number;
      count: number;
    }>(`/expenses${q ? `?${q}` : ""}`, { token: token() });
  },
  create(body: {
    amount: number;
    spentAt: string;
    categoryId?: string;
    locationId?: string;
    paymentMethod?: string;
    notes?: string;
    isPettyCash?: boolean;
  }) {
    return apiRequest("/expenses", {
      method: "POST",
      body,
      token: token(),
    });
  },
  remove(id: string) {
    return apiRequest(`/expenses/${id}`, {
      method: "DELETE",
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
    }>("/notify/config", { token: token() });
  },

  send(body: {
    customerId?: string;
    phone?: string;
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
        placeOfSupply?: string | null;
        cgst: string | number;
        sgst: string | number;
        igst: string | number;
        grandTotal: string | number;
        createdAt: string;
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

export const suppliersApi = {
  list() {
    return apiRequest<
      Array<{ id: string; name: string; contact?: string | null; phone?: string | null }>
    >("/suppliers", { token: token() });
  },
  create(body: { name: string; contact?: string; phone?: string }) {
    return apiRequest("/suppliers", { method: "POST", body, token: token() });
  },
  update(
    id: string,
    body: { name?: string; contact?: string; phone?: string },
  ) {
    return apiRequest(`/suppliers/${id}`, {
      method: "PATCH",
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
    },
  ) {
    return apiRequest<{
      purchaseOrder: { id: string; status: string };
      returned: Array<{
        stockLevelId: string;
        sku: string;
        qtyReturned: number;
        qtyOnHand: number;
      }>;
    }>(`/purchase-orders/${id}/return`, {
      method: "POST",
      body,
      token: token(),
    });
  },
};

export const syncApi = {
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
