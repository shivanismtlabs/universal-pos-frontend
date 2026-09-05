/**
 * Universal Invoice / Receipt Document Engine (Frontend Shared Model & Mapper)
 */

export type UniversalInvoiceStatus =
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'DUE'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'DRAFT';

export type UniversalTaxClassification = {
  type?: string; // 'HSN' | 'SAC' | 'VAT' | 'CUSTOM' | string;
  code?: string;
  label?: string; // e.g. 'HSN', 'SAC', 'Tax Code'
};

export type UniversalInvoiceHeader = {
  businessName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxRegistration?: {
    label: string; // e.g. 'GSTIN', 'VAT #', 'Tax ID'
    value: string;
  } | null;
  locationName?: string | null;
  invoiceNumber: string;
  orderNumber: string;
  issueDate: string | Date;
  cashierName?: string | null;
  salespersonName?: string | null;
};

export type UniversalInvoiceCustomer = {
  id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxRegistrationNumber?: string | null;
};

export type UniversalCommerceMetadata = {
  sku?: string | null;
  barcode?: string | null;
  batchNumber?: string | null;
  serialNumber?: string | null;
  durationLabel?: string | null;
  sessionsCount?: number | null;
  appointmentRef?: string | null;
  staffName?: string | null;
  planName?: string | null;
  billingInterval?: string | null;
  validityStartDate?: string | Date | null;
  validityEndDate?: string | Date | null;
  rentalStartDate?: string | Date | null;
  rentalEndDate?: string | Date | null;
  rentalDuration?: string | null;
  assetIdentifier?: string | null;
  securityDepositHeld?: number | null;
  rentalStatus?: string | null;
  tableNumber?: string | null;
  orderType?: 'dine_in' | 'takeaway' | 'delivery' | string | null;
  kotNumber?: string | null;
  returnEventNumber?: string | null;
  returnReason?: string | null;
  itemCondition?: string | null;
};

export type UniversalInvoiceLineItem = {
  lineNumber: number;
  name: string;
  description?: string | null;
  quantity: number;
  unitSymbol?: string | null;
  unitName?: string | null;
  equivalentBaseQuantity?: number | null;
  equivalentBaseUnitSymbol?: string | null;
  unitPrice: number;
  pricingUnitSymbol?: string | null;
  grossMrp?: number | null;
  productDiscount?: number | null;
  taxableAmount?: number | null;
  taxRatePercent?: number | null;
  taxAmount?: number | null;
  taxClassification?: UniversalTaxClassification | null;
  lineTotal: number;
  commerceMetadata?: UniversalCommerceMetadata | null;
};

export type UniversalInvoiceTotals = {
  grossMrpTotal?: number | null;
  productDiscountTotal?: number | null;
  subtotalNet: number;
  billDiscountTotal?: number | null;
  couponDiscountTotal?: number | null;
  taxableValue?: number | null;
  taxTotal: number;
  taxBreakdown?: Array<{
    name: string;
    ratePercent: number;
    amount: number;
  }>;
  securityDepositTotal?: number | null;
  roundOff?: number | null;
  netPayable: number;
};

export type UniversalPaymentEntry = {
  method: string;
  label?: string;
  amount: number;
  status?: string;
  transactionReference?: string | null;
  paidAt?: string | Date | null;
};

export type UniversalInvoicePayment = {
  payments: UniversalPaymentEntry[];
  totalPaid: number;
  balanceDue: number;
  changeReturned?: number | null;
  status: UniversalInvoiceStatus;
  upiPaymentQr?: {
    vpa: string;
    payeeName: string;
    amount: number;
  } | null;
};

export type UniversalInvoiceConfig = {
  currencySymbol: string;
  currencyCode: string;
  documentTitle?: string;
  footerNote?: string | null;
  termsAndConditions?: string[] | string | null;
  returnPolicyNote?: string | null;
  showBarcode?: boolean;
};

export type UniversalInvoiceDocument = {
  header: UniversalInvoiceHeader;
  customer?: UniversalInvoiceCustomer | null;
  items: UniversalInvoiceLineItem[];
  commerceMetadata?: UniversalCommerceMetadata | null;
  totals: UniversalInvoiceTotals;
  payment: UniversalInvoicePayment;
  config: UniversalInvoiceConfig;
  notes?: string | null;
};

