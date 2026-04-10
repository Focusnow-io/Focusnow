import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Local shape types (match the Prisma select below; avoids implicit `any`
// until `prisma generate` is run after the migration)
// ---------------------------------------------------------------------------

interface RawConversation {
  id: string;
  title: string;
  messageCount: number;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: { content: string; role: string }[];
}

interface RawProject {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  conversations: RawConversation[];
}

// GET — list all projects for the current user's org, with their conversations
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const rawProjects = await prisma.chatProject.findMany({
    where: { orgId: ctx.org.id, userId: ctx.session.user!.id! },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      conversations: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          messageCount: true,
          projectId: true,
          updatedAt: true,
          createdAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true },
          },
        },
      },
    },
  });

  const projects = (rawProjects as unknown as RawProject[]).map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    conversations: p.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messageCount,
      projectId: c.projectId ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessage: c.messages[0]?.content?.slice(0, 100) ?? null,
      lastMessageRole: c.messages[0]?.role ?? null,
    })),
  }));

  return NextResponse.json({ projects });
}

// POST — create a new project
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  if (!name) return badRequest("name is required");

  const project = await prisma.chatProject.create({
    data: { orgId: ctx.org.id, userId: ctx.session.user!.id!, name },
  });

  console.log("[API][chat/project/create]", { projectId: project.id, name, orgId: ctx.org.id });
  return NextResponse.json({ project }, { status: 201 });
}
