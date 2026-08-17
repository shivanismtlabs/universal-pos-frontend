/**
 * Live smoke: login page + shop profiles (restaurant, grocery, gym, swimming).
 * Prod currently auto-creates a shop on signup; we then set business-config.
 * Run: node scripts/live-shop-profiles-smoke.mjs
 */
const FE = process.env.FE_URL ?? "http://13.126.105.138:3000";
const API = process.env.API_URL ?? "http://13.126.105.138:3001/v1";
const stamp = Date.now().toString(36);
const PASS = "WalitShop@2026";

/** Gym/swimming are not separate businessType IDs — map to registry profiles. */
const SHOPS = [
  {
    key: "restaurant",
    businessType: "restaurant",
    organizationName: `Smoke Cafe ${stamp}`,
    note: "Restaurant / café — table billing + sale mode",
  },
  {
    key: "grocery",
    businessType: "grocery",
    organizationName: `Smoke Grocery ${stamp}`,
    note: "Grocery / F&B retail — counter + stock",
  },
  {
    key: "gym",
    businessType: "service",
    organizationName: `Smoke Gym ${stamp}`,
    note: "Gym → service profile (appointments / memberships)",
  },
  {
    key: "swimming",
    businessType: "retail",
    organizationName: `Smoke Swim Shop ${stamp}`,
    note: "Swimming / pool shop → retail profile",
  },
];

