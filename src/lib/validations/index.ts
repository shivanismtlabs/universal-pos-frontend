import { z } from "zod";

/** Matches backend IsStrongPassword (8–72, upper, lower, number, special) */
export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a special character");

/** Any country: optional +, then digits only (7–15 digit total). No spaces or symbols. */
export const phoneSchema = z
  .string()
  .trim()
  .max(18, "Phone is too long")
  .refine(
    (v) => {
      if (!/^\+?\d+$/.test(v)) return false;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
    { message: "Enter digits only (7–15), no spaces or symbols" },
  );

/** @deprecated use phoneSchema — kept for older imports */
export const indianPhoneSchema = phoneSchema;

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(50)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase kebab-case (e.g. demo-shop)",
  );

/** Person / display name — letters and single spaces only (no numbers or symbols) */
export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(255, "Name is too long")
  .refine((v) => v.trim().length >= 2, "Enter a real name (not only spaces)")
  .refine(
    (v) => /[A-Za-z\u0900-\u097F]/.test(v),
    "Name must include letters",
  )
  .refine(
    (v) => /^[A-Za-z\u0900-\u097F]+(?: [A-Za-z\u0900-\u097F]+)*$/.test(v),
    "Use letters only (no numbers or special characters)",
  );

/** Zoho-style identity signup (before organization setup) */
export const signupIdentitySchema = z
  .object({
    fullName: personNameSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Email is required")
      .email("Enter a valid email")
      .max(255),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    phone: phoneSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (v) => {
      const local = v.email.split("@")[0]?.toLowerCase() ?? "";
      return (
        !local || local.length < 2 || !v.password.toLowerCase().includes(local)
      );
    },
    {
      message: "Password must not contain your email name",
      path: ["password"],
    },
  );
export type SignupIdentityInput = z.infer<typeof signupIdentitySchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .max(255),
  password: z.string().min(1, "Password is required").max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Shop name only — slug/store derived on submit */
export const registerTenantSchema = z
  .object({
    tenantName: z.string().trim().min(2, "Shop name is required").max(100),
    adminFullName: z.string().trim().min(2, "Name is required").max(255),
    adminEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email")
      .max(255),
    adminPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    adminPhone: phoneSchema.optional().or(z.literal("")),
  })
  .refine((v) => v.adminPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (v) => {
      const local = v.adminEmail.split("@")[0]?.toLowerCase() ?? "";
      return !local || !v.adminPassword.toLowerCase().includes(local);
    },
    {
      message: "Password must not contain email local-part",
      path: ["adminPassword"],
    },
  );
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export function slugifyShopName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length >= 2 ? base : `shop-${Date.now().toString(36)}`;
}

export const registerUserSchema = z
  .object({
    tenantSlug: tenantSlugSchema,
    fullName: z.string().trim().min(2).max(255),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email")
      .max(255),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    phone: phoneSchema.optional().or(z.literal("")),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (v) => {
      const local = v.email.split("@")[0]?.toLowerCase() ?? "";
      return !local || !v.password.toLowerCase().includes(local);
    },
    {
      message: "Password must not contain email local-part",
      path: ["password"],
    },
  )
  .refine(
    (v) => !v.password.toLowerCase().includes(v.tenantSlug.toLowerCase()),
    {
      message: "Password must not contain tenant slug",
      path: ["password"],
    },
  );
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export function passwordStrength(
  password: string,
  opts?: { email?: string; slug?: string },
) {
  const local = opts?.email?.split("@")[0]?.toLowerCase() ?? "";
  const slug = opts?.slug?.toLowerCase() ?? "";
  const checks = {
    length: password.length >= 8 && password.length <= 72,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    noEmailPart:
      !local || local.length < 2 || !password.toLowerCase().includes(local),
    noSlug:
      !slug || slug.length < 2 || !password.toLowerCase().includes(slug),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { checks, score, ok: score === 7 };
}
export const createCustomerSchema = z.object({
  fullName: personNameSchema,
  phone: phoneSchema,
  email: z
    .string()
    .email("Invalid email")
    .max(255)
    .optional()
    .or(z.literal("")),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  marketingOptIn: z.boolean(),
  /** Empty = unlimited */
  creditLimit: z.string().optional().or(z.literal("")),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export function parseCreditLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const optionalMeasure = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  });

export const createMeasurementSchema = z
  .object({
    heightCm: optionalMeasure,
    weightKg: optionalMeasure,
    chest: optionalMeasure,
    waist: optionalMeasure,
    inseam: optionalMeasure,
    sleeve: optionalMeasure,
    shoeSize: z.string().max(20).optional().or(z.literal("")),
  })
  .refine(
    (v) =>
      v.heightCm != null ||
      v.weightKg != null ||
      v.chest != null ||
      v.waist != null ||
      v.inseam != null ||
      v.sleeve != null ||
      Boolean(v.shoeSize && v.shoeSize.length > 0),
    { message: "Enter at least one measurement", path: ["heightCm"] },
  );
export type CreateMeasurementInput = z.output<typeof createMeasurementSchema>;

export const createOrderSchema = z.object({
  storeId: z.string().uuid("Select a store"),
  customerId: z.string().uuid("Select a customer"),
  partyId: z.string().uuid().optional().or(z.literal("")),
  eventDate: z.string().optional().or(z.literal("")),
  pickupDate: z.string().optional().or(z.literal("")),
  returnDueDate: z.string().optional().or(z.literal("")),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["cash", "card", "upi", "collect_later"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  type: z.enum(["payment", "deposit"]),
  idempotencyKey: z.string().min(8, "Idempotency key required"),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(100, "Category name is too long"),
});

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .max(100, "Brand name is too long"),
});

export const createRoleNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name must be at least 2 characters")
    .max(100, "Role name is too long"),
});

