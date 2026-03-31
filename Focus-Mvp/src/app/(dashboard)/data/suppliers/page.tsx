"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Search, Upload, Globe } from "lucide-react";

interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string | null;
  country: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  active: boolean;
  _count: { orders: number };
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(
        `/api/data/suppliers?search=${encodeURIComponent(search)}`
      );
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">
            {suppliers.length} suppliers in canonical model
          </p>
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
          placeholder="Search by code, name, or country..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : suppliers.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <Truck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No suppliers yet</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/data/import">Import suppliers</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-left">Lead time</th>
                <th className="px-4 py-3 text-left">Payment terms</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                    {s.code}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.email && (
                        <p className="text-xs text-gray-400">{s.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.country ? (
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-gray-400" />
                        {s.country}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.leadTimeDays != null ? `${s.leadTimeDays} days` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.paymentTerms ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {s._count.orders}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={s.active ? "success" : "outline"}>
                      {s.active ? "Active" : "Inactive"}
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
