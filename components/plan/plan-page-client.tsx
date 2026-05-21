"use client";

import { useState } from "react";

import { PlanAssistant } from "@/components/plan/plan-assistant";
import { SavedPlans } from "@/components/plan/saved-plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  contextSummary: {
    currentReadiness: string;
    currentVo2: string;
    totalSessions: number;
    totalDistanceKm: number;
  };
};

export function PlanPageClient({ contextSummary }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadPlanId, setLoadPlanId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <aside className="w-full lg:w-96 lg:shrink-0 lg:sticky lg:top-20">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Saved Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <SavedPlans
              onLoad={(id) => setLoadPlanId(id)}
              activePlanId={activePlanId}
              refreshKey={refreshKey}
            />
          </CardContent>
        </Card>
      </aside>

      <div className="flex-1 min-w-0">
        <PlanAssistant
          contextSummary={contextSummary}
          onPlanSaved={() => setRefreshKey((k) => k + 1)}
          loadPlanId={loadPlanId}
          onLoaded={(id) => {
            setActivePlanId(id);
            setLoadPlanId(null);
          }}
        />
      </div>
    </div>
  );
}
