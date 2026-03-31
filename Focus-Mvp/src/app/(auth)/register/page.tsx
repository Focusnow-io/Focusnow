"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        router.push("/login?registered=1");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      {/* Left panel — brand gradient */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(214 89% 52%) 0%, hsl(214 80% 42%) 50%, hsl(214 70% 32%) 100%)",
        }}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute bottom-[10%] left-[-5%] w-[300px] h-[300px] rounded-full bg-white/[0.04] blur-3xl" />

        <Link href="/" className="flex items-center gap-2.5 relative z-10">
          <Image src="/logo.svg" alt="Focus" width={32} height={32} />
          <span className="font-bold text-[17px] text-white tracking-tight">Focus</span>
        </Link>

        <div className="space-y-6 relative z-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Get started free
            </p>
            <h1 className="text-[42px] font-extrabold leading-[1.1] text-white">
              Your operational<br />brain awaits.
            </h1>
          </div>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            Set up in minutes. Import data, define rules, and deploy intelligent apps for your team.
          </p>
          <div className="space-y-3 pt-2">
            {[
              { n: "01", label: "Create your workspace" },
              { n: "02", label: "Import operational data" },
              { n: "03", label: "Define your Brain rules" },
              { n: "04", label: "Deploy your first app" },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-3 text-sm text-white/60">
                <span className="text-[11px] font-bold tabular-nums text-white/80 w-5">{s.n}</span>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/30 relative z-10">No credit card required</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
            <Image src="/logo.svg" alt="Focus" width={32} height={32} />
            <span className="font-bold text-[17px] text-foreground">Focus</span>
          </Link>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Create workspace</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Set up Focus for your industrial team
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName" className="text-xs font-semibold text-foreground">
                Company name
              </Label>
              <Input
                id="orgName" name="orgName"
                placeholder="Acme Manufacturing"
                value={form.orgName} onChange={handleChange} required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                Your name
              </Label>
              <Input
                id="name" name="name"
                placeholder="Jane Smith"
                value={form.name} onChange={handleChange} required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                Work email
              </Label>
              <Input
                id="email" name="email" type="email"
                placeholder="jane@acme.com"
                value={form.email} onChange={handleChange} required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                Password
              </Label>
              <Input
                id="password" name="password" type="password"
                placeholder="Min 6 characters"
                value={form.password} onChange={handleChange} required minLength={6}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-destructive/8 border border-destructive/20 text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full mt-1" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Creating…
                </span>
              ) : "Create workspace"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have a workspace?{" "}
            <Link href="/login" className="text-[hsl(var(--primary))] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
