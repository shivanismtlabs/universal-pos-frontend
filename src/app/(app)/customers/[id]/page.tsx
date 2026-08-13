"use client";

import Link from "next/link";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { CustomerCrmPanel } from "@/components/customer-crm-panel";

/** Durable CRM profile URL — /customers/[id] */
export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Customer"
        subtitle="Durable profile URL for CRM, payments, membership, and activity."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href={`/customers?id=${id}`}>Back to list</Link>
          </Button>
        }
      />
      <CustomerCrmPanel customerId={id} />
    </div>
  );
}
