export type AbdiformOverview = {
  partials: number;
  total: number;
  last7: number;
  prev7: number;
  today: number;
  byStatus: Record<string, number>;
  completion: number | null;
  winRate: number;
};

export type AbdiformForm = {
  id: string;
  title: string;
  status: string;
  views: number;
  starts: number;
  partials: number;
  count: number;
  newCount: number;
  completion: number | null;
  last: string | null;
};

export type AbdiformMetrics = {
  generated_at: string;
  overview: AbdiformOverview;
  timeline: { day: string; label: string; count: number }[];
  forms: AbdiformForm[];
};

export type AbdiformResult =
  | { configured: false }
  | { configured: true; error: string }
  | { configured: true; data: AbdiformMetrics };
