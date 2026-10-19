import { redirect } from "next/navigation";

// proxy.ts already redirects "/" based on session state; this is just the
// fallback if this page is ever reached directly.
export default function Home() {
  redirect("/login");
}
