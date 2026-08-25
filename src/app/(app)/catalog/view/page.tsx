"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { resolveOperatingLocationId } from "@/lib/operating-location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ProductThumb } from "@/components/product-thumb";
import { FoodTypeBadge } from "@/components/food-type-badge";
import { ImageLightbox } from "@/components/image-lightbox";
import { ProductBarcodePreview } from "@/components/product-barcode-preview";
import { EntityRowActions } from "@/components/entity-row-actions";

export default function CatalogProductViewRoute() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading product…</p>}
    >
      <CatalogProductDetailPage />
    </Suspense>
  );
}

function CatalogProductDetailPage() {
  const search = useSearchParams();
  const id = search.get("id")?.trim() || "";
  const tabParam = search.get("tab")?.trim() || "";
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<
    | "overview"
    | "barcode"
    | "variants"
    | "bundle"
    | "batches"
    | "serials"
    | "inventory"
  >(() =>
    tabParam === "barcode" ||
    tabParam === "variants" ||
    tabParam === "bundle" ||
    tabParam === "batches" ||
    tabParam === "serials" ||
    tabParam === "inventory"
      ? tabParam
      : "overview",
  );
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeErr, setBarcodeErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [serialLoc, setSerialLoc] = useState("");
  const { data: boot } = useBootstrap();
  const currentLocationId = useBranchStore((s) => s.currentLocationId);

  useEffect(() => {
    if (
      tabParam === "barcode" ||
      tabParam === "variants" ||
      tabParam === "bundle" ||
      tabParam === "batches" ||
      tabParam === "serials" ||
      tabParam === "inventory"
    ) {
      setTab(tabParam);
    }
  }, [tabParam]);

  const product = useQuery({
    queryKey: ["catalog-product", id],
    queryFn: () => catalogApi.getProduct(id),
    enabled: Boolean(id),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  useEffect(() => {
    if (serialLoc) return;
    const fromBranch = resolveOperatingLocationId({
      currentLocationId,
      locations: boot?.locations,
    });
    if (fromBranch) {
      setSerialLoc(fromBranch);
      return;
    }
    const first = locations.data?.[0]?.id;
    if (first) setSerialLoc(String(first));
  }, [serialLoc, currentLocationId, boot?.locations, locations.data]);

  const p = product.data;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["catalog-product", id] });
    void qc.invalidateQueries({ queryKey: ["catalog-products"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "active" | "inactive" | "draft" | "archived") =>
      catalogApi.setStatus(id, status),
    onSuccess: () => {
      invalidate();
      toast.success("Status updated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  const dup = useMutation({
    mutationFn: () => catalogApi.duplicate(id),
    onSuccess: (row) => {
      toast.success("Duplicated");
      if (row?.id) router.push(`/catalog/view?id=${row.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => catalogApi.remove(id),
    onSuccess: (res) => {
      toast.success(
        res.softDeleted
          ? "Item is in use — archived instead"
          : "Item deleted",
      );
      if (res.deleted) router.push("/catalog");
      else invalidate();
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  const saveBarcode = useMutation({
    mutationFn: async () => {
      const code = barcodeDraft.trim();
      if (!code) throw new Error("Enter or generate a barcode");
      const check = await catalogApi.checkBarcode(code, id);
      if (!check.available) {
        throw new Error(
          check.reason === "duplicate"
            ? "Barcode already exists"
            : "Invalid barcode",
        );
      }
      return catalogApi.updateProduct(id, {
        barcode: check.barcode,
        barcodeType: check.barcodeType || "code128",
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Barcode saved");
      setBarcodeErr(null);
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : e.message;
      setBarcodeErr(msg);
      toast.error(msg);
    },
  });

  const genBarcode = useMutation({
    mutationFn: () => catalogApi.generateBarcode(),
    onSuccess: (r) => {
      setBarcodeDraft(r.barcode);
      setBarcodeErr(null);
      toast.success("Code 128 barcode generated — click Save barcode");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Generate failed"),
  });

  /** Variant form */
  const [vName, setVName] = useState("");
  const [vSize, setVSize] = useState("");
  const [vColor, setVColor] = useState("");
  const [vWeight, setVWeight] = useState("");
  const addVariant = useMutation({
    mutationFn: () =>
      catalogApi.createVariant(id, {
        name: vName.trim(),
        attributes: {
          ...(vSize ? { size: vSize } : {}),
          ...(vColor ? { color: vColor } : {}),
          ...(vWeight ? { weight: vWeight } : {}),
        },
      }),
    onSuccess: () => {
      setVName("");
      setVSize("");
      setVColor("");
      setVWeight("");
      invalidate();
      toast.success("Variant added");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  const delVariant = useMutation({
    mutationFn: (vid: string) => catalogApi.deleteVariant(id, vid),
    onSuccess: () => {
      invalidate();
      toast.success("Variant removed");
    },
  });

  /** Bundle */
  const allProducts = useQuery({
    queryKey: ["catalog-products-all"],
    queryFn: () => catalogApi.listProducts({}),
    enabled: tab === "bundle",
  });
  const [compId, setCompId] = useState("");
  const [compQty, setCompQty] = useState("1");
  const saveBundle = useMutation({
    mutationFn: () => {
      const existing = (p?.bundleLines ?? []).map((l) => ({
        componentProductId: l.componentProductId,
        quantity: l.quantity,
        consumeOnSale: l.consumeOnSale,
        purpose: l.purpose,
        unit: l.unit ?? undefined,
        wastagePercent: l.wastagePercent,
      }));
      if (compId) {
        existing.push({
          componentProductId: compId,
          quantity: Number(compQty) || 1,
          consumeOnSale: p?.kind !== "bundle",
          purpose: p?.kind === "bundle" ? "bundle" : "recipe",
          unit: undefined,
          wastagePercent: undefined,
        });
      }
      return catalogApi.setBundleLines(id, existing);
    },
    onSuccess: () => {
      setCompId("");
      invalidate();
      toast.success("Bundle updated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  /** Batch */
  const [batchCode, setBatchCode] = useState("");
  const [batchLoc, setBatchLoc] = useState("");
  const [batchExp, setBatchExp] = useState("");
  const [batchQty, setBatchQty] = useState("0");
  const addBatch = useMutation({
    mutationFn: () =>
      catalogApi.createBatch(id, {
        batchCode: batchCode.trim(),
        locationId: batchLoc,
        expiresAt: batchExp || undefined,
        qtyOnHand: Number(batchQty) || 0,
      }),
    onSuccess: () => {
      setBatchCode("");
      invalidate();
      toast.success("Batch created");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  /** Serial */
  const [serial, setSerial] = useState("");
  const enableSerial = useMutation({
    mutationFn: () =>
      catalogApi.updateProduct(id, {
        trackInventory: true,
        trackSerial: true,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Serial tracking enabled — register units below");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Could not enable serials"),
  });
  const addSerial = useMutation({
    mutationFn: () => {
      const code = serial.trim();
      if (code.length < 2) {
        throw new Error("Enter a serial number (at least 2 characters)");
      }
      if (!serialLoc) {
        throw new Error("Select a location for this serial");
      }
      return catalogApi.createSerial(id, {
        serial: code,
        locationId: serialLoc,
      });
    },
    onSuccess: async () => {
      setSerial("");
      await qc.invalidateQueries({ queryKey: ["catalog-product", id] });
      toast.success("Serial registered");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Failed"),
  });

  if (!id) {
    return (
      <p className="p-8 text-sm text-rose-600">
        Missing product id.{" "}
        <Link href="/catalog" className="underline">
          Back
        </Link>
      </p>
    );
  }

  if (product.isLoading) {
    return <p className="p-8 text-sm text-[#5a6b7d]">Loading product…</p>;
  }
  if (!p) {
    return (
      <p className="p-8 text-sm text-rose-600">
        Product not found.{" "}
        <Link href="/catalog" className="underline">
          Back
        </Link>
      </p>
    );
  }

  const locs =
    (locations.data as Array<{ id: string; name: string }> | undefined) ??
    p.inventoryByLocation?.map((i) => ({
      id: i.locationId,
      name: i.location?.name ?? i.locationId,
    })) ??
    [];

  const gallery = (
    p.images?.length ? p.images : p.photoUrl ? [p.photoUrl] : []
  ).filter(Boolean) as string[];

  return (
    <div className="space-y-4 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5">
            <ProductThumb
              src={gallery[0]}
              label={p.name}
              size="xl"
              className="rounded border border-[#eef1f4]"
              count={gallery.length}
              onClick={
                gallery.length
                  ? () => setLightbox({ images: gallery, index: 0 })
                  : undefined
              }
            />
            {gallery.length > 1 ? (
              <div className="flex max-w-[11rem] gap-1 overflow-x-auto">
                {gallery.map((src, i) => (
                  <ProductThumb
                    key={`${src}-${i}`}
                    src={src}
                    label={p.name}
                    size="sm"
                    onClick={() => setLightbox({ images: gallery, index: i })}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <p className="eyebrow">
              {p.kind} · {p.status}
            </p>
            <h1 className="page-title mt-1 inline-flex items-center gap-2">
              <FoodTypeBadge value={p.foodType} showLabel />
              {p.name}
            </h1>
            <p className="mt-1 font-mono text-sm font-medium text-[#475569]">
              SKU {p.skuCode}
              {p.barcode ? ` · Barcode ${p.barcode}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href="/catalog">Back</Link>
          </Button>
          <Button asChild>
            <Link href={`/catalog/new?id=${p.id}`}>Edit</Link>
          </Button>
          <Button variant="secondary" onClick={() => dup.mutate()}>
            Duplicate
          </Button>
          {p.status === "active" ? (
            <Button
              variant="secondary"
              onClick={() => setStatus.mutate("inactive")}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setStatus.mutate("active")}
            >
              {p.status === "archived" ? "Unarchive" : "Activate"}
            </Button>
          )}
          <EntityRowActions
            onSoftDelete={
              p.status !== "archived"
                ? () => {
                    if (confirm(`Archive “${p.name}”?`)) {
                      setStatus.mutate("archived");
                    }
                  }
                : undefined
            }
            softDeleteTitle="Archive (soft delete)"
            onUnarchive={
              p.status === "archived"
                ? () => {
                    if (confirm(`Unarchive “${p.name}”?`)) {
                      setStatus.mutate("active");
                    }
                  }
                : undefined
            }
            unarchiveTitle="Unarchive"
            onDelete={() => {
              if (
                confirm(
                  `Delete “${p.name}”? Unused items are removed; items used in orders are archived.`,
                )
              ) {
                remove.mutate();
              }
            }}
            deleteTitle="Delete"
            disabled={remove.isPending || setStatus.isPending}
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {(
          [
            ["overview", "Overview"],
            ["barcode", "Barcode"],
            ["variants", "Variants"],
            ["bundle", "Bundle / recipe"],
            ["batches", "Batch & expiry"],
            ["serials", "Serials"],
            ["inventory", "Inventory (read)"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
          <div className="space-y-3 rounded-md border border-[#e4e9f0] bg-white p-4 text-sm">
            <Row label="Category" value={p.category?.name} />
            <Row
              label="Subcategory path"
              value={
                p.category?.parent
                  ? `${p.category.parent.name} › ${p.category.name}`
                  : p.category?.name
              }
            />
            <Row label="Brand" value={p.brand?.name ?? "—"} />
            <Row label="Selling price" value={String(p.basePrice)} />
            <Row
              label="Cost / MRP"
              value={`${p.costPrice ?? "—"} / ${p.mrp ?? "—"}`}
            />
            <Row label="Tax ref" value={p.taxCode ?? "—"} />
            <Row label="UOM" value={p.unitOfMeasure} />
            <Row
              label="Track inventory"
              value={p.trackInventory ? "Yes" : "No"}
            />
            <Row label="Serial" value={p.trackSerial ? "Yes" : "No"} />
            <Row label="Batch" value={p.trackBatch ? "Yes" : "No"} />
            <Row
              label="Sell / Purchase / POS"
              value={`${p.canSell ? "Sell" : "—"} · ${p.canPurchase ? "Buy" : "—"} · ${p.availableInPos ? "POS" : "hidden"}`}
            />
            <Row label="Short" value={p.shortDescription ?? "—"} />
            <div>
              <p className="text-[0.7rem] font-semibold text-[#5a6b7d] uppercase">
                Description
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[#0b1f33]">
                {p.description || "—"}
              </p>
            </div>
          </div>
          <div className="rounded-md border border-[#e4e9f0] bg-white p-3 text-center">
            <p className="mb-2 text-[0.72rem] font-bold tracking-wide text-[#475569] uppercase">
              QR code
            </p>
            {p.qr?.chartUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.qr.chartUrl}
                alt="Product QR"
                className="mx-auto size-[160px]"
              />
            ) : null}
            <p className="mt-2 break-all font-mono text-[0.65rem] text-[#8a9bb0]">
              {p.qr?.display}
            </p>
          </div>
        </div>
      ) : null}

      {tab === "barcode" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3 rounded-md border border-[#e4e9f0] bg-white p-4">
            <p className="text-sm text-[#5a6b7d]">
              Code 128 is the default for internal barcodes. You can also type
              or scan an existing package barcode (EAN/UPC).
            </p>
            <div>
              <Label>Barcode value</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Input
                  className="min-w-[200px] flex-1 font-mono uppercase"
                  value={barcodeDraft || p.barcode || ""}
                  onChange={(e) => {
                    setBarcodeDraft(e.target.value);
                    setBarcodeErr(null);
                  }}
                  onFocus={() => {
                    if (!barcodeDraft && p.barcode) setBarcodeDraft(p.barcode);
                  }}
                  placeholder="Generate or enter barcode"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={genBarcode.isPending}
                  onClick={() => genBarcode.mutate()}
                >
                  Generate barcode
                </Button>
                <Button
                  type="button"
                  disabled={saveBarcode.isPending}
                  onClick={() => {
                    if (!barcodeDraft && p.barcode) setBarcodeDraft(p.barcode);
                    saveBarcode.mutate();
                  }}
                >
                  Save barcode
                </Button>
              </div>
              {barcodeErr ? (
                <p className="mt-1 text-xs text-rose-600">{barcodeErr}</p>
              ) : null}
            </div>
            <Row label="Stored type" value={p.barcodeType ?? "—"} />
          </div>
          {(barcodeDraft || p.barcode) ? (
            <ProductBarcodePreview
              variant="label"
              value={barcodeDraft || p.barcode || ""}
              barcodeType={p.barcodeType || "code128"}
              productName={p.name}
              sku={p.skuCode}
              showPrint
            />
          ) : (
            <div className="rounded-md border border-dashed border-[#e4e9f0] bg-white p-6 text-center text-sm text-[#6b7280]">
              Generate or enter a barcode to preview the label.
            </div>
          )}
        </div>
      ) : null}

      {tab === "variants" ? (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border border-[#e4e9f0] bg-white p-4 sm:grid-cols-4">
            <div>
              <Label>Variant name</Label>
              <Input
                value={vName}
                onChange={(e) => setVName(e.target.value)}
                placeholder="Black / 42"
              />
            </div>
            <div>
              <Label>Size</Label>
              <Input value={vSize} onChange={(e) => setVSize(e.target.value)} />
            </div>
            <div>
              <Label>Color</Label>
              <Input
                value={vColor}
                onChange={(e) => setVColor(e.target.value)}
              />
            </div>
            <div>
              <Label>Weight</Label>
              <Input
                value={vWeight}
                onChange={(e) => setVWeight(e.target.value)}
              />
            </div>
            <Button
              className="sm:col-span-4 w-fit"
              disabled={!vName.trim()}
              onClick={() => addVariant.mutate()}
            >
              Add variant (auto SKU)
            </Button>
          </div>
          <table className="w-full text-sm border border-[#e4e9f0] rounded-md bg-white">
            <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Attributes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(p.variants ?? []).map((v) => (
                <tr key={v.id} className="border-t border-[#eef1f4]">
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{v.skuCode}</td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {JSON.stringify(v.attributes ?? {})}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => delVariant.mutate(v.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "bundle" ? (
        <div className="space-y-3 rounded-md border border-[#e4e9f0] bg-white p-4">
          {p.kind === "bundle" ? (
            <p className="text-sm text-[#5a6b7d]">
              Combo pack components. These do not deduct unless marked consume-on-sale.
            </p>
          ) : (
            <p className="text-sm text-[#5a6b7d]">
              Recipe / BOM. Selling this item deducts ingredients at checkout, not the
              finished dish. KOT does not consume stock.
            </p>
          )}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="min-w-[200px] flex-1">
                  <Label>Component product</Label>
                  <Select
                    className="h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
                    value={compId}
                    onChange={(e) => setCompId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {(allProducts.data?.items ?? [])
                      .filter((x) => x.id !== id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.skuCode})
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="w-24">
                  <Label>Qty</Label>
                  <Input
                    value={compQty}
                    onChange={(e) => setCompQty(e.target.value)}
                  />
                </div>
                <Button onClick={() => saveBundle.mutate()}>Add line</Button>
              </div>
              <ul className="text-sm space-y-1">
                {(p.bundleLines ?? []).map((l) => (
                  <li key={l.id}>
                    {l.quantity} × {l.component.name}{" "}
                    <span className="font-mono text-xs text-[#8a9bb0]">
                      {l.component.skuCode}
                    </span>
                  </li>
                ))}
              </ul>
        </div>
      ) : null}

      {tab === "batches" ? (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border border-[#e4e9f0] bg-white p-4 sm:grid-cols-4">
            <div>
              <Label>Batch code</Label>
              <Input
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Select
                className="h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
                value={batchLoc}
                onChange={(e) => setBatchLoc(e.target.value)}
              >
                <option value="">Select…</option>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Expiry</Label>
              <Input
                type="date"
                value={batchExp}
                onChange={(e) => setBatchExp(e.target.value)}
              />
            </div>
            <div>
              <Label>Qty</Label>
              <Input
                value={batchQty}
                onChange={(e) => setBatchQty(e.target.value)}
              />
            </div>
            <Button
              className="sm:col-span-4 w-fit"
              disabled={!batchCode.trim() || !batchLoc}
              onClick={() => addBatch.mutate()}
            >
              Add batch
            </Button>
          </div>
          <table className="w-full text-sm border border-[#e4e9f0] rounded-md bg-white">
            <thead className="bg-[#f7f9fb] text-left text-[0.7rem] uppercase text-[#5a6b7d]">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(p.batches ?? []).map((b) => (
                <tr key={b.id} className="border-t border-[#eef1f4]">
                  <td className="px-3 py-2 font-mono text-xs">{b.batchCode}</td>
                  <td className="px-3 py-2">{b.location?.name}</td>
                  <td className="px-3 py-2">
                    {b.expiresAt
                      ? new Date(b.expiresAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{b.qtyOnHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "serials" ? (
        <div className="space-y-3">
          {!p.trackSerial ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                Serial tracking is off for this item. Enable it to register unit
                barcodes / serial numbers.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={enableSerial.isPending}
                  onClick={() => enableSerial.mutate()}
                >
                  {enableSerial.isPending ? "Enabling…" : "Enable serial tracking"}
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/catalog/new?id=${p.id}`}>Edit item</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#5a6b7d]">
              Register each physical unit once. Serials appear on Counter when
              selling this item.
            </p>
          )}
          <div className="flex flex-wrap gap-2 rounded-md border border-[#e4e9f0] bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <Label>Serial / unit barcode</Label>
              <Input
                className="mt-1 font-mono"
                placeholder="e.g. SN-100245"
                value={serial}
                disabled={!p.trackSerial && !enableSerial.isSuccess}
                onChange={(e) => setSerial(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && serial.trim()) {
                    e.preventDefault();
                    addSerial.mutate();
                  }
                }}
              />
            </div>
            <div className="min-w-[160px]">
              <Label>Location</Label>
              <Select
                className="mt-1 h-10 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
                value={serialLoc}
                disabled={!p.trackSerial && !enableSerial.isSuccess}
                onChange={(e) => setSerialLoc(e.target.value)}
              >
                <option value="">Select location</option>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              className="self-end"
              disabled={
                !serial.trim() ||
                !serialLoc ||
                addSerial.isPending ||
                (!p.trackSerial && !enableSerial.isSuccess)
              }
              onClick={() => addSerial.mutate()}
            >
              {addSerial.isPending ? "Saving…" : "Register serial"}
            </Button>
          </div>
          <ul className="divide-y divide-[#eef1f4] rounded-md border border-[#e4e9f0] bg-white text-sm">
            {(p.serials ?? []).map((s) => (
              <li key={s.id} className="flex justify-between px-3 py-2">
                <span className="font-mono">{s.serial}</span>
                <span className="text-[#5a6b7d]">
                  {s.status} · {s.location?.name}
                </span>
              </li>
            ))}
            {!p.serials?.length ? (
              <li className="px-3 py-6 text-center text-[#8a9bb0]">
                No serials registered yet
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="rounded-md border border-[#e4e9f0] bg-white p-4">
          <p className="mb-3 text-sm text-[#5a6b7d]">
            Location quantities are Inventory — not editable here. Use Stock
            levels / Adjustments for movements.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-[0.7rem] uppercase text-[#5a6b7d]">
              <tr>
                <th className="py-1">Location</th>
                <th className="py-1 text-right">Qty on hand</th>
                <th className="py-1 text-right">Sell price</th>
              </tr>
            </thead>
            <tbody>
              {(p.inventoryByLocation ?? []).map((row) => (
                <tr key={row.stockLevelId} className="border-t border-[#eef1f4]">
                  <td className="py-2">{row.location?.name ?? row.locationId}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.qtyOnHand} {row.sellUnit}
                  </td>
                  <td className="py-2 text-right">{row.sellPrice}</td>
                </tr>
              ))}
              {!p.inventoryByLocation?.length ? (
                <tr>
                  <td colSpan={3} className="py-4 text-[#5a6b7d]">
                    No stock levels yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? gallery}
        startIndex={lightbox?.index ?? 0}
        label={p.name}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-[#f3f5f8] py-1.5">
      <span className="text-[0.72rem] font-bold tracking-wide text-[#475569] uppercase">
        {label}
      </span>
      <span className="font-medium text-[#0b1f33]">{value || "—"}</span>
    </div>
  );
}
