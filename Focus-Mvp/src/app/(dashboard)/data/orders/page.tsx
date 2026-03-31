"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Upload } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

interface Order {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  orderDate: string | null;
  expectedDate: string | null;
  totalAmount: string | null;
  currency: string | null;
  supplier: { name: string; code: string } | null;
  lines: Array<{
    product: { sku: string; name: string };
    quantity: string;
  }>;
}

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "info" | "destructive" | "outline"
> = {
  PENDING: "warning",
  CONFIRMED: "info",
  IN_TRANSIT: "info",
  RECEIVED: "success",
  CANCELLED: "destructive",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">{orders.length} orders</p>
        </div>
        <Button variant="outline" asChild size="sm">
          <Link href="/data/import">
            <Upload className="w-4 h-4 mr-2" /> Import
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No orders yet</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/data/import">Import orders</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Expected</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                    {o.orderNumber}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {o.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {o.supplier ? (
                      <div>
                        <p className="font-medium">{o.supplier.name}</p>
                        <p className="text-xs text-gray-400">
                          {o.supplier.code}
                        </p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(o.orderDate)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(o.expectedDate)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {o.totalAmount
                      ? formatCurrency(o.totalAmount, o.currency ?? "USD")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>
                      {o.status.toLowerCase().replace("_", " ")}
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
