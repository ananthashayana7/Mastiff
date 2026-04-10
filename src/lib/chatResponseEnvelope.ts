import { z } from 'zod';

const forecastOptionSchema = z.object({
  id: z.string().min(2),
  label: z.string().min(3),
  summary: z.string().min(10),
  confidence: z.enum(['Low', 'Medium', 'High']),
});

export const analysisResponseEnvelopeSchema = z.object({
  headline: z.string().min(10),
  insights: z.array(z.string().min(1)).min(3).max(6),
  actions: z.array(z.string().min(1)).min(3).max(3),
  forecast: z.string().min(10),
  forecastOptions: z.array(forecastOptionSchema).min(2).max(3),
  dataQuality: z.string().min(8),
  hasChart: z.boolean(),
  hasCode: z.boolean(),
});

export type AnalysisResponseEnvelope = z.infer<typeof analysisResponseEnvelopeSchema>;

interface EnvelopeContext {
  hasChart: boolean;
  hasCode: boolean;
}

type EnvelopeLike = Partial<Pick<AnalysisResponseEnvelope, 'headline' | 'insights' | 'actions' | 'forecast' | 'forecastOptions' | 'dataQuality'>>;
type ForecastOption = z.infer<typeof forecastOptionSchema>;
type FollowUpDatasetContext = {
  name: string;
  measures?: string[];
  dimensions?: string[];
  dateFields?: string[];
  keyCandidates?: string[];
  candidateKpis?: string[];
  analysisMemory?: {
    commonFilters?: string[];
    previousCharts?: string[];
  };
};

type FollowUpPromptContext = {
  provenance?: {
    sourceFiles?: Array<{ name: string }>;
    reliability?: { label?: string; notes?: string[] };
  };
  datasets?: FollowUpDatasetContext[];
};

const ACTION_PREFIX_RE = /^(?:action|recommendation|next step|owner|checkpoint|follow-up question)\s*:/i;
const FORECAST_PREFIX_RE = /^(?:forecast|projection|projected|outlook)\s*:/i;
const FORECAST_OPTION_PREFIX_RE = /^(?:forecast option|scenario|base case|recovery case|upside case|optimistic case|conservative case|downside case|stress case)\s*:?/i;
const DATA_QUALITY_PREFIX_RE = /^(?:data quality|reliability|confidence|quality score|sample size|preliminary)\s*:/i;
const EXECUTIVE_SIGNAL_PREFIX_RE = /^executive signal\s*:\s*/i;
const INSIGHT_PREFIX_RE = /^(?:evidence|driver|finding|observation|risk|opportunity)\s*:/i;
const IMPACT_PREFIX_RE = /^impact\s*:/i;
const SECTION_HEADING_RE = /^(?:executive signal(?:\s+executive summary)?|executive summary|summary|key insights|recommendations?(?:\s+(?:and|&)\s+actions)?|analysis|forecast|data quality)$/i;

function extractBulletLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+|^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+|^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

function extractPlainLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function stripListPrefix(value: string): string {
  return value.replace(/^[-*]\s+|^\d+[.)]\s+/, '').trim();
}

function stripDecorators(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^[\u2192•-]\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .trim();
}

