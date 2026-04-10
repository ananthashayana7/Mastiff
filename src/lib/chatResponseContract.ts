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
  const requiresExactlyThreeBullets = /exactly\s*3\s*(?:crisp|concise|actionable|management-ready)?\s*bullet|exactly\s*3\s*bullets?/i.test(inputPrompt || '');
  const chartStatus = hasCharts
    ? 'Interactive charts are available below and should be used to isolate the main driver, not just confirm direction.'
    : 'Charts were not generated in this pass, so trend confidence is limited until the next rerun produces a visual read.';

  const reliabilityStatus = hasAnalysisCode
    ? 'Analysis backed by executable Python, which makes the evidence reproducible even if the narrative fallback is compressed.'
    : 'Analysis code was incomplete, so treat the conclusion as directional until a narrower rerun produces deterministic evidence.';

  if (requiresExactlyThreeBullets) {
    return [
      `1) ${chartStatus}`,
      `2) ${reliabilityStatus}`,
      '3) Action: Focus the rerun on the single largest variance, weakest period, or highest-risk KPI so the next answer can produce a sharper driver bridge and action plan.',
    ].join('\n');
  }

  return [
    '**Executive Signal** The analysis response needed a deterministic fallback, so the signal is still useful but not yet sharp enough for a confident operating decision.',
    `1) ${chartStatus}`,
    `2) ${reliabilityStatus}`,
    '3) The biggest risk in a fallback answer is false comfort: direction may be right while the true bridge, outlier, or scenario sensitivity remains underexplained.',
    '4) If the current answer still feels generic, narrow the rerun to one KPI, one business slice, or one time horizon and force a driver-level comparison.',
    '→ Action: Re-run the analysis around the single highest-impact metric, weakest period, or sharpest anomaly.',
    '→ Action: Ask for the exact bridge, outlier rows, and latest-period comparison instead of a broad recap.',
    hasAnalysisCode
      ? '→ Action: Open the Python code and verify assumptions before operationalizing the recommendation.'
      : '→ Action: Request executable analysis code so the next answer leaves a reproducible evidence trail.',
    hasCharts
      ? 'Forecast: A directional base case is visible in the charts below, but upside and downside conditions still need a scenario-level rerun before leadership commits.'
      : 'Forecast: Reliable direction cannot be established until the next run produces a chart-backed trend readout.',
    `Data Quality: ${hasAnalysisCode ? 'Reproducible, but fallback-shaped and still short on driver detail.' : 'Fallback-shaped, directional only, and not decision-grade yet.'}`,
  ].join('\n');
}
