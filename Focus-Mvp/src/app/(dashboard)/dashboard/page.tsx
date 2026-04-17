import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "./_lib/get-dashboard-data";
import { resolvePermissions } from "@/lib/permissions";
import { ZoneAHeader } from "./_components/zone-a-header";
import { ZoneBIntelligence } from "./_components/zone-b-intelligence";
import { ZoneCAttention } from "./_components/zone-c-attention";
import { ZoneDStatusStrip } from "./_components/zone-d-status-strip";
import { ZoneERecentActivity } from "./_components/zone-e-recent-activity";

export default async function DashboardPage() {
  const session = await auth();
  const member = await prisma.orgMember.findFirst({
    where: { userId: session!.user!.id! },
    include: { organization: true },
  });
  if (!member) redirect("/onboarding");
  const orgId = member.organization.id;
  const data = await getDashboardData(orgId);

  const permissions = resolvePermissions(
    member?.role ?? "VIEWER",
    member?.permissions as Record<string, unknown> | null,
  );

  return (
    <div className="space-y-6 w-full animate-fade-in">
      <ZoneAHeader
        journeyState={data.journeyState}
        userName={session?.user?.name}
        orgName={member?.organization.name}
        permissions={permissions}
      />

      <ZoneBIntelligence data={data} permissions={permissions} />

      {data.alerts.length > 0 && (
        <ZoneCAttention alerts={data.alerts} />
      )}

      <ZoneDStatusStrip data={data} permissions={permissions} />

      {data.dataSources.length > 0 && (
        <ZoneERecentActivity dataSources={data.dataSources} />
      )}
    </div>
  );
}
