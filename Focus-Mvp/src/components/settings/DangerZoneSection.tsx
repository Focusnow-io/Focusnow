"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, Download, Trash2 } from "lucide-react";

interface DangerZoneProps {
  workspaceName: string;
  userEmail: string;
  userRole?: string | null;
}

export function DangerZoneSection({ workspaceName, userEmail, userRole }: DangerZoneProps) {
  if (userRole !== "OWNER") return null;
  const { success, error } = useToast();
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/settings/export", { method: "POST" });
      if (!res.ok) throw new Error("Export request failed");
      success(`Export requested. We'll email the data to ${userEmail} within 5 minutes.`);
      setExportOpen(false);
    } catch {
      error("Failed to request data export.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmName !== workspaceName) {
      error("Workspace name does not match.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmWorkspaceName: confirmName }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Deletion failed");
      }
      // Redirect to login after account deletion
      window.location.href = "/login";
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">Irreversible actions. Proceed with caution.</p>
      </div>

      <div className="max-w-lg rounded-lg border-2 border-red-200 dark:border-red-900 p-4 space-y-4">
        {/* Export all data */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Export all data</p>
            <p className="text-xs text-muted-foreground">
              Download all your data as a ZIP file (CSVs, rules as JSON, version history).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
        </div>

        <div className="border-t border-red-100 dark:border-red-900" />

        {/* Delete account */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete all data, rules, and apps. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export all data</DialogTitle>
            <DialogDescription>
              We&apos;ll email a full export to <strong>{userEmail}</strong>. This may take a few minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Requesting..." : "Confirm export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog — two-step */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); setConfirmName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete account
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all your data, rules, and apps. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-name">
              Type <strong>{workspaceName}</strong> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspaceName}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setConfirmName(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmName !== workspaceName || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
