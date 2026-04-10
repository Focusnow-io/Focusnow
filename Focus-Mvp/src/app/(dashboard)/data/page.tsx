import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Database, FileText, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DeleteSourceButton } from "@/components/delete-source-button";
import { resolvePermissions } from "@/lib/permissions";

export default async function DataSourcesPage() {
  const session = await auth();
  const member = await prisma.orgMember.findFirst({
    where: { userId: session!.user!.id! },
    include: { organization: true },
  });
  const orgId = member!.organization.id;

  const permissions = resolvePermissions(
    member?.role ?? "VIEWER",
    member?.permissions as Record<string, unknown> | null,
  );

  const [sources, activeRuleCount] = await Promise.all([
    prisma.dataSource.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.brainRule.count({
      where: { organizationId: orgId, status: "ACTIVE" },
    }),
  ]);

  const hasCompletedImport = sources.some((s) => s.status === "COMPLETED");
  const showCreateRuleNudge = hasCompletedImport && activeRuleCount === 0 && permissions.brain && permissions.import;

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Data Sources</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Ingested files and their import status
          </p>
        </div>
        {permissions.import && (
          <Button asChild>
            <Link href="/data/import">
              <Upload className="w-4 h-4 mr-2" /> Import data
            </Link>
          </Button>
        )}
      </div>

      {/* Step 1c: Post-import nudge to create first rule */}
      {showCreateRuleNudge && (
        <div
          className="rounded-xl border border-orange-200 bg-orange-50/60 overflow-hidden"
          style={{ borderLeft: "3px solid #F04A00" }}
        >
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug">
              Your data is in. Now teach Focus how your operations work.
            </h3>
            <p className="text-[13px] text-gray-600 mt-1 leading-relaxed max-w-xl">
              Data alone gives Focus facts. Rules give Focus judgment. Add your
              first rule to tell Focus how your business actually runs.
            </p>
            <div className="mt-3">
              <Button size="sm" asChild>
                <Link href="/brain/new">
                  Create your first rule
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-xl">
          <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-600 mb-1">No data here yet.</h3>
          <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">
            {permissions.import
              ? "Import a CSV to populate this table. Inventory, suppliers, orders, or products — start with whatever you have."
              : "Your workspace has no data imported yet. Contact your admin to import data."}
          </p>
          {permissions.import && (
            <Button asChild>
              <Link href="/data/import">Import data</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{source.name}</p>
                      <p className="text-xs text-gray-500">
                        {source.originalName} · {(source.fileSize / 1024).toFixed(1)} KB
                        {source.rowCount && ` · ${source.rowCount} rows`}
                        {source.importedRows != null && ` (${source.importedRows} imported)`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {formatDate(source.createdAt)}
                    </span>
                    <Badge
                      variant={
                        source.status === "COMPLETED"
                          ? "success"
                          : source.status === "FAILED"
                          ? "destructive"
                          : source.status === "PROCESSING"
                          ? "info"
                          : "warning"
                      }
                    >
                      {source.status.toLowerCase()}
                    </Badge>
                    {permissions.import && (source.status === "MAPPING" || source.status === "PENDING") ? (
                      <Link
                        href={`/data/import?resume=${source.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Continue →
                      </Link>
                    ) : null}
                    {permissions.import && <DeleteSourceButton id={source.id} />}
                  </div>
                </div>
                {source.errorMessage && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">
                    {source.errorMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
