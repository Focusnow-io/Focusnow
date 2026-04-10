import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

// POST /api/chat/conversations — create a new conversation
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  console.log("[API][chat/conversation/create]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : "New conversation";
  const projectId = typeof body.projectId === "string" ? body.projectId : null;

  const conversation = await prisma.conversation.create({
    data: {
      orgId: ctx.org.id,
      userId: ctx.session.user!.id!,
      title,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json({ id: conversation.id });
}

// GET /api/chat/conversations — list conversations for current user's org
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  // TODO: role-based chat access
  const conversations = await prisma.conversation.findMany({
    where: { orgId: ctx.org.id, userId: ctx.session.user!.id! },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      messageCount: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messageCount,
      projectId: c.projectId ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessage: c.messages[0]?.content?.slice(0, 100) ?? null,
      lastMessageRole: c.messages[0]?.role ?? null,
    })),
  });
}
