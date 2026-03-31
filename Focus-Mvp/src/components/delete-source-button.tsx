"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteSourceButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/data/sources/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
        >
          {loading ? "Deleting…" : "Confirm"}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setConfirming(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
      title="Delete data source"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