export const positiveQtySchema = z.coerce
  .number({ invalid_type_error: "Enter a valid quantity" })
  .positive("Quantity must be greater than 0")
  .max(99_999_999, "Quantity is too large");

/** Stock adjust delta — any non-zero number (negative removes stock). */
export const adjustDeltaSchema = z.coerce
  .number({ invalid_type_error: "Enter a valid quantity" })
  .min(-99_999_999, "Quantity is too large")
  .max(99_999_999, "Quantity is too large")
  .refine((n) => n !== 0, {
    message: "Quantity change cannot be zero",
  });

export const stockMoveSchema = z.object({
  locationId: z.string().min(1, "Select a location"),
  stockLevelId: z.string().min(1, "Select an item"),
  qty: positiveQtySchema,
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const stockAdjustFormSchema = z.object({
  delta: adjustDeltaSchema,
  reason: z.string().max(500).optional().or(z.literal("")),
});

export const stockTransferSchema = z
  .object({
    fromLocationId: z.string().min(1, "Select from location"),
    toLocationId: z.string().min(1, "Select to location"),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          qty: positiveQtySchema,
        }),
      )
      .min(1, "Add at least one product with quantity greater than 0"),
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    message: "From and to locations must be different",
    path: ["toLocationId"],
  });

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Coupon code must be at least 2 characters")
      .max(32, "Coupon code is too long"),
    description: z.string().trim().max(255).optional().or(z.literal("")),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.coerce
      .number({ invalid_type_error: "Enter a valid discount value" })
      .positive("Discount must be greater than 0"),
    minOrderAmount: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => {
        if (!v?.trim()) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      })
      .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
        message: "Enter a valid minimum order amount",
      }),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percent") {
      if (v.discountValue > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountValue"],
          message: "Percent off cannot exceed 100",
        });
      }
      return;
    }
    if (v.discountValue > 99_999_999.99) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Amount is too large",
      });
    }
    if (Math.round(v.discountValue * 100) / 100 !== v.discountValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Amount can have at most 2 decimal places",
      });
    }
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

const sellUnitEnum = z.enum(["pcs", "pack", "kg", "g", "L", "ml"]);