function normalizeLineKey(value: string): string {
  return normalizeWhitespace(
    stripListPrefix(
      stripDecorators(value)
        .replace(EXECUTIVE_SIGNAL_PREFIX_RE, '')
        .replace(ACTION_PREFIX_RE, '')
        .replace(FORECAST_PREFIX_RE, '')
        .replace(DATA_QUALITY_PREFIX_RE, '')
        .replace(INSIGHT_PREFIX_RE, '')
        .replace(IMPACT_PREFIX_RE, '')
    )
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
  );
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = normalizeLineKey(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelySectionHeading(line: string): boolean {
  return SECTION_HEADING_RE.test(normalizeLineKey(line));
}

function extractHeadline(summary: string): string | null {
  const candidate = extractPlainLines(summary).find((line) => {
    const normalized = stripDecorators(line).toLowerCase();
    return Boolean(normalized)
      && !/^\d+[.)]\s+/.test(line)
      && !/^forecast\s*:/i.test(normalized)
      && !/^data quality\s*:/i.test(normalized)
      && !/^→\s*action\s*:/i.test(normalized)
      && normalized !== 'executive summary'
      && normalized.length >= 10;
  });

  return candidate ? stripDecorators(candidate) : null;
}

function extractActionLines(text: string): string[] {
  return extractPlainLines(text)
    .filter((line) => /^→\s*action\s*:|^action\s*:/i.test(line))
    .map((line) => line.replace(/^→\s*action\s*:|^action\s*:/i, '').trim())
    .filter(Boolean);
}

function cleanHeadlineCandidate(line: string): string | null {
  const cleaned = normalizeWhitespace(
    stripListPrefix(stripDecorators(line)).replace(EXECUTIVE_SIGNAL_PREFIX_RE, '')
  );

  if (!cleaned) return null;
  if (isLikelySectionHeading(cleaned)) return null;
  if (ACTION_PREFIX_RE.test(cleaned) || FORECAST_PREFIX_RE.test(cleaned) || DATA_QUALITY_PREFIX_RE.test(cleaned)) {
    return null;
  }

  return cleaned.length >= 10 ? ensureSentence(cleaned) : null;
}

function rewriteImpactLine(line: string): string | null {
  const detail = normalizeWhitespace(line.replace(IMPACT_PREFIX_RE, ''));
  if (!detail) return null;

  const severityMatch = detail.match(/^(high|medium|low)\b[\s:,-]*(.*)$/i);
  if (severityMatch) {
    const [, severity, scope] = severityMatch;
    const normalizedScope = normalizeWhitespace(scope);
    return normalizedScope
      ? ensureSentence(`Business impact is ${severity.toLowerCase()} across ${normalizedScope.toLowerCase()}`)
      : ensureSentence(`Business impact is ${severity.toLowerCase()}`);
  }

  return ensureSentence(`Business impact centers on ${detail.toLowerCase()}`);
}

function cleanInsightCandidate(line: string): string | null {
  const cleanedBase = normalizeWhitespace(stripListPrefix(stripDecorators(line)));
  if (!cleanedBase) return null;
  if (isLikelySectionHeading(cleanedBase)) return null;
  if (ACTION_PREFIX_RE.test(cleanedBase) || FORECAST_PREFIX_RE.test(cleanedBase) || DATA_QUALITY_PREFIX_RE.test(cleanedBase)) {
    return null;
  }
  if (IMPACT_PREFIX_RE.test(cleanedBase)) {
    return rewriteImpactLine(cleanedBase);
  }

  const cleaned = normalizeWhitespace(
    cleanedBase
      .replace(EXECUTIVE_SIGNAL_PREFIX_RE, '')
      .replace(INSIGHT_PREFIX_RE, '')
  );

  return cleaned.length >= 12 ? ensureSentence(cleaned) : null;
}

function trimSentence(value: string): string {
  return normalizeWhitespace(value).replace(/[.!?]+$/, '').trim();
}

function toSentenceFragment(value: string): string {
  const trimmed = trimSentence(value);
  if (!trimmed) return '';
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function slugifyScenarioLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
}

function normalizeScenarioConfidence(label: string): 'Low' | 'Medium' | 'High' {
  if (/stress|downside|conservative/i.test(label)) return 'Low';
  if (/upside|optimistic|recovery/i.test(label)) return 'Low';
  return 'Medium';
}

function parseExplicitForecastOptions(text: string): ForecastOption[] {
  const options = dedupeLines(
    extractPlainLines(text)
      .map((line) => normalizeWhitespace(stripListPrefix(stripDecorators(line))))
      .filter((line) => FORECAST_OPTION_PREFIX_RE.test(line))
  );

  return options
    .map((line) => {
      const match = line.match(/^(forecast option|scenario|base case|recovery case|upside case|optimistic case|conservative case|downside case|stress case)\s*:?\s*(.*)$/i);
      if (!match) return null;
      const rawLabel = match[1].replace(/forecast option|scenario/i, '').trim();
      const tail = normalizeWhitespace(match[2] || '');
      const parts = tail.split(/\s+-\s+|\s+[—–-]\s+/).filter(Boolean);
      const label = rawLabel || parts[0] || 'Scenario';
      const summary = parts.length > 1 ? parts.slice(1).join(' - ') : tail;
      if (!summary || summary.length < 10) return null;

      return {
        id: slugifyScenarioLabel(label),
        label: label.replace(/\bcase\b/i, 'Case').replace(/\s+/g, ' ').trim(),
        summary: ensureSentence(summary),
        confidence: normalizeScenarioConfidence(label),
      } satisfies ForecastOption;
    })
    .filter((option): option is ForecastOption => Boolean(option))
    .slice(0, 3);
}

function buildForecastOptions(
  summary: string,
  context: EnvelopeContext,
  forecast: string,
  insights: string[],
  actions: string[],
  dataQuality: string
): ForecastOption[] {
  const explicit = parseExplicitForecastOptions(summary);
  if (explicit.length >= 2) {
    return explicit;
  }

  const baseSummary = forecast || fallbackForecast(summary, context);
  const riskSignal = insights.find((line) => /\b(risk|volatil|drop|decline|gap|anomal|pressure|fragile|leak|swing|outlier)\b/i.test(line))
    || dataQuality
    || 'current volatility persists';
  const catalystSignal = insights.find((line) => /\b(improv|growth|recover|stable|expand|gain|opportun|momentum|normalize)\b/i.test(line))
    || actions[0]
    || 'the recommended corrective actions land on time';
  const structuralAction = actions[1] || actions[0] || 'the current action plan is executed cleanly';

  const baseConfidence: 'Low' | 'Medium' = context.hasChart ? 'Medium' : 'Low';
  const recoverySummary = ensureSentence(
    `If ${toSentenceFragment(structuralAction || catalystSignal)}, performance can outperform the base case, especially if ${toSentenceFragment(catalystSignal)}`
  );
  const stressSummary = ensureSentence(
    `If ${toSentenceFragment(riskSignal)}, outcomes can undershoot the base case and stay operationally fragile for longer than management expects`
  );

  return [
    {
      id: 'base-case',
      label: 'Base Case',
      summary: ensureSentence(baseSummary),
      confidence: baseConfidence,
    },
    {
      id: 'recovery-case',
      label: 'Recovery Case',
      summary: recoverySummary,
      confidence: 'Low',
    },
    {
      id: 'stress-case',
      label: 'Stress Case',
      summary: stressSummary,
      confidence: 'Low',
    },
  ];
}

function selectInsightCandidates(summary: string): string[] {
  const bulletCandidates = dedupeLines(
    extractBulletLines(summary)
      .map((line) => cleanInsightCandidate(line))
      .filter((line): line is string => Boolean(line))
  );

  if (bulletCandidates.length >= 3) {
    return bulletCandidates.slice(0, 6);
  }

  const sentenceCandidates = dedupeLines(
    summary
      .split(/[.!?]\s+/)
      .map((sentence) => cleanInsightCandidate(sentence))
      .filter((line): line is string => Boolean(line))
  );

  return dedupeLines([...bulletCandidates, ...sentenceCandidates]).slice(0, 6);
}

function fillInsightDefaults(insights: string[], context: EnvelopeContext, headline?: string): string[] {
  const filtered = dedupeLines(
    insights.filter((line) => normalizeLineKey(line) !== normalizeLineKey(headline || ''))
  );

  const fallbacks = [
    context.hasChart
      ? 'Review the interactive visuals for the highest-variance trend and the main driver behind it.'
      : 'The current answer is directional; add sharper scope or data to increase precision.',
    context.hasCode
      ? 'Reproducible Python is attached, so the evidence path can be reviewed and challenged directly.'
      : 'Ask for a segment, time range, or KPI-specific cut to sharpen the conclusion.',
    'Prioritize the largest driver first; secondary noise should not dilute the decision path.',
    'Turn the strongest signal into an owner, deadline, and measurable KPI before acting.',
  ];

  for (const fallback of fallbacks) {
    if (filtered.length >= 6) break;
    if (normalizeLineKey(fallback) === normalizeLineKey(headline || '')) continue;
    if (filtered.some((line) => normalizeLineKey(line) === normalizeLineKey(fallback))) continue;
    filtered.push(fallback);
  }

  return filtered.slice(0, 6);
}

function selectHeadline(summary: string): string | null {
  const explicit = extractPlainLines(summary)
    .find((line) => EXECUTIVE_SIGNAL_PREFIX_RE.test(stripListPrefix(stripDecorators(line))));

  if (explicit) {
    return cleanHeadlineCandidate(explicit);
  }

  const candidate = extractPlainLines(summary)
    .find((line) => !/^\d+[.)]\s+/.test(line) && Boolean(cleanHeadlineCandidate(line)));

  return candidate ? cleanHeadlineCandidate(candidate) : null;
}