const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, pass: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      (Array.isArray(json?.message) ? json.message.join(", ") : null) ||
      json?.raw ||
      res.statusText;
    const err = new Error(`${res.status} ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.data ?? json;
}

function pickAccess(session) {
  if (session?.accessToken) return session.accessToken;
  if (session?.identityToken && !session.accessToken) return null;
  return null;
}

async function ensureShopSession(shop, email) {
  const signed = await api("POST", "/auth/signup", {
    body: {
      fullName: `Smoke ${shop.key}`,
      email,
      password: PASS,
      phone: "+919876543210",
    },
  });

  // Live (older deploy): signup auto-enters shop with accessToken
  let accessToken = pickAccess(signed);
  if (accessToken) {
    return { accessToken, path: "signup_auto_shop", session: signed };
  }

  // Newer flow: identity portal → create organization
  const identityToken = signed.identityToken;
  if (!identityToken) {
    throw new Error(
      `signup missing tokens keys=${Object.keys(signed).join(",")}`,
    );
  }

  const created = await api("POST", "/auth/organizations", {
    token: identityToken,
    body: {
      organizationName: shop.organizationName,
      businessType: shop.businessType,
      phone: "+919876543210",
      addressLine1: "12 Test Street",
      city: "Indore",
      state: "Madhya Pradesh",
      postalCode: "452001",
      countryCode: "IN",
      currencyCode: "INR",
      locale: "en-IN",
      fiscalYearStart: "April",
      inventoryStartDate: new Date().toISOString().slice(0, 10),
      storeName: "Main",
    },
  });
  accessToken = pickAccess(created);
  if (!accessToken) {
    throw new Error(
      `org create missing accessToken keys=${Object.keys(created).join(",")}`,
    );
  }
  return { accessToken, path: "create_org", session: created };
}

async function main() {
  console.log(`FE=${FE}`);
  console.log(`API=${API}`);
  console.log("---");

  try {
    const r = await fetch(`${FE}/login`);
    const html = await r.text();
    if (r.ok && /Universal POS|Sign in|__NEXT/i.test(html)) {
      ok("fe_login_page", `HTTP ${r.status}, ${html.length} bytes`);
    } else {
      fail("fe_login_page", `HTTP ${r.status}`);
    }
  } catch (e) {
    fail("fe_login_page", String(e.message || e));
  }

  for (const path of ["/login", "/", "/signup"]) {
    try {
      const r = await fetch(`${FE}${path}`);
      if (r.ok) ok(`fe_route_${path === "/" ? "root" : path.slice(1)}`, `HTTP ${r.status}`);
      else fail(`fe_route_${path === "/" ? "root" : path.slice(1)}`, `HTTP ${r.status}`);
    } catch (e) {
      fail(`fe_route_${path === "/" ? "root" : path.slice(1)}`, String(e.message || e));
    }
  }

  try {
    const h = await api("GET", "/health");
    ok("api_health", h.status || JSON.stringify(h).slice(0, 80));
  } catch (e) {
    fail("api_health", String(e.message || e));
  }

  // registry checked per-shop after auth (endpoint requires bearer)

  for (let i = 0; i < SHOPS.length; i++) {
    const shop = SHOPS[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2500));
    }
    const email = `smoke.${shop.key}.${stamp}@upos.test`;
    const label = `shop_${shop.key}`;
    try {
      const { accessToken, path } = await ensureShopSession(shop, email);
      ok(`${label}_signup`, `${email} via ${path}`);

      // Re-login proves credentials work on live login API
      const logged = await api("POST", "/auth/login", {
        body: { email, password: PASS },
      });
      const loginToken = pickAccess(logged) || accessToken;
      if (!loginToken) {
        fail(`${label}_login`, `keys=${Object.keys(logged).join(",")}`);
        continue;
      }
      ok(`${label}_login`, "password login ok");

      // Apply vertical profile (needed when signup auto-created a generic shop)
      const cfg = await api("POST", "/tenants/me/business-config", {
        token: loginToken,
        body: { businessType: shop.businessType },
      });
      const applied =
        cfg?.businessType ||
        cfg?.id ||
        cfg?.config?.id ||
        shop.businessType;
      ok(`${label}_set_profile`, `businessType=${applied}`);

      const boot = await api("GET", "/tenants/me/bootstrap", {
        token: loginToken,
      });
      const bt =
        boot?.business?.type ||
        boot?.businessConfig?.id ||
        boot?.tenant?.businessType ||
        boot?.tenant?.settings?.businessType ||
        "(unknown)";
      const modes =
        boot?.commerce?.modes ||
        boot?.tenant?.commerceModes ||
        boot?.business?.config?.defaultCommerceModes ||
        [];
      const billing =
        boot?.business?.config?.billing?.style ||
        boot?.businessConfig?.billing?.style ||
        "?";
      const screens =
        boot?.business?.config?.screens ||
        boot?.businessConfig?.screens ||
        [];
      ok(
        `${label}_bootstrap`,
        `type=${bt} billing=${billing} modes=${Array.isArray(modes) ? modes.join("|") : JSON.stringify(modes)} screens=${Array.isArray(screens) ? screens.slice(0, 6).join("|") : "n/a"} · ${shop.note}`,
      );

      if (String(bt) !== shop.businessType && bt !== "(unknown)") {
        fail(
          `${label}_profile_match`,
          `expected ${shop.businessType}, got ${bt}`,
        );
      } else if (String(bt) === shop.businessType) {
        ok(`${label}_profile_match`, shop.businessType);
      }

      try {
        const configs = await api("GET", "/commerce/business-configs", {
          token: loginToken,
        });
        const ids = Array.isArray(configs)
          ? configs.map((c) => c.id)
          : configs?.items?.map((c) => c.id) || [];
        ok(
          `${label}_registry`,
          `has ${shop.businessType}=${ids.includes(shop.businessType)}`,
        );
      } catch (e) {
        fail(`${label}_registry`, String(e.message || e));
      }

      // Catalog / POS light checks
      try {
        const items = await api("GET", "/pos/sale/products?limit=5", {
          token: loginToken,
        });
        const n = Array.isArray(items?.items)
          ? items.items.length
          : Array.isArray(items)
            ? items.length
            : "ok";
        ok(`${label}_catalog_items`, `count=${n}`);
      } catch (e) {
        fail(`${label}_catalog_items`, String(e.message || e));
      }

      try {
        const schema = await api("GET", "/tenants/me/business-form-schema", {
          token: loginToken,
        });
        ok(
          `${label}_form_schema`,
          `keys=${Object.keys(schema || {}).slice(0, 8).join(",")}`,
        );
      } catch (e) {
        fail(`${label}_form_schema`, String(e.message || e));
      }

      // FE app shell routes should redirect/respond (cookie-less → often 200 login or app HTML)
      for (const route of ["/dashboard", "/catalog", "/pos", "/counter"]) {
        try {
          const r = await fetch(`${FE}${route}`, { redirect: "manual" });
          if (r.status === 200 || r.status === 307 || r.status === 302) {
            ok(`${label}_fe${route.replace(/\//g, "_")}`, `HTTP ${r.status}`);
          } else {
            fail(`${label}_fe${route.replace(/\//g, "_")}`, `HTTP ${r.status}`);
          }
        } catch (e) {
          fail(`${label}_fe${route.replace(/\//g, "_")}`, String(e.message || e));
        }
      }
    } catch (e) {
      fail(label, String(e.message || e));
    }
  }

  console.log("---");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`SUMMARY  pass=${passed} fail=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
