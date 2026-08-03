"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
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

type Props = {
  publishableKey: string;
  clientSecret: string;
  amount: number;
  description: string;
  onSuccess: (paymentIntentId: string) => Promise<void> | void;
  onClose: () => void;
};

function CheckoutForm({
  amount,
  description,
  onSuccess,
  onClose,
}: Omit<Props, "publishableKey" | "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/pos`,
      },
    });

    if (result.error) {
      setError(result.error.message ?? "Payment failed");
      setBusy(false);
      return;
    }

    const intent = result.paymentIntent;
    if (intent?.status === "succeeded") {
      try {
        await onSuccess(intent.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verify failed");
        setBusy(false);
      }
      return;
    }

    setError(`Unexpected status: ${intent?.status ?? "unknown"}`);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
          Stripe test checkout
        </p>
        <p className="mt-1 text-sm text-[#111827]">{description}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {formatInr(amount)}
        </p>
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

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
        Test card: 4242 4242 4242 4242 · any future expiry · any CVC
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: props.clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#0f766e",
                borderRadius: "8px",
              },
            },
          }}
        >
          <CheckoutForm
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