function selectActionLines(text: string): string[] {
  return dedupeLines(
    extractPlainLines(text)
      .map((line) => normalizeWhitespace(stripListPrefix(stripDecorators(line))))
      .filter((line) => ACTION_PREFIX_RE.test(line))
      .map((line) => ensureSentence(normalizeWhitespace(line.replace(ACTION_PREFIX_RE, ''))))
      .filter((line) => line.length > 10)
  );
}

function selectForecastLine(text: string): string | null {
  const lines = extractPlainLines(text)
    .map((line) => normalizeWhitespace(stripListPrefix(stripDecorators(line))));

  const explicit = lines
    .filter((line) => FORECAST_PREFIX_RE.test(line))
    .map((line) => normalizeWhitespace(line.replace(FORECAST_PREFIX_RE, '')))
    .find((line) => Boolean(line) && !ACTION_PREFIX_RE.test(line));

  if (explicit) {
    return ensureSentence(explicit);
  }

  const directional = lines.find((line) =>
    !ACTION_PREFIX_RE.test(line)
    && !DATA_QUALITY_PREFIX_RE.test(line)
    && !isLikelySectionHeading(line)
    && /\b(next|forward|ahead|run-rate|trajectory|trend|outlook|project)\b/i.test(line)
  );

  return directional ? ensureSentence(directional) : null;
}

