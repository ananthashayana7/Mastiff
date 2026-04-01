export type ContractViolation =
  | 'intro_text_present'
  | 'missing_required_bullets'
  | 'word_limit_exceeded'
  | 'missing_code_for_numeric_intent';

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

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function buildContractFallbackSummary(inputPrompt: string, hasCharts: boolean, hasAnalysisCode: boolean): string {
  const chartStatus = hasCharts
    ? 'Visualization generated and attached for direct inspection.'
    : 'Visualization could not be generated in this pass; re-run requested for chart completion.';

  const codeStatus = hasAnalysisCode
    ? 'Executable analysis code has been produced and stored with this response.'
    : 'Executable analysis code could not be produced in this pass; regeneration is required.';

  if (/exactly\s*3/i.test((inputPrompt || '').toLowerCase())) {
    return [
      `1) Key insight: ${chartStatus}`,
      `2) Reliability: ${codeStatus}`,
      '3) Recommended action: Re-run analysis with narrowed scope or cleaner source subset for deterministic output quality.',
    ].join('\n');
  }

  return `Contract fallback summary:\n- ${chartStatus}\n- ${codeStatus}`;
}