/** Sale product — Zoho-style inventory item create. */
export const addSaleProductSchema = z
  .object({
    title: z.string().trim().min(2, "Name needs at least 2 characters").max(255),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    categoryId: z.string().uuid("Select a category"),
    sku: z
      .string()
      .trim()
      .min(2, "SKU must be at least 2 characters")
      .max(18, "SKU must be at most 18 characters")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/,
        "SKU: use letters, numbers, and . _ - / only",
      ),
    sellUnit: sellUnitEnum.default("pcs"),
    price: z.coerce
      .number({ invalid_type_error: "Enter a valid selling price" })
      .positive("Selling price must be greater than 0")
      .max(9_999_999.99, "Price is too large")
      .refine((n) => Math.round(n * 100) / 100 === n, {
        message: "Price can have at most 2 decimal places",
      }),
    qty: z.coerce
      .number({ invalid_type_error: "Enter a valid quantity" })
      .min(0, "Quantity cannot be negative")
      .max(99_999_999, "Quantity is too large"),
    manufacturer: z.string().trim().max(120).optional().or(z.literal("")),
    barcode: z.string().trim().max(32).optional().or(z.literal("")),
    costPrice: z.coerce
      .number({ invalid_type_error: "Enter a valid cost" })
      .min(0)
      .max(9_999_999.99)
      .optional()
      .or(z.nan())
      .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
    reorderPoint: z.coerce
      .number({ invalid_type_error: "Enter a valid reorder point" })
      .min(0)
      .max(99_999_999)
      .optional()
      .or(z.nan())
      .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
    hsnOrSac: z.string().trim().max(16).optional().or(z.literal("")),
    trackInventory: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (!v.trackInventory) return;
    // Opening stock may be 0; only reject negatives (handled by .min(0)) and unit rules.
    const whole =
      v.sellUnit === "pcs" ||
      v.sellUnit === "pack" ||
      v.sellUnit === "g" ||
      v.sellUnit === "ml";
    if (whole && !Number.isInteger(v.qty)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qty"],
        message:
          v.sellUnit === "pcs" || v.sellUnit === "pack"
            ? `Opening stock for ${v.sellUnit} must be a whole number`
            : `Quantity for ${v.sellUnit} must be a whole number`,
      });
      return;
    }
    if (!whole) {
      const rounded = Math.round(v.qty * 1000) / 1000;
      if (Math.abs(rounded - v.qty) > 1e-9) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["qty"],
          message: `Opening stock for ${v.sellUnit} can have at most 3 decimal places`,
        });
      }
    }
  });
export type AddSaleProductInput = z.infer<typeof addSaleProductSchema>;

/** Edit sale product (SKU not changed in inline editor). */
export const updateSaleProductSchema = z
  .object({
    title: z.string().trim().min(2, "Title needs at least 2 characters").max(255),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    categoryId: z.string().uuid("Select a category").optional().or(z.literal("")),
    sellUnit: sellUnitEnum.default("pcs"),
    price: z.coerce
      .number({ invalid_type_error: "Enter a valid price" })
      .positive("Price must be greater than 0")
      .max(9_999_999.99, "Price is too large")
      .refine((n) => Math.round(n * 100) / 100 === n, {
        message: "Price can have at most 2 decimal places",
      }),
    qty: z.coerce
      .number({ invalid_type_error: "Enter a valid quantity" })
      .min(0, "Quantity cannot be negative")
      .max(99_999_999, "Quantity is too large"),
  })
  .superRefine((v, ctx) => {
    const whole =
      v.sellUnit === "pcs" ||
      v.sellUnit === "pack" ||
      v.sellUnit === "g" ||
      v.sellUnit === "ml";
    if (whole && !Number.isInteger(v.qty)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qty"],
        message: `Quantity for ${v.sellUnit} must be a whole number`,
      });
      return;
    }
    if (!whole) {
      const rounded = Math.round(v.qty * 1000) / 1000;
      if (Math.abs(rounded - v.qty) > 1e-9) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["qty"],
          message: `Quantity for ${v.sellUnit} can have at most 3 decimal places`,
        });
      }
    }
});

export const createProductStyleSchema = z.object({
  name: z.string().min(2).max(255),
  styleCode: z.string().min(1).max(64),
  color: z.string().max(64).optional().or(z.literal("")),
  isRental: z.boolean(),
  hsnSac: z.string().max(16).optional().or(z.literal("")),
});

export const createInventoryUnitSchema = z.object({
  storeId: z.string().uuid(),
  productStyleId: z.string().uuid(),
  barcodeSku: z.string().min(1).max(64),
  size: z.string().min(1).max(32),
  condition: z.enum(["NEW", "GOOD", "DAMAGED"]),
  ownership: z.enum(["own", "sub_rental", "network"]),
  rentalPrice: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0),
});

export const createPartySchema = z.object({
  name: z.string().min(2).max(255),
  eventDate: z.string().optional().or(z.literal("")),
  primaryCustomerId: z.string().uuid().optional().or(z.literal("")),
});
export type CreatePartyInput = z.infer<typeof createPartySchema>;

export const addPartyMemberSchema = z.object({
  customerId: z.string().uuid("Select a customer"),
  roleLabel: z.string().max(100).optional().or(z.literal("")),
});
export type AddPartyMemberInput = z.infer<typeof addPartyMemberSchema>;