function extractDataQualityLine(text: string): string | null {
  const line = extractPlainLines(text).find((value) =>
    /^data quality\s*:/i.test(value)
    || /(reliability|confidence|quality score|sample size|preliminary)/i.test(value)
  );

  return line ? stripDecorators(line) : null;
}

function extractForecastLine(text: string): string | null {
  const lines = extractPlainLines(text);
  const forecastLine = lines.find((line) => /(forecast|projection|projected|outlook|trend)/i.test(line));
  return forecastLine ? stripDecorators(forecastLine) : null;
}

function fallbackHeadline(summary: string, context: EnvelopeContext): string {
  const extracted = selectHeadline(summary);
  if (extracted) return extracted;

  const insightCandidate = selectInsightCandidates(summary)[0];
  if (insightCandidate) {
    return insightCandidate;
  }

  if (summary.trim()) {
    const sentence = summary
      .split(/[.!?]\s+/)
      .map((value) => value.trim())
      .find((value) => value.length >= 10);
    if (sentence) {
      return sentence.endsWith('.') ? sentence : `${sentence}.`;
    }
  }

  return context.hasChart
    ? 'Highest-value business signal is captured in the interactive analysis below.'
    : 'Analysis completed with directional findings and concrete next steps.';
}

function fallbackInsights(summary: string, context: EnvelopeContext): string[] {
  return fillInsightDefaults(
    selectInsightCandidates(summary),
    context,
    fallbackHeadline(summary, context)
  );
}

function fallbackActions(summary: string, context: EnvelopeContext): string[] {
  const extracted = selectActionLines(summary).slice(0, 3);
  while (extracted.length < 3) {
    if (extracted.length === 0) {
      extracted.push('Prioritize the biggest variance driver and assign an owner with a near-term checkpoint.');
    } else if (extracted.length === 1) {
      extracted.push(context.hasChart
        ? 'Use the interactive visuals to validate the top anomaly before changing policy or spend.'
        : 'Request a tighter metric, time window, or segment breakdown before committing to a decision.');
    } else {
      extracted.push(context.hasCode
        ? 'Open the Python code, verify the assumptions, and reuse it for the next decision cycle.'
        : 'Convert this direction into a follow-up question that tests the main suspected driver.');
    }
  }

  return extracted.slice(0, 3);
}

