"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type PaymentIntent, type Stripe } from "@stripe/stripe-js";
import { X } from "lucide-react";
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

  // UPI often sits in "processing" until the bank confirms
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

  // One more next-action pass if bank bounced us back
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
  onSuccess,
  onClose,
}: Omit<Props, "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          "Payment is still processing at the bank. Keep this window open, or check the order in a minute and verify if it completed.",
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
          Card / UPI checkout
        </p>
        <p className="mt-1 text-sm text-[#111827]">{description}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-[#1a56db]">
          {formatInr(amount)}
        </p>
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: {
              applePay: "never",
              googlePay: "never",
              link: "never",
            },
          }}
        />
      </div>

      {statusMsg ? (
        <p className="text-sm font-medium text-[#1341a8]">{statusMsg}</p>
      ) : null}
      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={!stripe || busy}>
          {busy ? "Processing…" : `Pay ${formatInr(amount)}`}
        </Button>
      </div>

      <p className="text-center text-[0.65rem] text-[#9ca3af]">
        UPI: scan the QR in this window. Card test: 4242 4242 4242 4242 · any
        future expiry · any CVC
      </p>
    </form>
  );
}

export function StripeCheckoutModal(props: Props) {
  const stripePromise = useMemo(
    () => getStripe(props.publishableKey),
    [props.publishableKey],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#111827]/45"
        aria-label="Close"
        onClick={props.onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <button
          type="button"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
          aria-label="Close"
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: props.clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#1a56db",
                borderRadius: "8px",
              },
            },
          }}
        >
          <CheckoutForm
            clientSecret={props.clientSecret}
            amount={props.amount}
            description={props.description}
            onSuccess={props.onSuccess}
            onClose={props.onClose}
          />
        </Elements>
      </div>
    </div>
  );
}
