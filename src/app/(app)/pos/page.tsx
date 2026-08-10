import { redirect } from "next/navigation";

/**
 * Legacy `/pos` → shop language `/counter` (bookmarks & old links).
 */
export default async function PosLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value != null && value !== "") {
      qs.set(key, value);
    }
  }
  const q = qs.toString();
  redirect(q ? `/counter?${q}` : "/counter");
}
