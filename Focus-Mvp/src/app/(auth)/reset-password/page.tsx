"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    if (!token) { router.replace("/forgot-password"); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { valid: boolean }) => setTokenState(d.valid ? "valid" : "invalid"))
      .catch(() => setTokenState("invalid"));
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "invalid_token" ? "This reset link is invalid or has expired. Please request a new one." : "Something went wrong. Please try again.");
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  const rightPanel =
    tokenState === "checking" ? (
      <div className="flex items-center justify-center h-32">
        <span className="w-5 h-5 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    ) : tokenState === "invalid" ? (
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Link already used</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
              This password reset link has already been used or has expired. Request a new one to continue.
            </p>
          </div>
          <Button asChild className="mt-2">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </div>
    ) : (
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <Image src="/logo.svg" alt="Focus" width={32} height={32} />
          <span className="font-bold text-[17px] text-foreground">Focus</span>
        </Link>
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Set new password</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Choose a strong password for your account.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-foreground">New password</Label>
            <Input id="password" type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-xs font-semibold text-foreground">Confirm password</Label>
            <Input id="confirm" type="password" placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-destructive/8 border border-destructive/20 text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" className="w-full mt-1" disabled={loading}>
            {loading ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Resetting…</span> : "Reset password"}
          </Button>
        </form>
      </div>
    );

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(214 89% 52%) 0%, hsl(214 80% 42%) 50%, hsl(214 70% 32%) 100%)" }}
      >
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute bottom-[10%] left-[-5%] w-[300px] h-[300px] rounded-full bg-white/[0.04] blur-3xl" />
        <Link href="/" className="flex items-center gap-2.5 relative z-10">
          <Image src="/logo.svg" alt="Focus" width={32} height={32} />
          <span className="font-bold text-[17px] text-white tracking-tight">Focus</span>
        </Link>
        <div className="space-y-6 relative z-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Account Recovery</p>
            <h1 className="text-[42px] font-extrabold leading-[1.1] text-white">Choose a new<br />password.</h1>
          </div>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">Pick something strong — at least 6 characters.</p>
        </div>
        <p className="text-xs text-white/30 relative z-10">&copy; 2026 Focus Platform</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        {rightPanel}
      </div>
    </div>
  );
}
