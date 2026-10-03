import { dashboardMetrics, organizationProfile, prospects } from "@/lib/mock-data";
import type { HumanReview, OrganizationProfile, Prospect, ProspectStatus } from "@/types/prospect";

const delay = () => new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 250));

export async function getDashboardMetrics() {
  await delay();
  return dashboardMetrics;
}

export async function getProspects(filters?: { query?: string; status?: ProspectStatus | "all" }) {
  await delay();
  return prospects.filter((prospect) => {
    const queryMatch = !filters?.query || `${prospect.name} ${prospect.focusAreas.join(" ")}`.toLowerCase().includes(filters.query.toLowerCase());
    const statusMatch = !filters?.status || filters.status === "all" || prospect.status === filters.status;
    return queryMatch && statusMatch;
  });
}

export async function getProspect(id: string) {
  await delay();
  return prospects.find((prospect) => prospect.id === id) ?? null;
}

export async function saveProspect(id: string) {
  await delay();
  return { id, saved: true };
}

export async function updateProspectStatus(id: string, status: ProspectStatus) {
  await delay();
  return { id, status };
}

export async function submitHumanReview(id: string, review: HumanReview) {
  await delay();
  return { id, ...review, submitted: true };
}

export async function analyzeProspect(input: { name: string; mission: string }): Promise<Prospect> {
  await delay();
  const template = prospects[0];
  return { ...template, id: `analysis-${Date.now()}`, name: input.name, summary: `Demo analysis for ${input.name} against the supplied mission: ${input.mission}` };
}

export async function getOrganizationProfile(): Promise<OrganizationProfile> {
  await delay();
  return organizationProfile;
}