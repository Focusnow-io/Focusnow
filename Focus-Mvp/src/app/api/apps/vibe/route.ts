export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const TEMPLATE_CONTEXT: Record<string, string> = {
  INVENTORY_COMMAND_CENTER: `This is an Inventory Command Center providing complete visibility into inventory health.
Current features: KPI cards (total value, SKUs at risk, avg days of supply, need reorder), inventory value by category bar chart, stock health donut chart, filterable/searchable inventory table with status badges.
Configurable options: category filters, alert thresholds, chart types, columns shown, sort order, value formatting.`,

  PROCUREMENT_HUB: `This is a Procurement Hub showing purchase order pipeline and supplier scorecard.
Current features: KPI cards (open PO value, at-risk POs, avg on-time %, active suppliers), PO pipeline bar chart, open orders table with overdue highlighting, supplier scorecard with on-time progress bars and spend.
Configurable options: date range filters, overdue threshold, supplier filters, spend categories, KPI targets.`,

  DEMAND_FULFILLMENT: `This is a Demand & Fulfillment dashboard tracking sales orders, production, and demand coverage.
Current features: KPI cards (open SOs, SO value, production rate, at-risk SKUs), fulfillment pipeline chart, sales order table with fulfillment progress, work order table with production progress, at-risk SKUs table with coverage status.
Configurable options: date range, fulfillment thresholds, demand horizon, coverage calculations, status filters.`,

  DATA_CHAT: `This is a Data Chat powered by Claude AI.
The user can ask questions about their inventory, orders, suppliers, and products in natural language.
Configurable options: suggested questions shown at start, response style (concise vs detailed), data scope.`,
};

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const { messages, template, instanceId } = body as {
    messages: { role: "user" | "assistant"; content: string }[];
    template: string;
    instanceId?: string;
  };

  if (!messages?.length) return badRequest("messages required");
  if (!template) return badRequest("template required");
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const templateCtx = TEMPLATE_CONTEXT[template] ?? `This is a ${template} app.`;

  const systemPrompt = `You are an expert at customizing operational dashboards. The user wants to modify the current app.

## Current App Context
${templateCtx}

## What you CAN change (config keys only)
You can only modify the app's configuration object. Supported customizations include:
- Filters and search defaults (e.g. default category filter, default search text)
- Titles and subtitles shown on the dashboard
- Column visibility (show/hide specific table columns, if the template supports it)
- Alert thresholds and highlighting rules (e.g. overdue threshold in days, low-stock threshold)
- KPI targets and benchmark values
- Date range defaults and demand horizon settings
- Suggested questions (for chat templates)
- Value formatting preferences (e.g. currency, decimal places)

## What you CANNOT change
These things are hardcoded in the React component and CANNOT be changed through configuration:
- Page layout or structure (number of sections, grid arrangement)
- Adding new components, charts, or tables that don't already exist on the page
- Changing chart libraries or chart types (e.g. bar → line)
- Restructuring the data model or adding new data fields
- Custom CSS or visual styling beyond what config supports

## Your role
Help the user customize this dashboard within the supported config options above.
If the user asks for something outside what config supports, politely acknowledge the limitation and suggest an achievable alternative. For example: "I can't add a new chart to the page since the layout is fixed, but I can adjust the threshold that highlights at-risk items — would that help?"
Describe what you changed in 2-4 bullet points. Write in first person ("I updated...", "Changed X to Y") — never say "The user wants..." or narrate the request back.
Keep responses concise and actionable. Don't ask unnecessary clarifying questions — make reasonable assumptions.

When you respond, also include a JSON config patch at the end in this exact format:
<config_patch>
{ "key": "value" }
</config_patch>
The config patch will be merged into the app's config object to persist the customization.
If the request cannot be fulfilled through config at all, still include an empty config patch: <config_patch>{}</config_patch>`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract config patch if present
    let configPatch: Record<string, unknown> = {};
    const patchMatch = raw.match(/<config_patch>\s*([\s\S]*?)\s*<\/config_patch>/);
    if (patchMatch) {
      try { configPatch = JSON.parse(patchMatch[1]) as Record<string, unknown>; } catch { /* ignore */ }
    }

    // Clean text: remove the config patch block from the user-visible response
    const cleanText = raw.replace(/<config_patch>[\s\S]*?<\/config_patch>/g, "").trim();

    // Persist the config patch if instanceId provided
    if (instanceId && Object.keys(configPatch).length > 0) {
      const existing = await prisma.appInstance.findFirst({
        where: { id: instanceId, organizationId: ctx.org.id },
      });
      if (existing) {
        const mergedConfig = { ...(existing.config as Record<string, unknown> ?? {}), ...configPatch };
        await prisma.appInstance.update({
          where: { id: instanceId },
          data: { config: mergedConfig as Record<string, never> },
        });
      }
    }

    return NextResponse.json({ message: cleanText, configPatch });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
