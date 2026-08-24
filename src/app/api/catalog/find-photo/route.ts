import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenverseHit = {
  title?: string;
  url?: string;
  thumbnail?: string;
  license?: string;
  foreign_landing_url?: string;
};

function buildQueries(name: string, hint?: string): string[] {
  const base = name.replace(/\s+/g, " ").trim();
  const lower = base.toLowerCase();
  const out: string[] = [base];
  if (hint) out.push(`${base} ${hint}`.slice(0, 120));

  if (lower.includes("kofta") && !lower.includes("malai")) {
    out.push("malai kofta");
    out.push("malai kofta indian food");
  }
  if (lower.includes("pani") && lower.includes("kofta")) {
    out.push("malai kofta");
    out.push("kofta curry indian");
  }
  if (lower.includes("pani puri") || lower === "pani") {
    out.push("pani puri");
    out.push("golgappa");
  }
  out.push(`${base} food`);
  out.push(`${base} indian food`);

  const parts = lower.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length > 1) {
    out.push(parts[parts.length - 1]);
    out.push(`${parts[parts.length - 1]} indian dish`);
  }

  return [...new Set(out.map((q) => q.trim()).filter((q) => q.length >= 2))];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 25000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchOpenverse(query: string): Promise<OpenverseHit | null> {
  try {
    const url =
      "https://api.openverse.org/v1/images/?" +
      new URLSearchParams({
        q: query,
        page_size: "8",
        format: "json",
      }).toString();

    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "UniversalPOS/1.0",
        },
        cache: "no-store",
      },
      15000,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: OpenverseHit[] };
    const results = json.results ?? [];
    const preferred =
      results.find((r) => r.url && /\.(jpe?g|png|webp)(\?|$)/i.test(r.url)) ||
      results.find((r) => r.url);
    return preferred ?? null;
  } catch (err) {
    console.error("[find-photo] searchOpenverse error:", err);
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "find-photo" });
}

export async function POST(req: Request) {
  try {
    let name = "";
    let hint = "";
    try {
      const body = (await req.json()) as { name?: string; hint?: string };
      name = (body?.name ?? "").trim();
      hint = (body?.hint ?? "").trim();
    } catch {
      // Body parse error
    }

    if (name.length < 2) {
      return NextResponse.json(
        { message: "Product name is required" },
        { status: 400 },
      );
    }

    const queries = buildQueries(name, hint);
    let hit: OpenverseHit | null = null;
    let usedQuery = queries[0];
    for (const q of queries) {
      hit = await searchOpenverse(q);
      if (hit?.url) {
        usedQuery = q;
        break;
      }
    }

    if (!hit?.url) {
      return NextResponse.json(
        {
          message:
            "No real photo found. Try a clearer name (e.g. Malai Kofta) or upload your own photo.",
        },
        { status: 404 },
      );
    }

    const imgRes = await fetchWithTimeout(
      hit.url,
      {
        headers: { Accept: "image/*,*/*", "User-Agent": "UniversalPOS/1.0" },
        cache: "no-store",
      },
      45000,
    );
    if (!imgRes.ok) {
      return NextResponse.json(
        { message: "Found a photo but could not download it. Try again." },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 500 || buf.length > 4 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Downloaded image was empty or too large." },
        { status: 502 },
      );
    }

    let mime = (imgRes.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!mime.startsWith("image/")) {
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = "image/jpeg";
      else if (buf[0] === 0x89 && buf[1] === 0x50) mime = "image/png";
      else mime = "image/jpeg";
    }
    if (mime === "image/jpg") mime = "image/jpeg";

    return NextResponse.json({
      provider: "openverse",
      query: usedQuery,
      mime,
      bytes: buf.length,
      imageBase64: `data:${mime};base64,${buf.toString("base64")}`,
      sourceUrl: hit.url,
      attribution: {
        title: hit.title || name,
        license: hit.license || "unknown",
        landingUrl: hit.foreign_landing_url || null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Photo search failed";
    return NextResponse.json({ message: msg }, { status: 503 });
  }
}
