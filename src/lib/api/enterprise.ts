import { apiRequest } from "./client";
import { useAuthStore } from "../auth-store";

function enterpriseToken() {
  const s = useAuthStore.getState();
  return s.accessToken || s.identityToken;
}

export const enterpriseApi = {
  group() {
    return apiRequest<{
      group: {
        id: string;
        name: string;
        slug: string;
        role: string;
        entitlements: string[];
        hideLayer: boolean;
        pricingModel: string;
      };
      businesses: Array<{
        tenantId: string;
        name: string;
        slug: string;
        status: string;
        currencyCode: string;
        timezone: string;
        businessType: string;
        branchCount: number;
        openRegisterCount: number;
        shareInventory: boolean;
        canEnter: boolean;
      }>;
    }>("/enterprise/group", { token: enterpriseToken() });
  },

  dashboard(params?: Record<string, string>) {
    const qs = new URLSearchParams(params);
    const q = qs.toString();
    return apiRequest<{
      timezone: string;
      currencyCode: string;
      kpis: Record<string, number | null>;
      businesses: number;
    }>(`/enterprise/dashboard${q ? `?${q}` : ""}`, {
      token: enterpriseToken(),
    });
  },

  pnl(params?: Record<string, string>) {
    const qs = new URLSearchParams(params);
    const q = qs.toString();
    return apiRequest<{
      note: string;
      period: { from: string; to: string };
      group: Record<string, number | null>;
      businesses: Array<{
        tenantId: string;
        name: string;
        revenue: number;
        cogs: number;
        grossProfit: number;
        grossMarginPct: number | null;
        expenses: number;
        netProfit: number;
      }>;
    }>(`/enterprise/pnl${q ? `?${q}` : ""}`, { token: enterpriseToken() });
  },

  comparison(params?: Record<string, string>) {
    const qs = new URLSearchParams(params);
    const q = qs.toString();
    return apiRequest<{
      period: { from: string; to: string };
      rows: Array<Record<string, string | number | null>>;
    }>(`/enterprise/comparison${q ? `?${q}` : ""}`, {
      token: enterpriseToken(),
    });
  },

  inventory(q: string) {
    return apiRequest<{
      query: string;
      showCost: boolean;
      items: Array<{
        sku: string;
        name: string;
        locations: Array<{
          tenantId: string;
          business: string;
          location: string;
          warehouse: boolean;
          available: number;
          damaged: number;
          inTransit: number;
          total: number;
        }>;
      }>;
    }>(`/enterprise/inventory?q=${encodeURIComponent(q)}`, {
      token: enterpriseToken(),
    });
  },

  intercompany() {
    return apiRequest<unknown[]>("/enterprise/intercompany", {
      token: enterpriseToken(),
    });
  },

  createIntercompany(body: {
    sourceTenantId: string;
    destinationTenantId: string;
    sourceLocationId: string;
    destinationLocationId: string;
    notes?: string;
    lines: Array<{ sku: string; quantity: number; unitCost?: number }>;
  }) {
    return apiRequest("/enterprise/intercompany", {
      method: "POST",
      body,
      token: enterpriseToken(),
    });
  },

  issueIntercompany(id: string) {
    return apiRequest(`/enterprise/intercompany/${id}/issue`, {
      method: "POST",
      token: enterpriseToken(),
    });
  },

  receiveIntercompany(id: string) {
    return apiRequest(`/enterprise/intercompany/${id}/receive`, {
      method: "POST",
      token: enterpriseToken(),
    });
  },

  approvals(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiRequest<
      Array<{
        id: string;
        tenantId: string;
        type: string;
        entityType: string;
        entityId?: string | null;
        amount?: string | number | null;
        reason?: string | null;
        status: string;
        currentStep: number;
        createdAt: string;
        steps?: Array<{
          id: string;
          stepIndex: number;
          status: string;
          note?: string | null;
        }>;
      }>
    >(`/enterprise/approvals${q}`, {
      token: enterpriseToken(),
    });
  },

  decide(id: string, decision: "approved" | "rejected", note?: string) {
    return apiRequest(`/enterprise/approvals/${id}/decide`, {
      method: "POST",
      body: { decision, note },
      token: enterpriseToken(),
    });
  },

  staff() {
    return apiRequest<{
      identity: {
        id: string;
        email: string;
        fullName: string;
        groupRole: string;
      };
      memberships: Array<{
        tenantId: string;
        name: string;
        slug: string;
        userId: string;
        roles: string[];
        inGroup: boolean;
      }>;
    }>("/enterprise/staff", { token: enterpriseToken() });
  },

  suppliers(q?: string) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return apiRequest(`/enterprise/suppliers${qs}`, {
      token: enterpriseToken(),
    });
  },

  procurement() {
    return apiRequest("/enterprise/procurement", { token: enterpriseToken() });
  },

  customers(q?: string) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return apiRequest(`/enterprise/customers${qs}`, {
      token: enterpriseToken(),
    });
  },

  audit(q?: string) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return apiRequest(`/enterprise/audit${qs}`, { token: enterpriseToken() });
  },

  spinOff(tenantId: string) {
    return apiRequest("/enterprise/spin-off", {
      method: "POST",
      body: { tenantId, confirmation: "SPIN_OFF" },
      token: enterpriseToken(),
    });
  },

  completeSpinOff(id: string) {
    return apiRequest(`/enterprise/spin-off/${id}/complete`, {
      method: "POST",
      token: enterpriseToken(),
    });
  },

  evaluateAlerts() {
    return apiRequest("/enterprise/alerts/evaluate", {
      method: "POST",
      token: enterpriseToken(),
    });
  },
};
