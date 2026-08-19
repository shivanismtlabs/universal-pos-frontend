/** Rental / tailoring appointment types */
export const RENTAL_APPOINTMENT_TYPES = [
  { value: "fitting", label: "Fitting" },
  { value: "pickup", label: "Pickup" },
  { value: "return", label: "Return" },
] as const;

/** Salon / service-business appointment types */
export const SERVICE_APPOINTMENT_TYPES = [
  { value: "service", label: "Service" },
  { value: "consultation", label: "Consultation" },
  { value: "other", label: "Other" },
] as const;

export type RentalAppointmentType =
  (typeof RENTAL_APPOINTMENT_TYPES)[number]["value"];
export type ServiceAppointmentType =
  (typeof SERVICE_APPOINTMENT_TYPES)[number]["value"];

const LABELS: Record<string, string> = {
  fitting: "Fitting",
  pickup: "Pickup",
  return: "Return",
  service: "Service",
  consultation: "Consultation",
  other: "Other",
};

export function appointmentTypeLabel(type: string): string {
  return LABELS[type] ?? type;
}

export function appointmentDisplayType(row: {
  aptType: string;
  meta?: { serviceName?: string } | null;
  notes?: string | null;
}): string {
  const fromMeta = row.meta?.serviceName?.trim();
  if (fromMeta) return fromMeta;

  const notes = row.notes?.trim() ?? "";
  const serviceMatch = /^Service:\s*(.+)/m.exec(notes);
  if (serviceMatch?.[1]) return serviceMatch[1].trim();

  return appointmentTypeLabel(row.aptType);
}
