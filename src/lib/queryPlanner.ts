export type QueryPlanMode = 'analysis' | 'theory' | 'hybrid';

export interface QueryPlan {
  mode: QueryPlanMode;
  primaryIntent: string;
  secondaryIntents: string[];
  wantsVisualization: boolean;
  wantsForecast: boolean;
  wantsComparison: boolean;
  wantsRootCause: boolean;
  wantsExecutiveSummary: boolean;
  wantsCode: boolean;
  wantsCrossFile: boolean;
  requiresDatasetContext: boolean;
  ambiguityNotes: string[];
  executionSteps: string[];
}

interface QueryPlanOptions {
  hasDataContext: boolean;
  fileCount?: number;
}

const THEORY_RE = /^(what is|define|explain|difference between|how does|why does|theory of|concept of|when should)\b/i;
const DATA_ANCHOR_RE = /\b(this|these|current|uploaded|active|attached|our)\b[\w\s-]{0,20}\b(data|dataset|file|files|sheet|sheets|table|tables|numbers|report|reports)\b/i;
const DATA_TERM_RE = /(dataset|data|file|files|csv|excel|sheet|sheets|table|column|row|metric|numbers|report|p&l|profit|loss|assembly|line|production|rejection|yield|quality)/i;
const VISUAL_RE = /(chart|plot|graph|visuali[sz]e|dashboard|heatmap|scatter|bar|line|histogram|treemap|sunburst)/i;
const FORECAST_RE = /(forecast|predict|projection|next|future|run[- ]?rate|outlook|trend|plan ahead)/i;
const COMPARE_RE = /(compare|versus|vs\.?|benchmark|difference|variance|rank|best|worst|top\s+\d+|bottom\s+\d+)/i;
const ROOT_CAUSE_RE = /(why|driver|root cause|reason|because|leak|bottleneck|drop|spike|gap|anomal|outlier|issue|problem)/i;
const EXEC_RE = /(action|recommend|executive|management|board|owner|risk|decision|priority|concern)/i;
const CODE_RE = /(python|sql|code|script|query|formula)/i;
const CLEAN_RE = /(clean|prepare|normalize|dedupe|deduplicate|transform|reshape|merge|join|map|standardi[sz]e)/i;
const PROFILE_RE = /(summary|overview|profile|scan|understand|inspect|explore|audit)/i;
const MODEL_RE = /(correlation|regression|cluster|segment|classification|forecast|hypothesis|statistical|anova|chi[- ]?square)/i;
const BUSINESS_METRIC_RE = /(revenue|cost|margin|profit|ebit|pat|pbt|defect|rejection|yield|throughput|downtime|cycle time|scrap|efficiency|volume|inventory|variance)/i;

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function deriveQueryPlan(query: string, options: QueryPlanOptions): QueryPlan {
  const raw = (query || '').trim();
  const normalized = raw.toLowerCase();
  const tokenCount = raw.split(/\s+/).filter(Boolean).length;
  const hasDataContext = Boolean(options.hasDataContext);
  const fileCount = Math.max(0, options.fileCount || 0);

  const wantsVisualization = VISUAL_RE.test(raw) || hasDataContext;
  const wantsForecast = FORECAST_RE.test(raw) || hasDataContext;
  const wantsComparison = COMPARE_RE.test(raw) || fileCount > 1;
  const wantsRootCause = ROOT_CAUSE_RE.test(raw);
  const wantsExecutiveSummary = EXEC_RE.test(raw) || hasDataContext;
  const wantsCode = CODE_RE.test(raw) || hasDataContext;
  const requiresDatasetContext =
    hasDataContext && (
      DATA_ANCHOR_RE.test(raw)
      || DATA_TERM_RE.test(raw)
      || BUSINESS_METRIC_RE.test(raw)
      || wantsComparison
      || wantsRootCause
      || wantsForecast
      || PROFILE_RE.test(raw)
      || MODEL_RE.test(raw)
      || CLEAN_RE.test(raw)
      || tokenCount <= 6
    );

  const clearlyTheoryOnly =
    THEORY_RE.test(raw)
    && !requiresDatasetContext
    && !BUSINESS_METRIC_RE.test(raw)
    && !COMPARE_RE.test(raw)
    && !FORECAST_RE.test(raw)
    && !VISUAL_RE.test(raw);

  let mode: QueryPlanMode = 'analysis';
  if (clearlyTheoryOnly) {
    mode = 'theory';
  } else if (THEORY_RE.test(raw) && requiresDatasetContext) {
    mode = 'hybrid';
  }

  const primaryIntent =
    CLEAN_RE.test(raw) ? 'data_cleaning'
      : wantsRootCause ? 'root_cause'
        : wantsComparison ? 'comparison'
          : wantsForecast ? 'forecast'
            : MODEL_RE.test(raw) ? 'statistical_modeling'
              : PROFILE_RE.test(raw) ? 'profiling'
                : clearlyTheoryOnly ? 'conceptual'
                  : 'diagnostic';

  const secondaryIntents = unique([
    wantsVisualization ? 'visualization' : '',
    wantsExecutiveSummary ? 'executive_summary' : '',
    wantsForecast && primaryIntent !== 'forecast' ? 'forecast' : '',
    wantsComparison && primaryIntent !== 'comparison' ? 'comparison' : '',
    wantsRootCause && primaryIntent !== 'root_cause' ? 'root_cause' : '',
    MODEL_RE.test(raw) && primaryIntent !== 'statistical_modeling' ? 'statistical_modeling' : '',
    CLEAN_RE.test(raw) && primaryIntent !== 'data_cleaning' ? 'data_cleaning' : '',
  ]);

  const ambiguityNotes = unique([
    tokenCount <= 4 && hasDataContext ? 'User query is short; default to best-effort analysis over refusal.' : '',
    !DATA_ANCHOR_RE.test(raw) && hasDataContext ? 'Assume the question refers to the active uploaded data unless clearly theoretical.' : '',
    fileCount > 1 ? 'Multiple files are in scope; choose compare vs join vs harmonize deliberately.' : '',
    wantsForecast && !/\b(date|day|week|month|quarter|year|time|shift)\b/i.test(raw) ? 'If no explicit time axis exists, use run-rate forecasting and state assumptions.' : '',
    !BUSINESS_METRIC_RE.test(raw) && hasDataContext ? 'If no metric is named, start with KPI scan, anomaly scan, and driver ranking.' : '',
  ]);

  const executionSteps = unique([
    'Validate active datasets and confirm usable rows, columns, and join coverage.',
    CLEAN_RE.test(raw) ? 'Apply the requested cleaning or harmonization before analysis.' : 'Profile schema, datatypes, and KPI candidates before deeper analysis.',
    wantsComparison ? 'Build side-by-side comparison tables and visuals across the most comparable entities.' : '',
    wantsRootCause ? 'Decompose the movement into main drivers and isolate the largest anomaly or villain.' : '',
    wantsForecast ? 'Forecast the most decision-relevant metric and label confidence honestly.' : '',
    wantsVisualization ? 'Return interactive charts that match the decision question, not generic fillers.' : '',
    wantsExecutiveSummary ? 'Print crisp evidence logs for summary generation and convert findings into actions.' : 'Return the direct answer with exact computed evidence.',
  ]);

  return {
    mode,
    primaryIntent,
    secondaryIntents,
    wantsVisualization,
    wantsForecast,
    wantsComparison,
    wantsRootCause,
    wantsExecutiveSummary,
    wantsCode,
    wantsCrossFile: fileCount > 1,
    requiresDatasetContext,
    ambiguityNotes,
    executionSteps,
  };
}