function fallbackForecast(summary: string, context: EnvelopeContext): string {
  const extracted = selectForecastLine(summary);
  if (extracted) return extracted;

  // Try extracting any line with directional keywords
  const lines = summary.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const directionalLine = lines.find((line) =>
    !ACTION_PREFIX_RE.test(stripListPrefix(stripDecorators(line)))
    && /(increase|decrease|grow|decline|stable|risk|opportunity|momentum|trajectory)/i.test(line)
  );
  if (directionalLine) return ensureSentence(stripDecorators(directionalLine));

  return context.hasChart
    ? 'Forecast direction is visible in the generated charts — review trend lines for planning decisions.'
    : 'Forecast requires additional data points or a more specific time-series query for reliable projections.';
}

function fallbackDataQuality(summary: string, context: EnvelopeContext): string {
  const extracted = extractDataQualityLine(summary);
  if (extracted) return extracted;

  if (/0 rows|empty after loading|failed/i.test(summary)) {
    return 'Data Quality: Source data was incomplete for a reliable readout; reload or narrow the input before acting.';
  }

  return context.hasCode
    ? 'Data Quality: Directional but reproducible — review code and visuals before scaling the decision.'
    : 'Data Quality: Directional only — add data or tighter scope for higher-confidence guidance.';
}

export function buildAnalysisResponseEnvelope(
  summary: string,
  context: EnvelopeContext
): { envelope: AnalysisResponseEnvelope; usedFallback: boolean } {
  const headline = selectHeadline(summary) || '';
  const insights = selectInsightCandidates(summary).slice(0, 6);
  const actions = selectActionLines(summary).slice(0, 3);
  const forecast = selectForecastLine(summary) || '';
  const dataQuality = extractDataQualityLine(summary) || '';
  const forecastOptions = buildForecastOptions(summary, context, forecast, insights, actions, dataQuality);

  const directCandidate = {
    headline,
    insights,
    actions,
    forecast,
    forecastOptions,
    dataQuality,
    hasChart: context.hasChart,
    hasCode: context.hasCode,
  };

  const directParsed = analysisResponseEnvelopeSchema.safeParse(directCandidate);
  if (directParsed.success) {
    return { envelope: directParsed.data, usedFallback: false };
  }

  const fallbackCandidate = {
    headline: fallbackHeadline(summary, context),
    insights: fallbackInsights(summary, context),
    actions: fallbackActions(summary, context),
    forecast: fallbackForecast(summary, context),
    forecastOptions: buildForecastOptions(
      summary,
      context,
      fallbackForecast(summary, context),
      fallbackInsights(summary, context),
      fallbackActions(summary, context),
      fallbackDataQuality(summary, context)
    ),
    dataQuality: fallbackDataQuality(summary, context),
    hasChart: context.hasChart,
    hasCode: context.hasCode,
  };

  const fallbackParsed = analysisResponseEnvelopeSchema.parse(fallbackCandidate);
  return { envelope: fallbackParsed, usedFallback: true };
}

export function renderEnvelopeAsSummary(envelope: AnalysisResponseEnvelope): string {
  return [
    `**Executive Signal** ${envelope.headline}`,
    ...envelope.insights.map((insight, index) => `${index + 1}) ${insight}`),
    `→ Action: ${envelope.actions[0]}`,
    `→ Action: ${envelope.actions[1]}`,
    `→ Action: ${envelope.actions[2]}`,
    `${envelope.forecast.startsWith('Forecast:') ? envelope.forecast : `Forecast: ${envelope.forecast}`}`,
    `${envelope.dataQuality.startsWith('Data Quality:') ? envelope.dataQuality : `Data Quality: ${envelope.dataQuality}`}`,
  ].join('\n');
}

