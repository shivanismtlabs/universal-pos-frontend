import { redirect } from "next/navigation";

/** Restaurant users often expect /kot — same screen as Kitchen display. */
export default function KotPage() {
  redirect("/kitchen");
}
