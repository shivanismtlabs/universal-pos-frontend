"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import {
  DiningEmpty,
  DiningShell,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/modal-frame";

function guestUrl(token: string) {
  if (typeof window === "undefined") return `/order/${token}`;
  return `${window.location.origin}/order/${token}`;
}

function qrSrc(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
}

export default function DiningQrPage() {
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed = hasCapability("QR_ORDER");
  const [printToken, setPrintToken] = useState<{
    name: string;
    token: string;
  } | null>(null);

  const tables = useQuery({
    queryKey: ["restaurant-tables", locationId],
    queryFn: () => restaurantApi.tables(locationId),
    enabled: allowed && Boolean(locationId),
  });

  if (!allowed) {
    return (
      <DiningShell title="QR menu" subtitle="Turn on QR ordering first.">
        <DiningEmpty
          title="QR ordering is off"
          detail="Enable QR guest order in Dining → Setup, and the QR ordering capability."
        />
      </DiningShell>
    );
  }

  const list = (tables.data ?? []).filter((t) => t.qrToken);

  return (
    <DiningShell
      title="QR menu"
      subtitle="Print a table QR. Guests scan, order from the digital menu, and pay at the counter."
    >
      {!list.length ? (
        <DiningEmpty
          title="No table QR yet"
          detail="Add tables under Dining → Tables. Each table gets a guest link automatically."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => {
            const url = guestUrl(t.qrToken!);
            return (
              <li
                key={t.id}
                className="rounded-xl border border-[#e2e8f0] bg-white p-4"
              >
                <p className="text-sm font-semibold text-[#0b1f33]">{t.name}</p>
                <p className="text-xs capitalize text-[#8b9bb0]">{t.status}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc(url)}
                  alt=""
                  className="mx-auto my-3 h-36 w-36"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(url);
                      toast.success("Guest link copied");
                    }}
                  >
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() =>
                      setPrintToken({ name: t.name, token: t.qrToken! })
                    }
                  >
                    Print
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {printToken ? (
        <ModalFrame
          title={`Print ${printToken.name}`}
          subtitle="Tape this on the table. Guests scan to open the digital menu."
          onClose={() => setPrintToken(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPrintToken(null)}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const url = guestUrl(printToken.token);
                  const w = window.open("", "_blank");
                  if (!w) return;
                  w.document.write(
                    `<html><body style="font-family:sans-serif;text-align:center;padding:24px">
                      <p style="letter-spacing:.12em;font-size:12px;color:#1a56db">UNIVERSAL POS</p>
                      <h1>${printToken.name}</h1>
                      <p>Scan to order · pay at counter</p>
                      <img src="${qrSrc(url)}" width="280" height="280" />
                    </body></html>`,
                  );
                  w.document.close();
                  w.focus();
                  w.print();
                }}
              >
                Print QR
              </Button>
            </div>
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc(guestUrl(printToken.token))}
            alt=""
            className="mx-auto h-52 w-52"
          />
        </ModalFrame>
      ) : null}
    </DiningShell>
  );
}
