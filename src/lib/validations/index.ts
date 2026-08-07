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

/** Any country: 7–15 digits; +, spaces, dashes, () allowed */
export const phoneSchema = z
  .string()
  .trim()
  .max(22, "Phone is too long")
  .refine(
    (v) => {
      if (!/^\+?[\d\s().-]+$/.test(v)) return false;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
    { message: "Enter a valid phone number (any country)" },
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

export const loginSchema = z.object({
  tenantSlug: tenantSlugSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .max(255),
  password: z.string().min(1, "Password is required").max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerTenantSchema = z
  .object({
    tenantName: z.string().trim().min(2).max(100),
    tenantSlug: tenantSlugSchema,
    storeName: z.string().trim().min(2).max(100),
    adminFullName: z.string().trim().min(2).max(255),
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
  )
  .refine(
    (v) => !v.adminPassword.toLowerCase().includes(v.tenantSlug.toLowerCase()),
    {
      message: "Password must not contain tenant slug",
      path: ["adminPassword"],
    },
  );
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

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
  fullName: z.string().min(2, "Name is required").max(255),
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
  notes: z.string().max(2000).optional().or(z.literal("")),
  marketingOptIn: z.boolean(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

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
  name: z.string().min(2).max(100),
});

const sellUnitEnum = z.enum(["pcs", "pack", "kg", "g", "L", "ml"]);

/** Sale / grocery product — unit-aware qty (kg/L decimals; pcs whole). */
export const addSaleProductSchema = z
  .object({
    title: z.string().trim().min(2, "Title needs at least 2 characters").max(255),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    categoryId: z.string().uuid("Select a category"),
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(100)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/,
        "SKU: use letters, numbers, and . _ - / only",
      ),
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
    const whole = v.sellUnit === "pcs" || v.sellUnit === "pack" || v.sellUnit === "g" || v.sellUnit === "ml";
    if (whole && !Number.isInteger(v.qty)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qty"],
        message:
          v.sellUnit === "pcs" || v.sellUnit === "pack"
            ? `Quantity for ${v.sellUnit} must be a whole number (no decimals)`
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
          message: `Quantity for ${v.sellUnit} can have at most 3 decimal places (e.g. 1.250)`,
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
  aptType: z.enum(["fitting", "pickup", "return"]),
  startsAt: z.string().min(1, "Start time required"),
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
