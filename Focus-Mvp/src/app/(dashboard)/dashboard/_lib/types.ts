import type { OperationalAlert } from "@/lib/ode/types";

export type DashboardJourneyState =
  | "NEW"
  | "DATA_ONLY"
  | "DATA_AND_BRAIN"
  | "ACTIVE";

export interface OperationalKPIs {
  inventoryHealthPct: number; // % SKUs healthy (not at-risk)
  skusAtRisk: number;
  totalSKUs: number;
  avgDaysOfSupply: number | null;
  totalInventoryValue: number;
  buyRecommendations: number;
  overduePOs: number;
  openPOValue: number;
}

export interface DashboardData {
  productCount: number;
  supplierCount: number;
  inventoryCount: number;
  orderCount: number;
  activeRuleCount: number;
  draftRuleCount: number;
  activeAppCount: number;
  ruleDomains: string[];
  activeRules: Array<{
    id: string;
    name: string;
    category: string;
    entity: string;
    updatedAt: Date;
  }>;
  apps: Array<{
    id: string;
    name: string;
    template: string;
  }>;
  dataSources: Array<{
    id: string;
    name: string;
    originalName: string;
    rowCount: number | null;
    status: string;
    createdAt: Date;
  }>;
  alerts: OperationalAlert[];
  journeyState: DashboardJourneyState;
  operationalKPIs: OperationalKPIs | null;
}
