# Walit POS Frontend

Next.js 15 + Tailwind + Shadcn-style UI + TanStack Query + React Hook Form + Zod + Motion.

## Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Backend must be running at `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/v1`).

## Integrated APIs

| Screen | Endpoints |
|--------|-----------|
| Login / Register | `POST /auth/login`, `POST /auth/register-tenant`, `POST /auth/logout` |
| Dashboard | `/tenants/me`, `/customers`, `/inventory-units`, `/orders`, `/reports/inventory-utilization` |
| Customers | `GET/POST /customers` |
| Inventory | `GET/POST /categories`, `/product-styles`, `/inventory-units`, `GET /stores` |
| Orders | `GET/POST /orders` |
| POS | `GET/POST /payments`, `POST /pos/checkout` |

All responses use `{ success, data }` envelope via `src/lib/api/client.ts`.

## Validation

Zod schemas in `src/lib/validations` mirror Nest rules (Indian phone, strong password, tenant slug, UUIDs).
