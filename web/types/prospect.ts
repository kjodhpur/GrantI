export type ProspectStatus =
  | "research"
  | "shortlist"
  | "outreach"
  | "applied"
  | "won"
  | "not_pursued";

export interface MatchFactor {
  label: string;
  score?: number;
  value?: string;
  confidence: "high" | "medium" | "low";
}

export interface EvidenceItem {
  id: string;
  type: "filing" | "grant_history" | "website" | "announcement" | "public_update";
  title: string;
  summary: string;
  date?: string;
  sourceLabel: string;
}

export interface Prospect {
  id: string;
  name: string;
  matchScore: number;
  typicalGrantMin: number;
  typicalGrantMax: number;
  focusAreas: string[];
  geography: string[];
  recentSignal?: string;
  status: ProspectStatus;
  summary: string;
  evidence: EvidenceItem[];
  factors: MatchFactor[];
}

export interface HumanReview {
  decision: "confirm_fit" | "reduce_priority" | "reject";
  note?: string;
}

export interface OrganizationProfile {
  name: string;
  mission: string;
  geography: string[];
  focusAreas: string[];
  fundingNeed: string;
}