export function mapToUniversalInvoice(input: {
  order: any;
  shop?: any;
  customer?: any;
  items?: any[];
  payments?: any[];
  invoices?: any[];
  config?: Partial<UniversalInvoiceConfig>;
  returnEvent?: any;
}): UniversalInvoiceDocument {
  const o = input.order || {};
  const s = input.shop || {};
  const c = input.customer || o.customer;
  const items = input.items || o.items || [];
  const payments = input.payments || o.payments || [];
  const ret = input.returnEvent;

  const taxIdVal = s.taxId || s.gstin || o.meta?.taxId || o.meta?.gstin;
  const taxLabel = s.taxLabel || (taxIdVal ? 'GSTIN' : 'Tax ID');

  const invoiceNumber =
    o.activeInvoiceNumber ||
    input.invoices?.[input.invoices.length - 1]?.invoiceNumber ||
    o.invoices?.[o.invoices.length - 1]?.invoiceNumber ||
    (ret ? `RET-${ret.id?.slice(-6) || o.orderNumber}` : o.orderNumber || 'INV-0001');

  const header: UniversalInvoiceHeader = {
    businessName: s.name || s.shopName || 'Business Store',
    tagline: s.tagline || null,
    logoUrl: s.logoUrl || null,
    address: s.address || null,
    phone: s.phone || null,
    email: s.email || null,
    website: s.website || null,
    taxRegistration: taxIdVal ? { label: taxLabel, value: String(taxIdVal) } : null,
    locationName: s.locationName || o.location?.name || null,
    invoiceNumber,
    orderNumber: o.orderNumber || invoiceNumber,
    issueDate: o.createdAt || new Date(),
    cashierName: o.cashierName || o.cashier || o.createdBy?.name || null,
    salespersonName: o.salespersonName || null,
  };

  const customer: UniversalInvoiceCustomer | null = c
    ? {
        id: c.id || null,
        name: c.fullName || c.name || 'Walk-in Customer',
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        taxRegistrationNumber: c.taxRegistrationNumber || c.gstin || null,
      }
    : null;

  const mappedItems: UniversalInvoiceLineItem[] = items.map((item: any, idx: number) => {
    const rawQty = Number(item.orderedQuantity ?? item.quantity ?? 1);
    const orderedUnitSymbol =
      item.orderedUnitSymbol ||
      item.unitSymbol ||
      (typeof item.meta === 'object' && item.meta?.orderedUnitSymbol) ||
      '';
    const baseUnitSymbol =
      item.baseUnitSymbol ||
      (typeof item.meta === 'object' && item.meta?.baseUnitSymbol) ||
      '';
    const baseQty =
      item.baseQuantity != null ? Number(item.baseQuantity) : null;

    const rate = Number(item.unitPrice ?? 0);
    const lineTotal =
      item.lineTotal !== undefined
        ? Number(item.lineTotal)
        : rate * rawQty;
    const taxAmt = Number(item.taxAmount ?? 0);
    const taxRate =
      item.taxRatePercent !== undefined
        ? Number(item.taxRatePercent)
        : taxAmt > 0 && lineTotal > 0
          ? Number(((taxAmt / lineTotal) * 100).toFixed(1))
          : 0;

    const rawTaxCode = (
      item.hsnOrSac ||
      item.taxCode ||
      (typeof item.meta === 'object' && item.meta?.hsn) ||
      ''
    ).trim();

    let taxClassification: UniversalTaxClassification | null = null;
    if (rawTaxCode) {
      const isSac =
        item.itemKind === 'service' ||
        item.itemType === 'service' ||
        /^99/i.test(rawTaxCode);
      taxClassification = {
        type: isSac ? 'SAC' : 'HSN',
        code: rawTaxCode,
        label: isSac ? 'SAC' : 'HSN',
      };
    }

    const itemMeta = typeof item.meta === 'object' ? item.meta : {};

    const commerceMeta: UniversalCommerceMetadata = {
      sku: item.sku || item.product?.skuCode || itemMeta?.sku || null,
      barcode: item.barcode || item.product?.barcode || itemMeta?.barcode || null,
      durationLabel:
        item.durationLabel ||
        itemMeta?.durationLabel ||
        (item.durationDays ? `${item.durationDays} day(s)` : null) ||
        (item.durationHours ? `${item.durationHours} hr(s)` : null),
      sessionsCount: item.sessionsCount ?? itemMeta?.sessionsCount ?? null,
      appointmentRef: item.appointmentRef || itemMeta?.appointmentRef || null,
      staffName: item.staffName || itemMeta?.staffName || null,
      planName: item.planName || itemMeta?.planName || null,
      billingInterval: item.billingInterval || itemMeta?.billingInterval || null,
      validityStartDate:
        item.validityStartDate || itemMeta?.validityStartDate || null,
      validityEndDate:
        item.validityEndDate || itemMeta?.validityEndDate || null,
      rentalStartDate:
        item.rentalStartDate || itemMeta?.rentalStartDate || null,
      rentalEndDate: item.rentalEndDate || itemMeta?.rentalEndDate || null,
      rentalDuration: item.rentalDuration || itemMeta?.rentalDuration || null,
      assetIdentifier: item.assetIdentifier || itemMeta?.assetIdentifier || null,
      securityDepositHeld:
        item.securityDepositHeld != null
          ? Number(item.securityDepositHeld)
          : null,
      itemCondition: item.condition || itemMeta?.condition || null,
    };

    return {
      lineNumber: idx + 1,
      name:
        item.name ||
        item.description ||
        item.product?.name ||
        item.inventoryUnit?.barcodeSku ||
        item.retailSku?.sku ||
        item.itemType ||
        'Item',
      description: item.description !== item.name ? item.description : null,
      quantity: rawQty,
      unitSymbol: orderedUnitSymbol || null,
      equivalentBaseQuantity:
        baseQty != null &&
        orderedUnitSymbol &&
        baseUnitSymbol &&
        orderedUnitSymbol.toLowerCase() !== baseUnitSymbol.toLowerCase()
          ? baseQty
          : null,
      equivalentBaseUnitSymbol: baseUnitSymbol || null,
      unitPrice: rate,
      pricingUnitSymbol: itemMeta?.priceUnitSymbol || orderedUnitSymbol || null,
      grossMrp: item.grossMrp != null ? Number(item.grossMrp) : null,
      productDiscount:
        item.productDiscount != null ? Number(item.productDiscount) : null,
      taxableAmount: lineTotal,
      taxRatePercent: taxRate,
      taxAmount: taxAmt,
      taxClassification,
      lineTotal,
      commerceMetadata: commerceMeta,
    };
  });

  const orderMeta = typeof o.meta === 'object' ? o.meta : {};
  const commerceMetadata: UniversalCommerceMetadata = {
    tableNumber: o.fulfillment?.resourceId || o.tableNumber || orderMeta?.tableNumber || null,
    orderType: o.fulfillment?.orderType || o.orderType || orderMeta?.orderType || null,
    kotNumber: o.kotNumber || orderMeta?.kotNumber || null,
    rentalStartDate: o.rentalWindow?.pickupDate || o.rentalStartDate || null,
    rentalEndDate: o.rentalWindow?.returnDueDate || o.returnDueDate || null,
    rentalDuration: o.rentalDuration || null,
    securityDepositHeld:
      o.depositTotal != null
        ? Number(o.depositTotal)
        : o.totals?.depositTotal != null
          ? Number(o.totals.depositTotal)
          : null,
    returnEventNumber: ret?.id || null,
    returnReason: ret?.reasonCode || ret?.notes || null,
  };

  const subtotalNet = Number(o.subtotal ?? o.totals?.subtotal ?? 0);
  const taxTotal = Number(o.taxTotal ?? o.totals?.taxTotal ?? 0);
  const grossMrpTotal =
    o.grossMrpTotal ??
    o.totals?.grossMrp ??
    mappedItems.reduce((s, i) => s + (i.grossMrp ? i.grossMrp * i.quantity : i.lineTotal), 0);
  const prodDiscountTotal =
    o.productDiscountTotal ??
    o.totals?.productDiscount ??
    mappedItems.reduce((s, i) => s + (i.productDiscount ? i.productDiscount * i.quantity : 0), 0);
  const billDiscountTotal = Number(
    o.billDiscountTotal ?? o.discountTotal ?? o.totals?.discountTotal ?? 0,
  );
  const securityDepositTotal =
    commerceMetadata.securityDepositHeld != null
      ? Number(commerceMetadata.securityDepositHeld)
      : 0;
  const roundOff = Number(o.roundOff ?? o.totals?.roundOff ?? 0);
  const netPayable =
    o.total !== undefined
      ? Number(o.total)
      : o.totals?.grandTotal !== undefined
        ? Number(o.totals.grandTotal)
        : Number(
            (
              subtotalNet -
              billDiscountTotal +
              taxTotal +
              securityDepositTotal +
              roundOff
            ).toFixed(2),
          );

  const totals: UniversalInvoiceTotals = {
    grossMrpTotal: grossMrpTotal > subtotalNet ? grossMrpTotal : null,
    productDiscountTotal: prodDiscountTotal > 0 ? prodDiscountTotal : null,
    subtotalNet,
    billDiscountTotal: billDiscountTotal > 0 ? billDiscountTotal : null,
    taxableValue: subtotalNet,
    taxTotal,
    securityDepositTotal: securityDepositTotal > 0 ? securityDepositTotal : null,
    roundOff: roundOff !== 0 ? roundOff : null,
    netPayable,
  };

  const mappedPayments: UniversalPaymentEntry[] = payments.map((p: any) => ({
    method: p.method || 'cash',
    label: p.method ? String(p.method).toUpperCase() : 'CASH',
    amount: Number(p.amount ?? 0),
    status: p.status || 'succeeded',
    transactionReference: p.gatewayRef || p.referenceId || null,
    paidAt: p.createdAt || null,
  }));

  const totalPaid = mappedPayments
    .filter((p) => !p.status || p.status === 'succeeded')
    .reduce((s, p) => s + p.amount, 0);

  const balanceDue = Math.max(0, Number((netPayable - totalPaid).toFixed(2)));

  let status: UniversalInvoiceStatus = 'PAID';
  if (ret) {
    status = ret.status === 'completed' ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  } else if (balanceDue <= 0.009) {
    status = 'PAID';
  } else if (totalPaid > 0) {
    status = 'PARTIALLY_PAID';
  } else {
    status = 'DUE';
  }

  const payment: UniversalInvoicePayment = {
    payments: mappedPayments,
    totalPaid,
    balanceDue,
    changeReturned: o.change != null ? Number(o.change) : null,
    status,
    upiPaymentQr:
      s.upiVpa && balanceDue > 0
        ? {
            vpa: s.upiVpa,
            payeeName: s.upiPayee || s.name || 'Shop',
            amount: balanceDue,
          }
        : null,
  };

  const currencySymbol = input.config?.currencySymbol || '₹';
  const currencyCode = input.config?.currencyCode || 'INR';

  let documentTitle = input.config?.documentTitle;
  if (!documentTitle) {
    if (ret) documentTitle = 'CREDIT MEMO / RETURN RECEIPT';
    else if (o.kind === 'rental' || commerceMetadata.rentalStartDate)
      documentTitle = 'RENTAL INVOICE';
    else if (o.kind === 'service' || mappedItems.some((i) => i.commerceMetadata?.sessionsCount))
      documentTitle = 'SERVICE INVOICE';
    else if (o.kind === 'subscription' || mappedItems.some((i) => i.commerceMetadata?.validityStartDate))
      documentTitle = 'SUBSCRIPTION INVOICE';
    else if (o.kind === 'restaurant' || commerceMetadata.tableNumber)
      documentTitle = 'RESTAURANT RECEIPT';
    else documentTitle = 'TAX INVOICE';
  }

  const config: UniversalInvoiceConfig = {
    currencySymbol,
    currencyCode,
    documentTitle,
    footerNote: input.config?.footerNote ?? 'Thank you for your business!',
    termsAndConditions: input.config?.termsAndConditions ?? null,
    returnPolicyNote: input.config?.returnPolicyNote ?? null,
    showBarcode: input.config?.showBarcode ?? true,
  };

  return {
    header,
    customer,
    items: mappedItems,
    commerceMetadata,
    totals,
    payment,
    config,
    notes: o.notes || null,
  };
}
