import { apiRequest } from "./client";
import { useAuthStore } from "../auth-store";

function token() {
  return useAuthStore.getState().accessToken;
}

export const authApi = {
  login(body: { tenantSlug: string; email: string; password: string }) {
    return apiRequest<{
      user: {
        id: string;
        email: string;
        fullName: string;
        roles: string[];
        storeId?: string | null;
        tenantId: string;
      };
      accessToken: string;
      refreshToken: string;
    }>("/auth/login", { method: "POST", body });
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
      refreshToken: string;
    }>("/auth/register-tenant", { method: "POST", body });
  },

  me() {
    return apiRequest<{
      id: string;
      email: string;
      fullName: string;
      roles: string[];
      primaryStoreId?: string | null;
      tenantId: string;
    }>("/auth/me", { token: token() });
  },

  logout() {
    return apiRequest<null>("/auth/logout", {
      method: "POST",
      token: token(),
    });
  },

  refresh(refreshToken: string) {
    return apiRequest<{ accessToken: string; refreshToken: string }>(
      "/auth/refresh",
      { method: "POST", body: { refreshToken } },
    );
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
        members: Array<{
          customerId: string;
          roleLabel?: string | null;
          customer: { id: string; fullName: string; phone: string };
        }>;
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
      Array<{ id: string; name: string; styleCode: string; color?: string }>
    >("/product-styles", { token: token() });
  },
  createStyle(body: Record<string, unknown>) {
    return apiRequest<{ id: string }>("/product-styles", {
      method: "POST",
      body,
      token: token(),
    });
  },
  listUnits(params?: {
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
    return apiRequest<{
      items: Array<{
        id: string;
        barcodeSku: string;
        size: string;
        availabilityStatus: string;
        condition: string;
        rentalPrice: string | number;
        depositAmount: string | number;
        productStyle?: { name: string; styleCode: string; color?: string };
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/inventory-units${q ? `?${q}` : ""}`, { token: token() });
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
        store?: { name: string };
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
};

export const ordersApi = {
  list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    q?: string;
    customerId?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    if (params?.customerId) qs.set("customerId", params.customerId);
    const q = qs.toString();
    return apiRequest<{
      items: Array<{
        id: string;
        orderNumber: string;
        status: string;
        balanceDue: string | number;
        subtotal: string | number;
        depositTotal?: string | number;
        customer?: { id?: string; fullName: string; phone: string };
        pickupDate?: string | null;
        returnDueDate?: string | null;
        eventDate?: string | null;
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
      subtotal: string | number;
      taxTotal: string | number;
      depositTotal: string | number;
      balanceDue: string | number;
      eventDate?: string | null;
      pickupDate?: string | null;
      returnDueDate?: string | null;
      partyId?: string | null;
      customer?: { id: string; fullName: string; phone: string };
      items: Array<{
        id: string;
        itemType: string;
        unitPrice: string | number;
        discount: string | number;
        taxAmount: string | number;
        size?: string | null;
        inventoryUnitId?: string | null;
        inventoryUnit?: {
          id: string;
          barcodeSku: string;
          size: string;
          rentalPrice: string | number;
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

  updateStatus(id: string, status: string) {
    return apiRequest(`/orders/${id}/status`, {
      method: "POST",
      body: { status },
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
        order?: { orderNumber: string };
        inventoryUnit?: { barcodeSku: string; size: string };
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(`/returns${q ? `?${q}` : ""}`, { token: token() });
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
    return apiRequest("/payments/stripe/verify", {
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
    return apiRequest<{ order: { id: string; status: string }; payments: unknown[] }>(
      "/pos/checkout",
      { method: "POST", body, token: token() },
    );
  },
  receipt(orderId: string) {
    return apiRequest<{
      orderNumber: string;
      status: string;
      store: { name: string; code?: string | null; address?: string | null };
      customer: { fullName: string; phone: string; email?: string | null };
      items: Array<{
        itemType: string;
        size?: string | null;
        unitPrice: string | number;
        inventoryUnit?: { barcodeSku: string; size: string } | null;
        retailSku?: { sku: string } | null;
      }>;
      totals: {
        subtotal: string | number;
        taxTotal: string | number;
        depositTotal: string | number;
        balanceDue: string | number;
      };
      payments: Array<{
        method: string;
        type: string;
        amount: string | number;
        paidAt?: string | null;
      }>;
      printedAt: string;
    }>(`/pos/orders/${orderId}/receipt`, { token: token() });
  },
};

export const tenantsApi = {
  me() {
    return apiRequest<{
      id: string;
      name: string;
      slug: string;
      gstin?: string | null;
    }>("/tenants/me", { token: token() });
  },
  listStores() {
    return apiRequest<
      Array<{ id: string; name: string; code?: string | null; isMain?: boolean }>
    >("/stores", { token: token() });
  },
};

export const reportsApi = {
  salesSummary(from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const q = qs.toString();
    return apiRequest<{
      byStatus?: Array<{ status: string; count: number }>;
      totals?: {
        subtotal?: string | number;
        taxTotal?: string | number;
        balanceDue?: string | number;
        orderCount?: number;
      };
      [key: string]: unknown;
    }>(`/reports/sales-summary${q ? `?${q}` : ""}`, { token: token() });
  },
  paymentsSummary(from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
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
  inventoryUtilization() {
    return apiRequest<{
      byAvailabilityStatus: Array<{
        availabilityStatus: string;
        count: number;
      }>;
    }>("/reports/inventory-utilization", { token: token() });
  },
  balances() {
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
    }>("/reports/balances", { token: token() });
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
  listPos() {
    return apiRequest<
      Array<{
        id: string;
        poType: string;
        status: string;
        expectedDelivery?: string | null;
        linkedOrderId?: string | null;
        supplier?: { name: string };
      }>
    >("/purchase-orders", { token: token() });
  },
  createPo(body: {
    supplierId: string;
    poType?: string;
    linkedOrderId?: string;
    expectedDelivery?: string;
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
      Array<{ id: string; code: string; name: string; priceInr: string | number }>
    >("/platform-billing/plans", { token: token() });
  },
  subscription() {
    return apiRequest<{
      id: string;
      status: string;
      plan?: { code: string; name: string };
      seatsUsed?: number;
      locationsUsed?: number;
    } | null>("/platform-billing/subscription", { token: token() });
  },
  subscribe(planId: string) {
    return apiRequest("/platform-billing/subscription", {
      method: "POST",
      body: { planId },
      token: token(),
    });
  },
};
