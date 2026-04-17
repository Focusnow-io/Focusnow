import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="p-6 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your workspace configuration.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <WorkspaceSection
            data={{
              name: org.name,
              slug: org.slug,
              industry: org.industry,
              defaultTimezone: org.defaultTimezone,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <NotificationsSection
            data={{
              notifyImportCompleted: org.notifyImportCompleted,
              notifyImportFailed: org.notifyImportFailed,
              notifyRuleUpdated: org.notifyRuleUpdated,
              notifyBillingIssue: org.notifyBillingIssue,
              notifyProductUpdates: org.notifyProductUpdates,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <BillingSection data={{ plan: org.plan }} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <DangerZoneSection
            workspaceName={org.name}
            userEmail={session.user.email!}
          />
        </CardContent>
      </Card>
    </div>
  );
}
