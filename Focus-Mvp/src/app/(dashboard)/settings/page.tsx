import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Separator } from "@/components/ui/separator";
import { WorkspaceSection } from "@/components/settings/WorkspaceSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { DangerZoneSection } from "@/components/settings/DangerZoneSection";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  });

  if (!member) redirect("/login");

  const org = member.organization;

  return (
    <div className="space-y-1 animate-fade-in max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Manage your workspace configuration.
      </p>

      <div className="pt-6 space-y-8">
        <WorkspaceSection
          data={{
            name: org.name,
            slug: org.slug,
            industry: org.industry,
            defaultTimezone: org.defaultTimezone,
          }}
        />

        <Separator />

        <NotificationsSection
          data={{
            notifyImportCompleted: org.notifyImportCompleted,
            notifyImportFailed: org.notifyImportFailed,
            notifyRuleUpdated: org.notifyRuleUpdated,
            notifyBillingIssue: org.notifyBillingIssue,
            notifyProductUpdates: org.notifyProductUpdates,
          }}
        />

        <Separator />

        <BillingSection data={{ plan: org.plan }} />

        <Separator />

        <DangerZoneSection
          workspaceName={org.name}
          userEmail={session.user.email!}
          userRole={member.role}
        />
      </div>
    </div>
  );
}
