import { z } from 'zod';

export const analysisResponseEnvelopeSchema = z.object({
  insights: z.array(z.string().min(1)).min(3).max(3),
  forecast: z.string().min(10),
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

function extractForecastLine(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const forecastLine = lines.find((line) => /(forecast|projection|projected|outlook|trend)/i.test(line));
  return forecastLine || null;
}

function fallbackInsights(summary: string, context: EnvelopeContext): string[] {
  const bullets = extractBulletLines(summary);
  const base = bullets.slice(0, 3);

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

  while (base.length < 3) {
    if (base.length === 0) {
      base.push(context.hasChart
        ? '→ Action: Review the interactive charts below for detailed trend analysis and key metric visualization.'
        : '→ Action: Re-run analysis with refined scope to generate actionable visualizations.');
    } else if (base.length === 1) {
      base.push(context.hasCode
        ? '→ Reproducible analysis code is available — click "View Code" to inspect methodology.'
        : '→ Action: Retry with a more specific question for targeted analysis results.');
    } else {
      base.push('→ Action: Focus on top cost/profit drivers and assign corrective actions with owners and deadlines.');
    }
  }

  return base.slice(0, 3);
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

export function buildAnalysisResponseEnvelope(
  summary: string,
  context: EnvelopeContext
): { envelope: AnalysisResponseEnvelope; usedFallback: boolean } {
  const insights = extractBulletLines(summary).slice(0, 3);
  const forecast = extractForecastLine(summary) || '';

  const directCandidate = {
    insights,
    forecast,
    hasChart: context.hasChart,
    hasCode: context.hasCode,
  };

  const directParsed = analysisResponseEnvelopeSchema.safeParse(directCandidate);
  if (directParsed.success) {
    return { envelope: directParsed.data, usedFallback: false };
  }

  const fallbackCandidate = {
    insights: fallbackInsights(summary, context),
    forecast: fallbackForecast(summary, context),
    hasChart: context.hasChart,
    hasCode: context.hasCode,
  };

  const fallbackParsed = analysisResponseEnvelopeSchema.parse(fallbackCandidate);
  return { envelope: fallbackParsed, usedFallback: true };
}

export function renderEnvelopeAsSummary(envelope: AnalysisResponseEnvelope): string {
  return [
    `1) ${envelope.insights[0]}`,
    `2) ${envelope.insights[1]}`,
    `3) ${envelope.insights[2]}`,
    `Forecast: ${envelope.forecast}`,
  ].join('\n');
}
