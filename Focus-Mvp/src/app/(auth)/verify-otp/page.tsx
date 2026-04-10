"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

export default function VerifyOtpPage() {
  const router = useRouter();
  const params = useSearchParams();
  const pendingId = params.get("p") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // If no pendingId in URL, send back to login
  useEffect(() => {
    if (!pendingId) router.replace("/login");
  }, [pendingId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: verify the OTP code and exchange it for a one-time sign-in token
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "locked") {
          setError("Too many failed attempts. Please sign in again.");
          setTimeout(() => router.replace("/login"), 2_000);
          return;
        }
        if (data.error === "expired") {
          setError("Code has expired. Please request a new one.");
          return;
        }
        const left = data.attemptsLeft as number | undefined;
        setError(
          left !== undefined
            ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`
            : "Incorrect code."
        );
        return;
      }

      // Step 2: use the sign-in token to create the NextAuth session
      const result = await signIn("credentials", {
        signInToken: data.signInToken,
        redirect: false,
      });

      if (result?.error || !result?.ok) {
        setError("Sign-in failed. Please try again.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendSuccess(false);
    setError("");

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId }),
      });

      if (res.ok) {
        setResendSuccess(true);
        setCode("");
      } else {
        setError("Could not resend code. Please sign in again.");
      }
    } catch {
      setError("Could not resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (!pendingId) return null;

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(214 89% 52%) 0%, hsl(214 80% 42%) 50%, hsl(214 70% 32%) 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute bottom-[10%] left-[-5%] w-[300px] h-[300px] rounded-full bg-white/[0.04] blur-3xl" />

        <Link href="/" className="flex items-center gap-2.5 relative z-10">
          <Image src="/logo.svg" alt="Focus" width={32} height={32} />
          <span className="font-bold text-[17px] text-white tracking-tight">Focus</span>
        </Link>

        <div className="space-y-6 relative z-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Security Check
            </p>
            <h1 className="text-[42px] font-extrabold leading-[1.1] text-white">
              One last<br />step.
            </h1>
          </div>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            We sent a 6-digit code to your email. Enter it below to complete sign-in.
          </p>
        </div>

        <p className="text-xs text-white/30 relative z-10">&copy; 2026 Focus Platform</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
            <Image src="/logo.svg" alt="Focus" width={32} height={32} />
            <span className="font-bold text-[17px] text-foreground">Focus</span>
          </Link>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Enter verification code</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Check your email for the 6-digit code we just sent.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-xs font-semibold text-foreground">
                Verification code
              </Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center tracking-[0.4em] text-lg font-mono"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-destructive/8 border border-destructive/20 text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            {resendSuccess && (
              <p className="text-sm text-emerald-600 text-center">
                A new code has been sent to your email.
              </p>
            )}

            <Button
              type="submit"
              className="w-full mt-1"
              disabled={loading || code.length < 6}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Verifying…
                </span>
              ) : (
                "Verify & sign in"
              )}
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm text-[hsl(var(--primary))] font-semibold hover:underline disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
            <Link href="/login" className="text-sm text-muted-foreground hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
