# Focus — Operational Platform

Turn fragmented industrial data into a canonical operational model, a versioned operational brain, and powerful applications.

## What is Focus?

Focus is a platform for industrial companies to:

1. **Ingest** fragmented data (CSV/XLSX from ERPs, WMS, spreadsheets)
2. **Normalize** it into a canonical operational model (products, suppliers, inventory, orders)
3. **Govern** operational logic as versioned "brain" objects (rules, policies, thresholds)
4. **Launch** pre-built applications from the shared data + brain foundation

## The 3 Layers

### Layer 1 — Operational Data Layer
- Upload CSV/XLSX files
- Auto-detect and map columns to canonical fields
- Upsert into structured entities: Products, Suppliers, Inventory, Orders

### Layer 2 — Operational Brain Layer
- Create named rules with conditions + actions
- Version control every change (like GitHub commits)
- Publish rules to activate them across the platform

### Layer 3 — Application Layer
- **Reorder Dashboard** — Products below their reorder point
- **Stock Alerts** — Color-coded stock levels (critical / low / ok)
- **Supplier Performance** — On-time delivery rates and order metrics
- **Vibe coding** — Describe customizations in plain language

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Prisma v7** + **PostgreSQL**
- **NextAuth v5** (credentials)
- **Tailwind CSS** + **Radix UI**
- **papaparse**, **xlsx**

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit DATABASE_URL and NEXTAUTH_SECRET

# 3. Run database migrations
DATABASE_URL=postgresql://... npx prisma migrate dev

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your workspace.

## Multi-tenant

Each company gets an isolated **Organization** with its own data, brain rules, and apps. Users belong to one or more organizations via membership roles (Owner, Admin, Member, Viewer).
