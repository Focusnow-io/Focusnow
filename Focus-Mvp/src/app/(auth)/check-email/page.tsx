import Link from "next/link";
import Image from "next/image";
import { MailCheck } from "lucide-react";

export default function CheckEmailPage() {
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
              Almost there
            </p>
            <h1 className="text-[42px] font-extrabold leading-[1.1] text-white">
              Verify your<br />email.
            </h1>
          </div>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            We sent a verification link to your inbox. Click it to activate your
            account and start using Focus.
          </p>
        </div>

        <p className="text-xs text-white/30 relative z-10">&copy; 2026 Focus Platform</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          {/* Mobile logo */}
          <Link href="/" className="flex items-center justify-center gap-2 mb-10 lg:hidden">
            <Image src="/logo.svg" alt="Focus" width={32} height={32} />
            <span className="font-bold text-[17px] text-foreground">Focus</span>
          </Link>

          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center">
              <MailCheck className="w-8 h-8 text-[hsl(var(--primary))]" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">Check your inbox</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            We&apos;ve sent a verification link to your email address. Click the link
            to activate your Focus account.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-left text-sm text-muted-foreground space-y-1 mb-8">
            <p className="font-medium text-foreground">Didn&apos;t receive it?</p>
            <p>Check your spam or junk folder. The link expires in 24 hours.</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Already verified?{" "}
            <Link
              href="/login"
              className="text-[hsl(var(--primary))] font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
