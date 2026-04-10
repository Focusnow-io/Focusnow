"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shield, Trash2, ChevronDown, AlertCircle, CheckCircle2, X, UserPlus, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSION_META, ROLE_DEFAULTS, resolvePermissions, type UserPermissions } from "@/lib/permissions";

interface Member {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  permissions?: UserPermissions | Record<string, boolean> | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-blue-100 text-blue-700 border-blue-200",
  ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
  MEMBER: "bg-emerald-100 text-emerald-700 border-emerald-200",
  VIEWER: "bg-gray-100 text-gray-500 border-gray-200",
};

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // Create User modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", role: "MEMBER" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Permissions modal state
  const [permTarget, setPermTarget] = useState<Member | null>(null);
  const [permDraft, setPermDraft] = useState<UserPermissions | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMembers = useCallback(async () => {
    const res = await fetch("/api/admin/members");
    if (res.status === 403) { router.replace("/dashboard"); return; }
    const data = await res.json();
    setMembers(data.members ?? []);
    const me = (data.members as Member[]).find((m) => m.user.id === session?.user?.id);
    if (me) setMyRole(me.role);
    if (me && (me.role === "MEMBER" || me.role === "VIEWER")) { router.replace("/dashboard"); }
    setLoading(false);
  }, [session?.user?.id, router]);

  useEffect(() => { if (session) fetchMembers(); }, [session, fetchMembers]);

  function showFeedback(type: "success" | "error", message: string) {
    if (type === "success") { setActionSuccess(message); setActionError(null); }
    else { setActionError(message); setActionSuccess(null); }
    setTimeout(() => { setActionSuccess(null); setActionError(null); }, 4000);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleting(true);
    setMutatingId(id);
    try {
      const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
        showFeedback("success", `${name ?? "Member"} has been removed.`);
      } else {
        const data = await res.json().catch(() => ({}));
        showFeedback("error", data.error ?? "Failed to remove member. Please try again.");
      }
    } catch {
      showFeedback("error", "Network error. Please check your connection and try again.");
    } finally {
      setDeleting(false);
      setMutatingId(null);
      setDeleteTarget(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const submittedEmail = createForm.email.trim(); // capture before state reset
    try {
      const res = await fetch("/api/admin/members/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: submittedEmail,
          role: createForm.role,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((prev) => [...prev, { ...data.member, createdAt: data.member.createdAt ?? new Date().toISOString() } as Member]);
        setCreateForm({ name: "", email: "", role: "MEMBER" });
        setShowCreateModal(false);
        showFeedback("success", `Invite sent to ${submittedEmail}. They'll receive an email to set their password.`);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === "email_taken") {
          setCreateError("A user with this email already exists.");
        } else {
          setCreateError(data.error ?? "Failed to create user. Please try again.");
        }
      }
    } catch {
      setCreateError("Network error. Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(id: string, role: string) {
    setMutatingId(id);
    try {
      const res = await fetch(`/api/admin/members/${id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => m.id === id ? { ...m, role: role as Member["role"] } : m));
        showFeedback("success", "Role updated successfully.");
      } else {
        const data = await res.json().catch(() => ({}));
        showFeedback("error", data.error ?? "Failed to update role. Please try again.");
      }
    } catch {
      showFeedback("error", "Network error. Please check your connection and try again.");
    } finally {
      setMutatingId(null);
    }
  }

  function openPermissions(member: Member) {
    setPermTarget(member);
    setPermDraft(resolvePermissions(member.role, member.permissions as Record<string, unknown> | null));
  }

  async function handleSavePermissions() {
    if (!permTarget || !permDraft) return;
    setSavingPerms(true);
    try {
      const res = await fetch(`/api/admin/members/${permTarget.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permDraft),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => m.id === permTarget.id ? { ...m, permissions: permDraft } : m));
        setPermTarget(null);
        setPermDraft(null);
        showFeedback("success", `Permissions updated for ${permTarget.user.name ?? permTarget.user.email}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        showFeedback("error", data.error ?? "Failed to save permissions.");
      }
    } catch {
      showFeedback("error", "Network error. Please try again.");
    } finally {
      setSavingPerms(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Manage workspace members and permissions.</p>
          </div>
        </div>
        <Button
          onClick={() => { setShowCreateModal(true); setCreateError(null); }}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          <UserPlus className="w-4 h-4" />
          Create User
        </Button>
      </div>

      {actionError && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/8 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Permissions Modal */}
      {permTarget && permDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !savingPerms && (setPermTarget(null), setPermDraft(null))} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Edit Permissions</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {permTarget.user.name ?? permTarget.user.email} · <span className={`font-medium ${permTarget.role === "ADMIN" ? "text-purple-600" : permTarget.role === "MEMBER" ? "text-emerald-600" : "text-gray-500"}`}>{permTarget.role}</span>
                </p>
              </div>
              <button
                onClick={() => !savingPerms && (setPermTarget(null), setPermDraft(null))}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {["Data", "Intelligence", "Apps"].map((group) => {
                const items = PERMISSION_META.filter((p) => p.group === group);
                return (
                  <div key={group}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</p>
                    <div className="space-y-1 rounded-lg border border-border overflow-hidden">
                      {items.map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{perm.label}</p>
                            <p className="text-xs text-muted-foreground">{perm.description}</p>
                          </div>
                          <div
                            onClick={() => setPermDraft((d) => d ? { ...d, [perm.key]: !d[perm.key] } : d)}
                            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${permDraft[perm.key] ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${permDraft[perm.key] ? "translate-x-4" : "translate-x-0"}`} />
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPermDraft(ROLE_DEFAULTS[permTarget.role] ?? ROLE_DEFAULTS.VIEWER);
                }}
                disabled={savingPerms}
                className="flex-1"
              >
                Reset to defaults
              </Button>
              <Button size="sm" onClick={handleSavePermissions} disabled={savingPerms} className="flex-1 gap-1.5">
                {savingPerms ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-background shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-destructive" />
              </div>
              <button
                onClick={() => !deleting && setDeleteTarget(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Remove member</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Are you sure you want to remove <span className="font-medium text-foreground">{deleteTarget.name ?? "this member"}</span> from the workspace? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 gap-1.5"
              >
                {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Removing…</> : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !creating && setShowCreateModal(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Create User</h2>
                <p className="text-xs text-muted-foreground mt-0.5">They'll receive an email to set their password.</p>
              </div>
              <button
                onClick={() => !creating && setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name" className="text-xs font-semibold text-foreground">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cu-name"
                  placeholder="Jane Smith"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={creating}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cu-email" className="text-xs font-semibold text-foreground">Email</Label>
                <Input
                  id="cu-email"
                  type="email"
                  placeholder="jane@company.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={creating}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cu-role" className="text-xs font-semibold text-foreground">Role</Label>
                <select
                  id="cu-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  disabled={creating}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              {createError && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/8 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {createError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => !creating && setShowCreateModal(false)}
                  disabled={creating}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={creating} className="flex-1 gap-1.5">
                  {creating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send Invite"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Member</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => {
              const isMe = member.user.id === session?.user?.id;
              const canChangeRole = myRole === "OWNER" && !isMe;
              const canRemove = (myRole === "OWNER" || myRole === "ADMIN") && !isMe && member.role !== "OWNER";
              const canEditPerms = myRole === "OWNER" && !isMe && member.role !== "OWNER";

              return (
                <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {(member.user.name ?? member.user.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{member.user.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canChangeRole ? (
                      <div className="relative inline-flex items-center">
                        <span className={`absolute left-2.5 w-1.5 h-1.5 rounded-full pointer-events-none ${
                          member.role === "OWNER" ? "bg-blue-500" :
                          member.role === "ADMIN" ? "bg-purple-500" :
                          member.role === "MEMBER" ? "bg-emerald-500" : "bg-gray-400"
                        }`} />
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          disabled={mutatingId === member.id}
                          className={`text-xs font-semibold pl-6 pr-7 py-1.5 rounded-full border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${ROLE_COLORS[member.role] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-2.5 pointer-events-none opacity-60" />
                      </div>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[member.role] ?? ""}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          member.role === "OWNER" ? "bg-blue-500" :
                          member.role === "ADMIN" ? "bg-purple-500" :
                          member.role === "MEMBER" ? "bg-emerald-500" : "bg-gray-400"
                        }`} />
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEditPerms && (
                        <button
                          onClick={() => openPermissions(member)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                          title="Edit permissions"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canRemove && (
                        <button
                          onClick={() => setDeleteTarget({ id: member.id, name: member.user.name })}
                          disabled={mutatingId === member.id}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