export function shouldRunDataAnalysisFromPlan(plan: QueryPlan, hasDataContext: boolean): boolean {
  if (!hasDataContext) return false;
  if (plan.mode === 'theory' && !plan.requiresDatasetContext) return false;
  return true;
}

export function shouldRequireVisualizationFromPlan(plan: QueryPlan, hasDataContext: boolean): boolean {
  if (!hasDataContext) return false;
  if (plan.mode === 'theory' && !plan.requiresDatasetContext) return false;
  return plan.wantsVisualization || plan.wantsComparison || plan.wantsForecast || plan.wantsRootCause;
}

export function buildQueryPlanPromptBlock(plan: QueryPlan): string {
  return [
    'QUERY EXECUTION PLAN:',
    `- Mode: ${plan.mode}`,
    `- Primary intent: ${plan.primaryIntent}`,
    `- Secondary intents: ${plan.secondaryIntents.join(', ') || 'none'}`,
    `- Visualization expected: ${plan.wantsVisualization ? 'yes' : 'no'}`,
    `- Forecast required: ${plan.wantsForecast ? 'yes' : 'no'}`,
    `- Cross-file reasoning expected: ${plan.wantsCrossFile ? 'yes' : 'no'}`,
    `- Root-cause reasoning expected: ${plan.wantsRootCause ? 'yes' : 'no'}`,
    `- Executive answer expected: ${plan.wantsExecutiveSummary ? 'yes' : 'no'}`,
    plan.ambiguityNotes.length > 0
      ? `- Ambiguity notes: ${plan.ambiguityNotes.join(' | ')}`
      : '- Ambiguity notes: none',
    '- Preferred execution order:',
    ...plan.executionSteps.map((step, index) => `  ${index + 1}. ${step}`),
    '- Non-negotiable delivery contract:',
    plan.mode === 'theory'
      ? '  1. If this is purely theoretical, answer directly without pretending to have analyzed missing data.'
      : '  1. If data is present, return evidence-backed insights, a forecast, recommended actions, and at least one chart.',
    '  2. Generated code must be complete, runnable, and never truncated with ellipses or placeholders.',
    '  3. If multiple files are active, harmonize them deliberately and state comparison limits instead of forcing a bad merge.',
    '  4. If rows or columns are mostly empty, clean them silently and continue with the remaining usable evidence.',
  ].join('\n');
}
