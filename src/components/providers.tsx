"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { Toaster } from "sonner";
import { NotificationPopupProvider } from "@/components/notification-popup";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <NotificationPopupProvider>
        {children}
        <Toaster
          theme="light"
          position="top-right"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "bg-white border border-[#d9e0ea] text-[#0b1f33] shadow-lg rounded-lg",
            },
          }}
        />
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </NotificationPopupProvider>
    </QueryClientProvider>
  );
}
