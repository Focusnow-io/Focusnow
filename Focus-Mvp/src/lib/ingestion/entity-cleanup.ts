/**
 * entity-cleanup.ts
 *
 * Shared utility for deleting all org-scoped records of a given entity type.
 * Used by both the source DELETE handler and the "replace" import mode.
 * Deletes in FK-safe order to avoid constraint violations.
 */

import { prisma } from "@/lib/prisma";

export async function deleteEntityData(orgId: string, entity: string): Promise<void> {
  switch (entity) {
    case "InventoryItem":
      await prisma.inventoryItem.deleteMany({ where: { organizationId: orgId } });
      // Remove auto-created product stubs (name = sku) that existed solely to
      // satisfy the FK from InventoryItem → Product. Real product records have
      // a meaningful name distinct from the SKU.
      await prisma.$executeRaw`
        DELETE FROM "Product"
        WHERE "organizationId" = ${orgId}
          AND "name" = "sku"
      `;
      break;

    case "Product":
      await prisma.pOLine.deleteMany({ where: { purchaseOrder: { orgId } } });
      await prisma.sOLine.deleteMany({ where: { salesOrder: { orgId } } });
      await prisma.inventoryItem.deleteMany({ where: { organizationId: orgId } });
      await prisma.bOMLine.deleteMany({ where: { bomHeader: { orgId } } });
      await prisma.bOMHeader.deleteMany({ where: { orgId } });
      await prisma.product.deleteMany({ where: { organizationId: orgId } });
      break;

    case "Supplier":
      await prisma.pOLine.deleteMany({ where: { purchaseOrder: { orgId } } });
      await prisma.purchaseOrder.deleteMany({ where: { orgId } });
      await prisma.supplier.deleteMany({ where: { organizationId: orgId } });
      break;

    case "Customer":
      await prisma.sOLine.deleteMany({ where: { salesOrder: { orgId } } });
      await prisma.salesOrder.deleteMany({ where: { orgId } });
      await prisma.customer.deleteMany({ where: { orgId } });
      break;

    case "PurchaseOrder":
    case "Order":
      await prisma.pOLine.deleteMany({ where: { purchaseOrder: { orgId } } });
      await prisma.purchaseOrder.deleteMany({ where: { orgId } });
      break;

    case "POLine":
      await prisma.pOLine.deleteMany({ where: { purchaseOrder: { orgId } } });
      break;

    case "SalesOrder":
      await prisma.sOLine.deleteMany({ where: { salesOrder: { orgId } } });
      await prisma.salesOrder.deleteMany({ where: { orgId } });
      break;

    case "SalesOrderLine":
      await prisma.sOLine.deleteMany({ where: { salesOrder: { orgId } } });
      break;

    case "Location":
      // locationId is nullable — clear FK before deleting locations
      await prisma.inventoryItem.updateMany({
        where: { organizationId: orgId },
        data: { locationId: null },
      });
      await prisma.location.deleteMany({ where: { organizationId: orgId } });
      break;

    case "BOMHeader":
    case "BOM":
      await prisma.bOMLine.deleteMany({ where: { bomHeader: { orgId } } });
      await prisma.bOMHeader.deleteMany({ where: { orgId } });
      break;

    case "BOMLine":
      await prisma.bOMLine.deleteMany({ where: { bomHeader: { orgId } } });
      break;

    default:
      break;
  }
}
