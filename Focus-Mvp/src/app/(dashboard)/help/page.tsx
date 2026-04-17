"use client";

import { useState } from "react";
import { HelpCircle, Mail, BookOpen, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I import data?",
    answer:
      "Upload a CSV or connect a data source from the Data → Import page. We support a wide range of CSVs",
  },
  {
    question: "Why isn't my data showing in the chat?",
    answer:
      "Data needs to be imported and processed first. Check the Data → Sources page to confirm your import completed successfully.",
  },
  {
    question: "What are Rules and how do they work?",
    answer:
      "Rules let you define thresholds, policies, and constraints for your operations. They're stored in the Brain and will be connected to the AI chat engine in a future update.",
  },
  {
    question: "How do I add team members?",
    answer:
      "Go to the Admin panel (shield icon in the sidebar). You must be an Owner or Admin to invite new members.",
  },
  {
    question: "How do I reset my tokens?",
    answer:
      "For resetting API tokens, please contact our support team at support@focusnow.io.",
  },
  {
    question: "Where can I find a guide to the Web App?",
    answer:
      "Our documentation is coming soon! In the meantime, feel free to reach out to our support team for any questions or guidance on using the app.",
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <span className={`text-sm font-semibold leading-snug transition-colors ${open ? "text-foreground" : "text-foreground/80"}`}>
          {item.question}
        </span>
        <span className="shrink-0 w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground text-sm font-medium leading-none">
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <HelpCircle className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help &amp; Support</h1>
          <p className="text-sm text-muted-foreground">Find answers, contact us, or explore the documentation.</p>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Frequently Asked Questions</h2>
        <Card className="overflow-hidden">
          {FAQ_ITEMS.map((item) => (
            <FaqRow key={item.question} item={item} />
          ))}
        </Card>
      </div>

      {/* Contact Section */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Contact Support
        </h2>
        <Card>
          <CardContent className="p-5 flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Email us</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Our team typically responds within one business day.
              </p>
              <a
                href="mailto:support@focusnow.io"
                className="inline-block mt-2 text-sm font-semibold text-primary hover:underline"
              >
                support@focusnow.io
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documentation Section */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Documentation
        </h2>
        <Card>
          <CardContent className="p-5 space-y-3">
            {[
              { title: "Getting Started Guide", description: "Set up your workspace and import your first dataset." },
              { title: "Data Import Reference", description: "Supported entity types, file formats, and column mappings." },
              { title: "Brain Rules Reference", description: "How to create and manage versioned operational rules." },
              { title: "API Documentation", description: "Integrate Focus data with your own systems." },
            ].map((doc) => (
              <div
                key={doc.title}
                className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <BookOpen className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 border border-border rounded px-2 py-0.5">
                  <ExternalLink className="w-3 h-3" />
                  Coming Soon
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
