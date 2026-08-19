import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[#050b1c] text-white/70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
