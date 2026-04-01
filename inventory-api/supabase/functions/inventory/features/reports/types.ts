/**
 * Reports Feature Types
 * Type definitions for inventory reporting functionality
 */

// Inventory valuation report
export interface ValuationReport {
  generatedAt: Date;
  organizationId: string;
  currency: string;
  summary: ValuationSummary;
  byCategory: CategoryValuation[];
  byLocation: LocationValuation[];
  topItems: ItemValuation[];
}

export interface ValuationSummary {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  averageItemValue: number;
  lowStockItems: number;
  outOfStockItems: number;
}

export interface CategoryValuation {
  category: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  percentageOfTotal: number;
}

export interface LocationValuation {
  locationId: string;
  locationName: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  capacityUsed: number;
}

export interface ItemValuation {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
}

// Movement report
export interface MovementReport {
  generatedAt: Date;
  organizationId: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  summary: MovementReportSummary;
  byType: MovementTypeSummary[];
  byItem: ItemMovementSummary[];
  byLocation: LocationMovementSummary[];
  dailyTrends: DailyMovementTrend[];
}

export interface MovementReportSummary {
  totalMovements: number;
  totalInbound: number;
  totalOutbound: number;
  totalTransfers: number;
  totalAdjustments: number;
  netChange: number;
}

export interface MovementTypeSummary {
  type: string;
  count: number;
  totalQuantity: number;
  totalValue: number;
}

export interface ItemMovementSummary {
  itemId: string;
  sku: string;
  name: string;
  inbound: number;
  outbound: number;
  netChange: number;
}

export interface LocationMovementSummary {
  locationId: string;
  locationName: string;
  inbound: number;
  outbound: number;
  transfers: number;
}

export interface DailyMovementTrend {
  date: string;
  inbound: number;
  outbound: number;
  netChange: number;
}

// Turnover report
export interface TurnoverReport {
  generatedAt: Date;
  organizationId: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  summary: TurnoverSummary;
  byItem: ItemTurnover[];
  byCategory: CategoryTurnover[];
  slowMoving: ItemTurnover[];
  fastMoving: ItemTurnover[];
}

export interface TurnoverSummary {
  averageTurnoverRate: number;
  totalItemsAnalyzed: number;
  slowMovingCount: number;
  fastMovingCount: number;
  daysInPeriod: number;
}

export interface ItemTurnover {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  averageInventory: number;
  totalSold: number;
  turnoverRate: number;
  daysToSell: number;
}

export interface CategoryTurnover {
  category: string;
  itemCount: number;
  averageTurnoverRate: number;
  totalSold: number;
}

// Report query parameters
export interface ReportDateRange {
  startDate: Date;
  endDate: Date;
}

export interface ValuationReportParams {
  asOfDate?: Date;
  includeZeroStock?: boolean;
  categories?: string[];
  locations?: string[];
}

export interface MovementReportParams extends ReportDateRange {
  itemIds?: string[];
  locationIds?: string[];
  movementTypes?: string[];
}

export interface TurnoverReportParams extends ReportDateRange {
  categories?: string[];
  minTurnoverRate?: number;
  maxTurnoverRate?: number;
}

