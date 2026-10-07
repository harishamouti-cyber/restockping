export interface MetricCalculations {
  totalRegistered: number;
  pendingCount: number;
  dispatchedCount: number;
  convertedCount: number;
  ctrPercentage: string | null;
  ctrBadgeLabel: string;
  isCtrActive: boolean;
  hasOrders: boolean;
}

export function calculateConversionMetrics(subscribers: any[]): MetricCalculations {
  const totalRegistered = subscribers.length;
  const pendingCount = subscribers.filter((s) => s.status === "PENDING").length;
  const dispatchedCount = subscribers.filter(
    (s) => s.status === "DISPATCHED" || s.status === "CONVERTED"
  ).length;
  const convertedCount = subscribers.filter((s) => s.status === "CONVERTED").length;

  if (dispatchedCount === 0) {
    return {
      totalRegistered,
      pendingCount,
      dispatchedCount: 0,
      convertedCount: 0,
      ctrPercentage: null,
      ctrBadgeLabel: "No alerts sent yet",
      isCtrActive: false,
      hasOrders: false,
    };
  }

  if (convertedCount === 0) {
    return {
      totalRegistered,
      pendingCount,
      dispatchedCount,
      convertedCount: 0,
      ctrPercentage: "0.0",
      ctrBadgeLabel: `${dispatchedCount} Sent (Awaiting Order)`,
      isCtrActive: true,
      hasOrders: false,
    };
  }

  const calculatedCtr = ((convertedCount / dispatchedCount) * 100).toFixed(1);
  return {
    totalRegistered,
    pendingCount,
    dispatchedCount,
    convertedCount,
    ctrPercentage: calculatedCtr,
    ctrBadgeLabel: `${dispatchedCount} Sent (${calculatedCtr}% Conversion)`,
    isCtrActive: true,
    hasOrders: true,
  };
}

export function calculateVelocityMetrics(subscribers: any[]) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currentPeriodDemand = subscribers
    .filter((s) => new Date(s.createdAt) >= sevenDaysAgo)
    .reduce((acc, s) => acc + (Number(s.priceSnapshot) || 0), 0);

  const previousPeriodDemand = subscribers
    .filter(
      (s) =>
        new Date(s.createdAt) >= fourteenDaysAgo &&
        new Date(s.createdAt) < sevenDaysAgo
    )
    .reduce((acc, s) => acc + (Number(s.priceSnapshot) || 0), 0);

  if (previousPeriodDemand > 0) {
    const delta =
      ((currentPeriodDemand - previousPeriodDemand) / previousPeriodDemand) * 100;
    return {
      label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% demand growth`,
      isPositive: delta >= 0,
      hasBaseline: true,
    };
  }

  return {
    label:
      subscribers.length > 0 ? "First Request" : "No Activity",
    isPositive: true,
    hasBaseline: false,
  };
}
