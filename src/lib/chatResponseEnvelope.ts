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

  while (base.length < 3) {
    if (base.length === 0) {
      base.push(context.hasChart
        ? 'Primary insight validated with generated visualization.'
        : 'Primary insight identified; visualization requires a rerun.');
    } else if (base.length === 1) {
      base.push(context.hasCode
        ? 'Analysis code generated successfully for reproducibility.'
        : 'Analysis code generation was incomplete and should be retried.');
    } else {
      base.push('Recommended action: narrow scope or clean source data for higher-confidence output.');
    }
  }

  return base.slice(0, 3);
}

function fallbackForecast(summary: string, context: EnvelopeContext): string {
  const extracted = extractForecastLine(summary);
  if (extracted) return extracted;

  return context.hasChart
    ? 'Forecast direction is available in the generated chart trend and should be used for planning decisions.'
    : 'Forecast could not be established with sufficient confidence in this pass; rerun with cleaner scoped inputs.';
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
