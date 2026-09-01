"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type PaymentIntent, type Stripe } from "@stripe/stripe-js";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/utils";

const stripeCache = new Map<string, Promise<Stripe | null>>();

function getStripe(publishableKey: string) {
  let promise = stripeCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripeCache.set(publishableKey, promise);
  }
  return promise;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Props = {
  publishableKey: string;
  clientSecret: string;
  amount: number;
  description: string;
  /** When set, tunes labels and PaymentElement layout for UPI vs card. */
  method?: "card" | "upi";
  onSuccess: (paymentIntentId: string) => Promise<void> | void;
  onClose: () => void;
};

/**
 * After confirmPayment, UPI/3DS often lands on requires_action or processing.
 * Drive next action + short poll so we don't show a false error.
 */
async function settlePaymentIntent(
  stripe: Stripe,
  clientSecret: string,
  initial: PaymentIntent | undefined,
  onStatus?: (msg: string) => void,
): Promise<PaymentIntent | undefined> {
  let intent = initial;

  if (
    intent?.status === "requires_action" ||
    intent?.status === "requires_confirmation"
  ) {
    onStatus?.("Complete UPI / bank verification…");
    const next = await stripe.handleNextAction({ clientSecret });
    if (next.error) {
      throw new Error(next.error.message || "Payment action failed");
    }
    intent = next.paymentIntent ?? undefined;
  }

  for (let i = 0; i < 45 && intent?.status === "processing"; i++) {
    onStatus?.(
      i < 2
        ? "Waiting for UPI confirmation…"
        : `Still waiting for bank… (${i + 1}s)`,
    );
    await sleep(1000);
    const retrieved = await stripe.retrievePaymentIntent(clientSecret);
    intent = retrieved.paymentIntent ?? intent;
  }

  if (
    intent?.status === "requires_action" ||
    intent?.status === "requires_confirmation"
  ) {
    onStatus?.("Additional verification required…");
    const next = await stripe.handleNextAction({ clientSecret });
    if (next.error) {
      throw new Error(next.error.message || "Payment action failed");
    }
    intent = next.paymentIntent ?? undefined;
  }

  return intent;
}

function CheckoutForm({
  clientSecret,
  amount,
  description,
  method,
  onSuccess,
  onClose,
}: Omit<Props, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title =
    method === "upi"
      ? "UPI payment"
      : method === "card"
        ? "Card payment"
        : "Payment";
  const payLabel =
    method === "upi" ? "Confirm UPI" : method === "card" ? "Pay card" : "Pay";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    setStatusMsg("Confirming payment…");

    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/counter`,
        },
      });

      if (result.error) {
        const bits = [
          result.error.message,
          result.error.code ? `(${result.error.code})` : null,
          result.error.decline_code
            ? `decline: ${result.error.decline_code}`
            : null,
        ].filter(Boolean);
        setError(bits.join(" ") || "Payment failed");
        setBusy(false);
        setStatusMsg(null);
        return;
      }

      const intent = await settlePaymentIntent(
        stripe,
        clientSecret,
        result.paymentIntent,
        setStatusMsg,
      );

      if (intent?.status === "succeeded") {
        setStatusMsg("Payment received — finishing sale…");
        await onSuccess(intent.id);
        onClose();
        return;
      }

      if (intent?.status === "processing") {
        setError(
          "Payment is still processing at the bank. Keep this window open, or check the order in a minute.",
        );
        setBusy(false);
        setStatusMsg(null);
        return;
      }

      setError(
        intent?.status === "requires_payment_method"
          ? "Payment was not completed. Try again with UPI or card."
          : `Payment not finished (status: ${intent?.status ?? "unknown"}). Try again or use cash.`,
      );
      setBusy(false);
      setStatusMsg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setBusy(false);
      setStatusMsg(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[#eef1f4] px-3 py-2.5">
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9] hover:text-[#0b1f33]"
          aria-label="Back to payment methods"
          onClick={onClose}
          disabled={busy}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0b1f33]">{title}</p>
          <p className="truncate text-[0.7rem] text-[#5a6b7d]">{description}</p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-[#1a56db]">
          {formatInr(amount)}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="rounded-lg border border-[#e2e8f0] bg-[#fafbfc] p-2.5 [&_.p-AccordionItem]:border-0 [&_.p-Tab]:py-2">
          <PaymentElement
            options={{
              layout: method === "upi" ? "accordion" : "tabs",
              paymentMethodOrder:
                method === "upi"
                  ? ["upi"]
                  : method === "card"
                    ? ["card"]
                    : undefined,
              wallets: {
                applePay: "never",
                googlePay: "never",
                link: "never",
              },
            }}
          />
        </div>

        {statusMsg ? (
          <p className="mt-2 text-xs font-medium text-[#1341a8]">{statusMsg}</p>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs text-[#b91c1c]">{error}</p>
        ) : null}

        {method === "upi" ? (
          <p className="mt-2 text-[0.65rem] leading-snug text-[#8b9bb0]">
            Customer scans the QR with any UPI app. Sale completes after bank
            confirmation.
          </p>
        ) : null}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-[#eef1f4] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 flex-1 text-sm"
            disabled={busy}
            onClick={onClose}
          >
            Back
          </Button>
          <Button
            type="submit"
            className="h-9 flex-1 text-sm font-semibold"
            disabled={!stripe || busy}
          >
            {busy ? "Processing…" : `${payLabel} · ${formatInr(amount)}`}
          </Button>
        </div>
        {method === "card" ? (
          <p className="text-center text-[0.6rem] text-[#9ca3af]">
            Test card: 4242 4242 4242 4242 · any future expiry · any CVC
          </p>
        ) : null}
      </footer>
    </form>
  );
}

export function StripeCheckoutModal(props: Props) {
  const stripePromise = useMemo(
    () => getStripe(props.publishableKey),
    [props.publishableKey],
  );

  const panelWidth =
    props.method === "upi" ? "max-w-[21rem]" : "max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/40"
        aria-label="Close"
        onClick={props.onClose}
      />
      <div
        className={`relative z-10 flex w-full ${panelWidth} max-h-[min(26rem,88dvh)] flex-col overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: props.clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#1a56db",
                borderRadius: "8px",
                spacingUnit: "3px",
                fontSizeBase: "14px",
              },
              rules: {
                ".AccordionItem": {
                  border: "none",
                  boxShadow: "none",
                },
                ".Tab": {
                  padding: "8px 10px",
                },
              },
            },
          }}
        >
          <CheckoutForm
            clientSecret={props.clientSecret}
            amount={props.amount}
            description={props.description}
            method={props.method}
            onSuccess={props.onSuccess}
            onClose={props.onClose}
          />
        </Elements>
      </div>
    </div>
  );
}
