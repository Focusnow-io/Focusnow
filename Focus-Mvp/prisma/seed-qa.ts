/**
 * QA Seed Script — Edge-case data to stress-test the operational model.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json prisma/seed-qa.ts
 *
 * WARNING: Creates a dedicated test organisation. Do not run in production
 * without reviewing the generated data first.
 *
 * See docs/data-science-notes.md for what each case tests.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding QA edge-case data...");

  // ── 1. Create a dedicated QA organisation ──────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: "qa-edge-cases" },
    update: {},
    create: {
      name: "QA Edge Cases Org",
      slug: "qa-edge-cases",
    },
  });

  const orgId = org.id;
  console.log(`  org: ${orgId}`);

  // ── 2. PRODUCTS ─────────────────────────────────────────────────────────────

  // Case A: stub products where name === sku (imported via inventory-only file)
  const stubSkus = ["STUB-001", "STUB-002", "STUB-003"];
  const stubProducts = await Promise.all(
    stubSkus.map((sku) =>
      prisma.product.upsert({
        where: { organizationId_sku: { organizationId: orgId, sku } },
        update: {},
        create: { organizationId: orgId, sku, name: sku }, // name === sku → stub
      }),
    ),
  );

  // Case B: products with same display name, different SKUs (dedup edge case)
  const dupNameProducts = await Promise.all(
    ["DUP-A", "DUP-B", "DUP-C"].map((sku) =>
      prisma.product.upsert({
        where: { organizationId_sku: { organizationId: orgId, sku } },
        update: {},
        create: {
          organizationId: orgId,
          sku,
          name: "Widget Pro", // all three share the same name
          description: `Duplicate name variant ${sku}`,
        },
      }),
    ),
  );

  // Case C: product with all optional fields populated (high quality baseline)
  const richProduct = await prisma.product.upsert({
    where: { organizationId_sku: { organizationId: orgId, sku: "RICH-001" } },
    update: {},
    create: {
      organizationId: orgId,
      sku: "RICH-001",
      name: "Fully Enriched Part",
      description: "All optional fields set",
      leadTimeDays: 14,
      unitCost: 42.5,
    },
  });

  // Case D: product missing optional fields entirely (partial quality)
  const sparseProduct = await prisma.product.upsert({
    where: { organizationId_sku: { organizationId: orgId, sku: "SPARSE-001" } },
    update: {},
    create: {
      organizationId: orgId,
      sku: "SPARSE-001",
      name: "Sparse Part",
      // no description, leadTimeDays, unitCost
    },
  });

  console.log(`  products: ${2 + stubSkus.length + dupNameProducts.length}`);

  // ── 3. SUPPLIERS ────────────────────────────────────────────────────────────

  // Case E: suppliers with duplicate names but different codes
  const [sup1, sup2] = await Promise.all([
    prisma.supplier.upsert({
      where: { organizationId_code: { organizationId: orgId, code: "SUP-ALPHA" } },
      update: {},
      create: { organizationId: orgId, code: "SUP-ALPHA", name: "Acme Supplies" },
    }),
    prisma.supplier.upsert({
      where: { organizationId_code: { organizationId: orgId, code: "SUP-BETA" } },
      update: {},
      create: {
        organizationId: orgId,
        code: "SUP-BETA",
        name: "Acme Supplies", // same name, different code → dedup confusion
        email: "contact@acme-beta.com",
        country: "US",
        leadTimeDays: 30,
      },
    }),
  ]);

  console.log("  suppliers: 2");

  // ── 4. LOCATIONS ────────────────────────────────────────────────────────────

  const loc = await prisma.location.upsert({
    where: { organizationId_code: { organizationId: orgId, code: "WH-01" } },
    update: {},
    create: { organizationId: orgId, code: "WH-01", name: "Main Warehouse", type: "WAREHOUSE" },
  });

  console.log("  locations: 1");

  // ── 5. INVENTORY ITEMS ──────────────────────────────────────────────────────

  // Case F: zero quantity
  await prisma.inventoryItem.upsert({
    where: { organizationId_productId_locationId: { organizationId: orgId, productId: richProduct.id, locationId: loc.id } },
    update: {},
    create: { organizationId: orgId, productId: richProduct.id, locationId: loc.id, quantity: 0 },
  });

  // Case G: negative quantity (data entry error simulation)
  await prisma.inventoryItem.upsert({
    where: { organizationId_productId_locationId: { organizationId: orgId, productId: sparseProduct.id, locationId: loc.id } },
    update: {},
    create: { organizationId: orgId, productId: sparseProduct.id, locationId: loc.id, quantity: -5 },
  });

  // Case H: stub product with location FK set (FK resolution should pass)
  await prisma.inventoryItem.upsert({
    where: { organizationId_productId_locationId: { organizationId: orgId, productId: stubProducts[0].id, locationId: loc.id } },
    update: {},
    create: { organizationId: orgId, productId: stubProducts[0].id, locationId: loc.id, quantity: 100 },
  });

  // Case I: stub product with NO location (locationId null → FK resolution penalty)
  const existingNoLoc = await prisma.inventoryItem.findFirst({
    where: { organizationId: orgId, productId: stubProducts[1].id, locationId: null },
  });
  if (!existingNoLoc) {
    await prisma.inventoryItem.create({
      data: { organizationId: orgId, productId: stubProducts[1].id, locationId: null, quantity: 50 },
    });
  }

  console.log("  inventory items: 4");

  // ── 6. PURCHASE ORDERS (PurchaseOrder uses orgId, not organizationId) ────────

  // Case J: past-due PO (expected date in the past)
  await prisma.purchaseOrder.upsert({
    where: { id: "qa-po-overdue" },
    update: {},
    create: {
      id: "qa-po-overdue",
      orgId,
      poNumber: "PO-OVERDUE-001",
      supplierId: sup1.id,
      status: "SENT",
      currency: "USD",
      expectedDate: new Date("2024-01-01"), // deeply past-due
      totalAmount: 1500,
    },
  });

  // Case K: future PO (far future expected date)
  await prisma.purchaseOrder.upsert({
    where: { id: "qa-po-future" },
    update: {},
    create: {
      id: "qa-po-future",
      orgId,
      poNumber: "PO-FUTURE-001",
      supplierId: sup2.id,
      status: "DRAFT",
      currency: "EUR",
      expectedDate: new Date("2030-12-31"), // far future
      totalAmount: 9999,
    },
  });

  // Case L: cancelled PO (should be excluded from active metrics)
  await prisma.purchaseOrder.upsert({
    where: { id: "qa-po-cancelled" },
    update: {},
    create: {
      id: "qa-po-cancelled",
      orgId,
      poNumber: "PO-CANCELLED-001",
      supplierId: sup1.id,
      status: "CANCELLED",
      currency: "USD",
      totalAmount: 0,
    },
  });

  console.log("  purchase orders: 3");

  // ── 7. BOM HEADERS ───────────────────────────────────────────────────────────

  // Case M: BOMHeader with no BOMLines (empty BOM — should not crash)
  await prisma.bOMHeader.upsert({
    where: { id: "qa-bom-empty" },
    update: {},
    create: {
      id: "qa-bom-empty",
      orgId,
      productId: richProduct.id,
      version: "v0-empty",
      isActive: false,
    },
  });

  // Case N: active BOMHeader (no lines either — tests FK score alone)
  await prisma.bOMHeader.upsert({
    where: { id: "qa-bom-active" },
    update: {},
    create: {
      id: "qa-bom-active",
      orgId,
      productId: dupNameProducts[0].id,
      version: "v1",
      isActive: true,
    },
  });

  console.log("  BOM headers: 2 (no lines — empty BOM test)");

  // ── 8. WORK ORDERS ───────────────────────────────────────────────────────────

  // Case O: WorkOrder with productId set (FK resolves correctly)
  await prisma.workOrder.upsert({
    where: { id: "qa-wo-linked" },
    update: {},
    create: {
      id: "qa-wo-linked",
      organizationId: orgId,
      orderNumber: "WO-LINKED-001",
      sku: richProduct.sku,
      plannedQty: 10,
      productId: richProduct.id,
      status: "PLANNED",
    },
  });

  // Case P: WorkOrder with no productId (FK null → scorer penalty)
  await prisma.workOrder.upsert({
    where: { id: "qa-wo-orphan" },
    update: {},
    create: {
      id: "qa-wo-orphan",
      organizationId: orgId,
      orderNumber: "WO-ORPHAN-001",
      sku: "PHANTOM-SKU", // sku references a non-existent product
      plannedQty: 5,
      productId: null,     // no FK
      status: "PLANNED",
    },
  });

  console.log("  work orders: 2");

  // ── 9. CUSTOMERS ─────────────────────────────────────────────────────────────

  // Case Q: Customer with email (optional field present)
  await prisma.customer.upsert({
    where: { id: "qa-cust-full" },
    update: {},
    create: {
      id: "qa-cust-full",
      orgId,
      code: "CUST-001",
      name: "Full Customer Inc.",
      email: "orders@fullcustomer.com",
    },
  });

  // Case R: Customer missing email (optional field absent)
  await prisma.customer.upsert({
    where: { id: "qa-cust-no-email" },
    update: {},
    create: {
      id: "qa-cust-no-email",
      orgId,
      code: "CUST-002",
      name: "No Email Corp",
      // email intentionally omitted
    },
  });

  // Case S: Two customers with the same name (dedup confusion)
  await prisma.customer.upsert({
    where: { id: "qa-cust-dup-a" },
    update: {},
    create: {
      id: "qa-cust-dup-a",
      orgId,
      code: "CUST-DUP-A",
      name: "Acme Corp",
      email: "a@acme.com",
    },
  });
  await prisma.customer.upsert({
    where: { id: "qa-cust-dup-b" },
    update: {},
    create: {
      id: "qa-cust-dup-b",
      orgId,
      code: "CUST-DUP-B",
      name: "Acme Corp", // same name, different code
      email: "b@acme.com",
    },
  });

  console.log("  customers: 4");

  // ── 10. LOTS ─────────────────────────────────────────────────────────────────

  // Case T: expired lot
  await prisma.lot.upsert({
    where: { id: "qa-lot-expired" },
    update: {},
    create: {
      id: "qa-lot-expired",
      orgId,
      lotNumber: "LOT-EXPIRED-001",
      productId: richProduct.id,
      expiryDate: new Date("2023-06-01"), // expired
      qtyOnHand: 200,
      status: "QUARANTINE",
    },
  });

  // Case U: lot with no expiry (non-perishable — should not trigger expiry alert)
  await prisma.lot.upsert({
    where: { id: "qa-lot-no-expiry" },
    update: {},
    create: {
      id: "qa-lot-no-expiry",
      orgId,
      lotNumber: "LOT-NOEXP-001",
      productId: sparseProduct.id,
      expiryDate: null,
      qtyOnHand: 50,
      status: "RELEASED",
    },
  });

  console.log("  lots: 2");

  console.log("\n✅  QA seed complete. Organisation slug: qa-edge-cases");
  console.log("   See docs/data-science-notes.md for what each case tests.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
