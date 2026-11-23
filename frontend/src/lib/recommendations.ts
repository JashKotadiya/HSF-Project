import type { Project } from "@/lib/projects";

export type RecommendationMode = "personalized" | "cold_start" | "general";

export type RecommendedProject = Project & {
  score: number;
  cause_score: number;
  skill_score: number;
  peer_score: number;
  reasons: string[];
  ranking_mode: RecommendationMode;
};

export type RecommendationSignals = {
  volunteer_id: string;
  interests: string[];
  skills: string[];
  pending_application_count: number;
  approved_participation_count: number;
  has_interests: boolean;
  has_skills: boolean;
  cold_start: boolean;
};

export const RECOMMENDATION_PAGE_SIZE = 6;
