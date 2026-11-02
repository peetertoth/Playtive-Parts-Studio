import type { Metadata } from "next";
import { PlannerStudio } from "@/components/planner/planner-studio";
import { getRequestLocale } from "@/i18n/server";
import { siteMessages } from "@/i18n/site-messages";
import "./planner.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = siteMessages[await getRequestLocale()];
  return { title: messages.plannerTitle, description: messages.plannerDescription };
}

export default function PlannerPage() {
  return <PlannerStudio />;
}