export const addOrderItemSchema = z.object({
  itemType: z.enum(["rental_unit", "retail", "special"]),
  inventoryUnitId: z.string().uuid().optional().or(z.literal("")),
  retailSkuId: z.string().uuid().optional().or(z.literal("")),
  unitPrice: z.coerce.number().min(0).optional(),
  size: z.string().max(50).optional().or(z.literal("")),
});
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const createAppointmentSchema = z.object({
  storeId: z.string().uuid("Select a store"),
  customerId: z.string().uuid("Select a customer"),
  orderId: z.string().uuid().optional().or(z.literal("")),
  aptType: z.enum([
    "fitting",
    "pickup",
    "return",
    "service",
    "consultation",
    "other",
  ]),
  serviceName: z.string().max(200).optional().or(z.literal("")),
  resourceId: z.string().uuid().optional().or(z.literal("")),
  startsAt: z.string().min(1, "Start time required"),
  endsAt: z.string().optional().or(z.literal("")),
  fittingNotes: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const createReturnSchema = z.object({
  orderId: z.string().uuid("Select an order"),
  inventoryUnitId: z.string().uuid("Select a unit"),
  cleaningRequired: z.boolean(),
  inspectNotes: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const availabilityQuerySchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  productStyleId: z.string().uuid().optional().or(z.literal("")),
  storeId: z.string().uuid().optional().or(z.literal("")),
  size: z.string().max(32).optional().or(z.literal("")),
});

/** ---- Shared field helpers (use across app forms) ---- */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .max(255);

export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .max(255)
  .optional()
  .or(z.literal(""));

export const optionalPhoneSchema = phoneSchema.optional().or(z.literal(""));

export const pinCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code");

export const gstinSchema = z
  .string()
  .trim()
  .refine(
    (v) => !v || /^[0-9A-Z]{15}$/i.test(v.replace(/\s/g, "")),
    "GSTIN must be 15 characters (letters/numbers)",
  );

export const moneyAmountSchema = z.coerce
  .number({ invalid_type_error: "Enter a valid amount" })
  .positive("Amount must be greater than 0")
  .max(99_999_999.99, "Amount is too large")
  .refine((n) => Math.round(n * 100) / 100 === n, {
    message: "Amount can have at most 2 decimal places",
  });

export const nonNegMoneySchema = z.coerce
  .number({ invalid_type_error: "Enter a valid amount" })
  .min(0, "Cannot be negative")
  .max(99_999_999.99, "Amount is too large");

export const issueGiftCardSchema = z.object({
  initialValue: moneyAmountSchema,
  code: z
    .string()
    .trim()
    .max(32, "Code is too long")
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v.length >= 2, {
      message: "Code must be at least 2 characters",
    }),
});

export const createSupplierInvoiceSchema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  subtotal: moneyAmountSchema,
  taxTotal: nonNegMoneySchema,
  dueDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "Pick a valid due date",
    }),
});

export const paySupplierInvoiceSchema = z.object({
  amount: moneyAmountSchema,
  method: z.string().min(1, "Select a payment method"),
  kind: z.enum(["payment", "refund"]),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function zodMessages(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => i.message))];
}

