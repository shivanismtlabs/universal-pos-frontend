"use client";

import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[#0b1220] text-white/70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
