import { z } from 'zod';

export const analysisResponseEnvelopeSchema = z.object({
  headline: z.string().min(10),
  insights: z.array(z.string().min(1)).min(3).max(4),
  actions: z.array(z.string().min(1)).min(3).max(3),
  forecast: z.string().min(10),
  dataQuality: z.string().min(8),
  hasChart: z.boolean(),
  hasCode: z.boolean(),
});

export type AnalysisResponseEnvelope = z.infer<typeof analysisResponseEnvelopeSchema>;

interface EnvelopeContext {
  hasChart: boolean;
  hasCode: boolean;
}

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

function stripDecorators(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^[\u2192•-]\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .trim();
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
  const extracted = extractHeadline(summary);
  if (extracted) return extracted;

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
  const bullets = extractBulletLines(summary);
  const base = bullets
    .filter((line) => !/^action\s*:/i.test(line) && !/^data quality\s*:/i.test(line))
    .slice(0, 4);

  // If we have some summary text but no bullets, extract first sentences as insights
  if (base.length === 0 && summary.trim()) {
    const sentences = summary
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && s.length < 200);
    for (const sent of sentences.slice(0, 3)) {
      base.push(sent.endsWith('.') ? sent : `${sent}.`);
    }
  }

  while (base.length < 4) {
    if (base.length === 0) {
      base.push(context.hasChart
        ? 'Review the interactive visuals for the highest-variance trend and the main driver behind it.'
        : 'The current answer is directional; add sharper scope or data to increase precision.');
    } else if (base.length === 1) {
      base.push(context.hasCode
        ? 'Reproducible Python is attached, so the evidence path can be reviewed and challenged directly.'
        : 'Ask for a segment, time range, or KPI-specific cut to sharpen the conclusion.');
    } else if (base.length === 2) {
      base.push('Prioritize the largest driver first; secondary noise should not dilute the decision path.');
    } else {
      base.push('Turn the strongest signal into an owner, deadline, and measurable KPI before acting.');
    }
  }

  return base.slice(0, 4);
}

function fallbackActions(summary: string, context: EnvelopeContext): string[] {
  const extracted = extractActionLines(summary).slice(0, 3);
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
  const extracted = extractForecastLine(summary);
  if (extracted) return extracted;

  // Try extracting any line with directional keywords
  const lines = summary.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const directionalLine = lines.find((line) =>
    /(increase|decrease|grow|decline|stable|risk|opportunity|momentum|trajectory)/i.test(line)
  );
  if (directionalLine) return directionalLine;

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
  const headline = extractHeadline(summary) || '';
  const insights = extractBulletLines(summary).slice(0, 4);
  const actions = extractActionLines(summary).slice(0, 3);
  const forecast = extractForecastLine(summary) || '';
  const dataQuality = extractDataQualityLine(summary) || '';

  const directCandidate = {
    headline,
    insights,
    actions,
    forecast,
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
    `1) ${envelope.insights[0]}`,
    `2) ${envelope.insights[1]}`,
    `3) ${envelope.insights[2]}`,
    ...(envelope.insights[3] ? [`4) ${envelope.insights[3]}`] : []),
    `→ Action: ${envelope.actions[0]}`,
    `→ Action: ${envelope.actions[1]}`,
    `→ Action: ${envelope.actions[2]}`,
    `Forecast: ${envelope.forecast}`,
    `${envelope.dataQuality.startsWith('Data Quality:') ? envelope.dataQuality : `Data Quality: ${envelope.dataQuality}`}`,
  ].join('\n');
}

function normalizePromptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildFollowUpPrompts(envelope: AnalysisResponseEnvelope): string[] {
  const candidates = [
    `Show the rows, segments, and metric drivers behind this signal: ${envelope.insights[0]}`,
    `Pressure-test this recommendation with exact upside, downside, and implementation risk: ${envelope.actions[0]}`,
    `What could break this forecast, and which early warning KPIs should leadership monitor next? ${envelope.forecast}`,
    `Validate this conclusion against data quality, outliers, and alternative slices before acting: ${envelope.dataQuality}`,
    'Turn these actions into a 30-60-90 day execution plan with owners, KPIs, and checkpoints.',
  ];

  return Array.from(new Set(candidates.map(normalizePromptText).filter((value) => value.length > 20))).slice(0, 4);
}
