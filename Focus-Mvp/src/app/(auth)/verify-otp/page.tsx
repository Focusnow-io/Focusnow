"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

// Rotating status copy shown while the sign-in request is in flight.
// Order is intentional — the user sees a sense of forward progress
// ("verifying → creating session → loading workspace") even though
// the actual network round-trip is a single request. The last entry
// stays on screen if the server is slow so we never cycle back to
// "Verifying…" after we've already told the user we're almost done.
const SIGN_IN_MESSAGES = [
  "Verifying your code…",
  "Creating your session…",
  "Loading your workspace…",
  "Almost there — just a moment…",
];

function VerifyOtpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const pendingId = params.get("p") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Rotating message shown inside the sign-in overlay. Cycles every
  // 1.5s while isVerifying; frozen on the last copy once we reach it
  // so the user doesn't see the cycle loop back to the start if the
  // navigation hasn't fired yet.
  const [messageIdx, setMessageIdx] = useState(0);
  const messageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // If no pendingId in URL, send back to login
  useEffect(() => {
    if (!pendingId) router.replace("/login");
  }, [pendingId, router]);

  // Advance the overlay message while the sign-in request is live.
  useEffect(() => {
    if (!isVerifying) {
      if (messageIdx !== 0) setMessageIdx(0);
      return;
    }
    messageTimer.current = setInterval(() => {
      setMessageIdx((i) => Math.min(i + 1, SIGN_IN_MESSAGES.length - 1));
    }, 1500);
    return () => {
      if (messageTimer.current) clearInterval(messageTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerifying]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsVerifying(true);

    // Flag flipped only on the *error* paths below — on success we
    // leave isVerifying true so the overlay keeps running through
    // the navigation. Resetting it in a finally block would cause a
    // visible flicker between "Almost there…" and the dashboard
    // first paint.
    let failed = false;

    try {
      // Step 1: verify the OTP code and exchange it for a one-time sign-in token
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        failed = true;
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
        failed = true;
        setError("Sign-in failed. Please try again.");
        return;
      }

      // Success — overlay stays up through the full-page nav.
      window.location.href = "/dashboard";
    } catch {
      failed = true;
      setError("Something went wrong. Please try again.");
    } finally {
      if (failed) setIsVerifying(false);
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
      <div className="flex-1 flex items-center justify-center p-8 relative">
        {/* Sign-in progress overlay — mounted while isVerifying is
            true, stays in place through the window.location redirect
            so the user doesn't see the form reappear between
            "verifying" and the first dashboard paint. A concentric
            triple-ring animation reads as ambient progress without
            suggesting a specific percentage. */}
        {isVerifying && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[hsl(var(--background))]/95 backdrop-blur-sm animate-in fade-in duration-200"
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-[hsl(var(--primary))]/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[hsl(var(--primary))] animate-spin" />
              <div
                className="absolute inset-2 rounded-full border-2 border-transparent border-t-[hsl(var(--primary))]/60 animate-spin"
                style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
              />
            </div>
            <div className="text-center space-y-1 max-w-[22rem] px-6">
              <p className="text-lg font-semibold text-foreground">
                Signing you in
              </p>
              <p
                key={messageIdx}
                className="text-sm text-muted-foreground animate-in fade-in duration-300"
              >
                {SIGN_IN_MESSAGES[messageIdx]}
              </p>
            </div>
          </div>
        )}

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
                disabled={isVerifying}
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
              disabled={isVerifying || code.length < 6}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing you in…
                </>
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

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <VerifyOtpForm />
    </Suspense>
  );
}
