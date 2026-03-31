"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Warehouse, Upload, AlertTriangle } from "lucide-react";

interface InventoryItem {
  id: string;
  quantity: string;
  reorderPoint: string | null;
  reorderQty: string | null;
  reservedQty: string;
  product: {
    sku: string;
    name: string;
    category: string | null;
    unit: string | null;
  };
  location: { code: string; name: string } | null;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertOnly, setAlertOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/data/inventory?alertOnly=${alertOnly}`)
      .then((r) => r.json())
      .then((d) => {
        setInventory(d.inventory ?? []);
        setLoading(false);
      });
  }, [alertOnly]);

  const alertCount = inventory.filter(
    (i) =>
      i.reorderPoint != null && Number(i.quantity) <= Number(i.reorderPoint)
  ).length;

  function statusVariant(item: InventoryItem) {
    const qty = Number(item.quantity);
    if (qty === 0) return "destructive";
    if (
      item.reorderPoint != null &&
      qty <= Number(item.reorderPoint)
    )
      return "warning";
    return "success";
  }

  function statusLabel(item: InventoryItem) {
    const qty = Number(item.quantity);
    if (qty === 0) return "Out of stock";
    if (
      item.reorderPoint != null &&
      qty <= Number(item.reorderPoint)
    )
      return "Reorder";
    return "OK";
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">
            {inventory.length} inventory records
            {alertCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {alertCount} need reorder
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={alertOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setAlertOnly(!alertOnly)}
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Alerts only
          </Button>
          <Button variant="outline" asChild size="sm">
            <Link href="/data/import">
              <Upload className="w-4 h-4 mr-2" /> Import
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : inventory.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <Warehouse className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No inventory data</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/data/import">Import inventory</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-right">Qty on hand</th>
                <th className="px-4 py-3 text-right">Reserved</th>
                <th className="px-4 py-3 text-right">Reorder pt.</th>
                <th className="px-4 py-3 text-right">Reorder qty.</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inventory.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                    {item.product.sku}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{item.product.name}</p>
                      {item.product.category && (
                        <p className="text-xs text-gray-400">
                          {item.product.category}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.location?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {Number(item.quantity).toLocaleString()}
                    {item.product.unit && (
                      <span className="text-gray-400 font-normal ml-1 text-xs">
                        {item.product.unit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {Number(item.reservedQty) || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {item.reorderPoint != null
                      ? Number(item.reorderPoint).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {item.reorderQty != null
                      ? Number(item.reorderQty).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={statusVariant(item)}>
                      {statusLabel(item)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
