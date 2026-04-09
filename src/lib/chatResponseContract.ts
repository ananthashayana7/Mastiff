export type ContractViolation =
  | 'intro_text_present'
  | 'missing_required_bullets'
  | 'word_limit_exceeded'
  | 'missing_code_for_numeric_intent'
  | 'contains_technical_artifacts';

export interface ContractValidationResult {
  valid: boolean;
  violations: ContractViolation[];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countBulletLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => /^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(line)).length;
}

export function hasIntroductoryPrefix(text: string): boolean {
  const firstLine = text.split(/\r?\n/)[0]?.trim().toLowerCase() || '';
  return /^(hi|hello|hey|thanks|thank you|sure|absolutely|of course|here'?s)/i.test(firstLine);
}

export function containsTechnicalArtifacts(text: string): boolean {
  const content = (text || '').trim();
  if (!content) return false;

  if (/```[\s\S]*?```/.test(content)) return true;

  const technicalLineCount = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(import\s+|from\s+\w+\s+import|def\s+|class\s+|fig\s*=|df\s*=|go\.|px\.|plt\.|sns\.|print\(|return\s+\{|\{\s*"|\[\s*"|```)/i.test(line))
    .length;

  return technicalLineCount >= 3;
}

export function validateSummaryContract(
  inputPrompt: string,
  summary: string,
  hasNumericIntent: boolean,
  hasAnalysisCode: boolean
): ContractValidationResult {
  const violations: ContractViolation[] = [];
  const prompt = inputPrompt || '';
  const content = summary || '';
  const lowerPrompt = prompt.toLowerCase();

  const requiresNoIntro = /no introductory text|start immediately/i.test(prompt);
  if (requiresNoIntro && hasIntroductoryPrefix(content)) {
    violations.push('intro_text_present');
  }

  const requiresThreeBullets =
    /exactly\s*3\s*(?:crisp|concise|actionable|management-ready)?\s*bullet/i.test(lowerPrompt) ||
    /exactly\s*3/i.test(lowerPrompt);
  if (requiresThreeBullets && countBulletLines(content) < 3) {
    violations.push('missing_required_bullets');
  }

  const requiresWordLimit = /under\s*150\s*words/i.test(lowerPrompt);
  if (requiresWordLimit && countWords(content) > 170) {
    violations.push('word_limit_exceeded');
  }

  if (hasNumericIntent && !hasAnalysisCode) {
    violations.push('missing_code_for_numeric_intent');
  }

  if (containsTechnicalArtifacts(content)) {
    violations.push('contains_technical_artifacts');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function buildContractFallbackSummary(inputPrompt: string, hasCharts: boolean, hasAnalysisCode: boolean): string {
  const chartStatus = hasCharts
    ? '📊 Interactive charts are available below — drill down for details.'
    : '⚠️ Charts were not generated in this pass. Try a more specific data question.';

  const reliabilityStatus = hasAnalysisCode
    ? '✅ Analysis backed by executable Python code (click "View Code" to inspect).'
    : '⚠️ Analysis code was incomplete — retry with a narrower question for deterministic results.';

  return [
    '**Executive Signal** The analysis response needed a deterministic fallback, so treat this output as directional until a deeper rerun confirms it.',
    `1) ${chartStatus}`,
    `2) ${reliabilityStatus}`,
    '3) The next decision should center on the biggest variance, anomaly, or trend driver rather than broad narrative.',
    '4) If the current answer still feels generic, narrow the question to one KPI, one slice, or one time horizon.',
    '→ Action: Re-run the analysis around the single highest-impact metric or business risk.',
    '→ Action: Ask for the main driver, outlier rows, and latest-period comparison in the next follow-up.',
    hasAnalysisCode
      ? '→ Action: Open the Python code and validate the assumptions before operationalizing the result.'
      : '→ Action: Request executable analysis code for a reproducible evidence trail.',
    hasCharts
      ? 'Forecast: Directional trend is visible in the charts below; use it as a short-term planning signal, not a long-range forecast.'
      : 'Forecast: Reliable direction cannot be established until the next run produces a chart-backed trend readout.',
    `Data Quality: ${hasAnalysisCode ? 'Reproducible but fallback-shaped.' : 'Fallback-shaped and directional only.'}`,
  ].join('\n');
}
