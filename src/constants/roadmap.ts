/**
 * roadmap.ts
 *
 * Public roadmap (roadmap page). Product capabilities only, written as user benefits; texts live
 * in locales/{en,fr}/roadmap.json under `items.<key>`. Keep it to what users gain: no security
 * work, fixes or known gaps here (tests/unit/constants/roadmap.test.ts guards the wording).
 */
export type RoadmapStatus = 'inProgress' | 'planned' | 'exploring';
export type RoadmapHorizon = 'q4-2026' | 'q1-2027' | 'later';

export interface RoadmapItem {
  key: string;
  status: RoadmapStatus;
  horizon: RoadmapHorizon;
}

export const ROADMAP_ITEMS: readonly RoadmapItem[] = [
  { key: 'assetClasses', status: 'inProgress', horizon: 'q4-2026' },
  { key: 'manualEntry', status: 'planned', horizon: 'q4-2026' },
  { key: 'aiImport', status: 'planned', horizon: 'q4-2026' },
  { key: 'liabilities', status: 'planned', horizon: 'q1-2027' },
  { key: 'brokerSync', status: 'exploring', horizon: 'q1-2027' },
  { key: 'jurisdictions', status: 'exploring', horizon: 'later' },
];
