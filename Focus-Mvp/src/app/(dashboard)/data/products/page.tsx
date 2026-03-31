"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Search, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string | null;
  unitCost: string | null;
  active: boolean;
  inventory: Array<{ quantity: string }>;
  _count: { orderLines: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/data/products?search=${encodeURIComponent(search)}`
        );
        const data = await res.json();
        setProducts(data.products ?? []);
        setTotal(data.total ?? 0);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totalStock = (p: Product) =>
    p.inventory.reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">{total} products in canonical model</p>
        </div>
        <Button variant="outline" asChild size="sm">
          <Link href="/data/import">
            <Upload className="w-4 h-4 mr-2" /> Import
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by SKU, name, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          Loading...
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No products yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Import a CSV file to populate your product catalog
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/data/import">Import products</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                    {p.sku}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.category ? (
                      <Badge variant="outline">{p.category}</Badge>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.unit ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {p.unitCost ? formatCurrency(p.unitCost) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {totalStock(p)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {p._count.orderLines}
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