export function buildAnalysisBodyContent(content: string, envelope?: EnvelopeLike | null): string {
  const lines = extractPlainLines(content);
  if (!envelope) {
    return lines.join('\n').trim();
  }

  const removable = new Set<string>();
  const register = (value?: string | null) => {
    if (!value) return;
    const key = normalizeLineKey(value);
    if (key) {
      removable.add(key);
    }
  };

  register(envelope.headline);
  (envelope.insights || []).forEach(register);
  (envelope.actions || []).forEach(register);
  register(envelope.forecast);
  (envelope.forecastOptions || []).forEach((option) => register(option.summary));
  register(envelope.dataQuality);

  return lines
    .filter((line) => !isLikelySectionHeading(line))
    .filter((line) => {
      const key = normalizeLineKey(line);
      return Boolean(key) && !removable.has(key);
    })
    .join('\n')
    .trim();
}

function normalizePromptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildFollowUpPrompts(
  envelope: AnalysisResponseEnvelope,
  context?: FollowUpPromptContext
): string[] {
  const primaryForecast = envelope.forecastOptions?.[0]?.summary || envelope.forecast;
  const datasets = context?.datasets || [];
  const primaryDataset = datasets[0];
  const primaryMetric = primaryDataset?.candidateKpis?.[0] || primaryDataset?.measures?.[0];
  const primaryDimension = primaryDataset?.dimensions?.[0];
  const primaryDate = primaryDataset?.dateFields?.[0];
  const primaryKey = primaryDataset?.keyCandidates?.[0];
  const sourceFileCount = context?.provenance?.sourceFiles?.length || 0;
  const reliabilityLabel = context?.provenance?.reliability?.label;
  const reliabilityNote = context?.provenance?.reliability?.notes?.[0] || '';

  const contextCandidates = [
    primaryMetric && primaryDimension
      ? `Break ${primaryMetric} down by ${primaryDimension} and rank the biggest drivers behind this result.`
      : '',
    primaryMetric && primaryDate
      ? `Compare ${primaryMetric} before and after the key shift in ${primaryDate}, then explain what changed.`
      : '',
    primaryMetric && primaryDate
      ? `Build a forecast for ${primaryMetric} over ${primaryDate} with a confidence band and downside case.`
      : '',
    primaryMetric
      ? `Find anomalies and thin-data pockets affecting ${primaryMetric}, then show whether the signal still holds without them.`
      : '',
    sourceFileCount > 1 && primaryMetric
      ? `Compare the active source files on ${primaryMetric} and surface contradictions, join candidates, or coverage gaps before acting.`
      : '',
    sourceFileCount > 1 && primaryKey
      ? `Test whether the active files should be joined on ${primaryKey}, and show what changes if they are compared instead of stacked.`
      : '',
    reliabilityLabel === 'Low' && reliabilityNote
      ? `Re-run this with explicit reliability checks and call out what is still uncertain: ${reliabilityNote}`
      : '',
    primaryDataset?.analysisMemory?.commonFilters?.[0]
      ? `Re-run this using the saved filter "${primaryDataset.analysisMemory.commonFilters[0]}" and compare it with the current answer.`
      : '',
  ];
  const baseCandidates = [
    `Show the rows, segments, and metric drivers behind this signal: ${envelope.insights[0]}`,
    `Pressure-test this recommendation with exact upside, downside, and implementation risk: ${envelope.actions[0]}`,
    `What could break this forecast, and which early warning KPIs should leadership monitor next? ${primaryForecast}`,
    `Validate this conclusion against data quality, outliers, and alternative slices before acting: ${envelope.dataQuality}`,
    'Turn these actions into a 30-60-90 day execution plan with owners, KPIs, and checkpoints.',
  ];
  const candidates = [...contextCandidates, ...baseCandidates];

  const normalized = Array.from(new Set(candidates.map(normalizePromptText).filter((value) => value.length > 20)));
  const executionPlanPrompt = normalizePromptText('Turn these actions into a 30-60-90 day execution plan with owners, KPIs, and checkpoints.');

  return [
    ...normalized.filter((value) => value !== executionPlanPrompt).slice(0, 3),
    ...(normalized.includes(executionPlanPrompt) ? [executionPlanPrompt] : []),
  ].slice(0, 4);
}