export const createCatalogProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Product name must be at least 2 characters")
      .max(255, "Product name is too long")
      .refine(
        (v) => v.trim().length >= 2,
        "Enter a real name (not only spaces)",
      ),
    shortName: z
      .string()
      .trim()
      .max(80, "Short name is too long")
      .optional()
      .or(z.literal("")),
    kind: z.enum(["physical", "service", "digital", "bundle", "rental"]),
    status: z.enum(["active", "inactive", "draft", "archived"]),
    skuCode: z
      .string()
      .trim()
      .max(18, "SKU must be 18 characters or less")
      .optional()
      .or(z.literal(""))
      .refine(
        (v) =>
          !v ||
          (/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(v) && v.length >= 2),
        "SKU: 2+ chars, letters/numbers and . _ - / only",
      ),
    barcode: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || (v.length >= 4 && v.length <= 64),
        "Barcode must be 4–64 characters",
      ),
    internalCode: z
      .string()
      .trim()
      .max(64, "Internal code is too long")
      .optional()
      .or(z.literal("")),
    shortDescription: z
      .string()
      .trim()
      .max(500, "Short description is too long")
      .optional()
      .or(z.literal("")),
    description: z
      .string()
      .trim()
      .max(5000, "Description is too long")
      .optional()
      .or(z.literal("")),
    taxCode: z
      .string()
      .trim()
      .max(32, "HSN / SAC is too long")
      .optional()
      .or(z.literal("")),
    basePrice: z.coerce
      .number({ invalid_type_error: "Enter a valid selling price" })
      .min(0, "Price cannot be negative")
      .max(9_999_999.99),
    costPrice: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => {
        if (!v?.trim()) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      })
      .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
        message: "Enter a valid cost price",
      }),
    mrp: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => {
        if (!v?.trim()) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      })
      .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
        message: "Enter a valid MRP",
      }),
    taxRatePercent: z.coerce
      .number({ invalid_type_error: "Enter a valid tax %" })
      .min(0, "Tax % cannot be negative")
      .max(40, "Tax % looks too high"),
    unitOfMeasure: z
      .string()
      .trim()
      .min(1, "Select a unit")
      .max(16, "Unit code is too long"),
    trackInventory: z.boolean(),
    openingQty: z.string().optional().or(z.literal("")),
    reorderPoint: z.string().optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.trackInventory) {
      const raw = (v.openingQty ?? "").trim();
      // Empty allowed — create treats blank as 0 Stock on Hand.
      if (raw !== "") {
        const q = Number(raw);
        if (!Number.isFinite(q) || q < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["openingQty"],
            message: "Opening quantity cannot be negative",
          });
        }
      }

      const rp = (v.reorderPoint ?? "").trim();
      if (rp !== "") {
        const n = Number(rp);
        if (!Number.isFinite(n) || n < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reorderPoint"],
            message: "Reorder point cannot be negative",
          });
        } else if (!Number.isInteger(n)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reorderPoint"],
            message: "Reorder point must be a whole number",
          });
        }
      }
    }

    if (
      v.mrp !== undefined &&
      Number.isFinite(v.mrp) &&
      Number.isFinite(v.basePrice) &&
      v.mrp + 1e-9 < v.basePrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mrp"],
        message: "MRP should be at least the selling rate",
      });
    }
  });
export type CreateCatalogProductInput = z.infer<
  typeof createCatalogProductSchema
>;

/** Required custom / meta fields on New/Edit Item (keys on `extraFields`). */
export function validateRequiredProductExtraFields(
  fields: { key: string; label: string; required?: boolean; type?: string }[],
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required) continue;
    if (f.type === "boolean") continue;
    const v = (values[f.key] ?? "").trim();
    if (!v) out[f.key] = `${f.label} is required`;
  }
  return out;
}

export const inviteStaffSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  phone: optionalPhoneSchema,
  roleCode: z.string().min(1, "Select a role"),
  primaryStoreId: z.string().optional().or(z.literal("")),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Supplier name must be at least 2 characters")
    .max(255),
  contact: z.string().trim().max(120).optional().or(z.literal("")),
  phone: optionalPhoneSchema,
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const createExpenseSchema = z.object({
  amount: moneyAmountSchema,
  spentAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  categoryId: z.string().optional().or(z.literal("")),
  paymentMethod: z.enum([
    "cash",
    "upi",
    "card",
    "bank_transfer",
    "petty_cash",
    "other",
  ]),
  payee: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const pettyCashAmountSchema = z.object({
  amount: moneyAmountSchema,
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const expenseCategoryNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(100),
});

export const settingsBrandSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters")
    .max(100),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (e.g. INR)"),
  locale: z.string().trim().min(2, "Locale is required").max(20),
  timezone: z.string().trim().min(2, "Timezone is required").max(64),
});

export const settingsTaxSchema = z.object({
  taxMode: z.enum(["in_gst", "simple", "vat", "none"]),
  ratePercent: z.coerce
    .number({ invalid_type_error: "Enter a valid tax rate" })
    .min(0)
    .max(40),
  inclusive: z.boolean(),
  gstin: gstinSchema.optional().or(z.literal("")),
});

export const settingsCounterSchema = z.object({
  maxDiscount: z.coerce
    .number({ invalid_type_error: "Enter a valid discount %" })
    .min(0)
    .max(100),
  pinSwitchEnabled: z.boolean(),
  upiVpa: z
    .string()
    .trim()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+$/.test(v),
      "UPI ID must look like name@bank",
    ),
  upiPayeeName: z.string().trim().max(100).optional().or(z.literal("")),
});

export const forgotPasswordEmailSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"),
    password: strongPasswordSchema,
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
});
