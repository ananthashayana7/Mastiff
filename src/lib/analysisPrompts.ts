type AutoPromptDomain = 'assembly_line' | 'financial' | 'general';

interface AutoPromptOptions {
  domain?: AutoPromptDomain;
  multiFile?: boolean;
}

function buildAssemblyLinePrompt(fileNames: string[], multiFile: boolean): string {
  return `Data ingestion successful: ${fileNames.join(', ')}.
STRICT RULE: NO greetings, NO preamble, NO long narrative. Start immediately with management-ready output.
Charts are mandatory. Do not wait for the user to ask for visuals.

This is assembly-line data. Build a management dashboard response with:
1. FORECAST FIRST: predict the next shift/period and state the top production risk immediately.
2. TOP 5 CONCERNS: crisp, management-driven concerns ranked by impact.
3. ACTIONS: one specific action for each concern.
4. DATA QUALITY VERDICT: one line only.

MANDATORY VISUAL TEMPLATE:
- Top-left: overall summary KPIs with a compact table or indicators plus a trend chart.
- Left middle: shift-wise performance comparison.
- Left lower: operator-wise and QA/checker/engineer performance if available.
- Center hero: forecast, anomalies, and patterns with dashed forecast lines.
- Lower center: two columns for Top 5 Concerns and Recommended Actions.
- Remaining space: drill-down charts for defects, throughput, cycle time, downtime, Pareto, or bottlenecks.
- Add interactive filters for date/time, shift, operator, station, and line where the data supports them.
- Keep visuals colorful, boardroom-ready, and immediately actionable.

${multiFile ? '- Treat all confirmed files as one coordinated operational analysis. Compare lines, shifts, or periods across files and surface cross-file deviations.' : '- Use the confirmed dataset as the primary operational source of truth.'}
${multiFile ? '- Add a line-wise comparison layer that ranks each source file or assembly line by rejection rate, throughput, downtime, and forecast risk.' : ''}
${multiFile ? '- If schemas differ, compare only the common KPIs and clearly state any confidence limits instead of forcing a merge.' : ''}

Keep the written output under 180 words. The charts and dashboard should do the heavy lifting.`;
}

function buildFinancialPrompt(fileNames: string[], multiFile: boolean): string {
  return `Data ingestion successful: ${fileNames.join(', ')}.
STRICT RULE: NO introductory text. Start directly with insights.
Charts are mandatory. Do not wait for the user to ask for visuals.

Provide:
1. Forecast first with the next likely revenue, cost, margin, or run-rate direction.
2. Top 5 concerns ranked by business impact.
3. One action for each concern.
4. One-line data reliability verdict.

MANDATORY:
- Include at least one interactive Plotly dashboard.
- Pair every compact table with a chart.
- Highlight the biggest anomaly, main driver, and forecast confidence.
${multiFile ? '- Compare all confirmed files together and explain the most material changes across periods, entities, or sources.' : ''}
${multiFile ? '- Add a file or source comparison view with the biggest favorable and unfavorable variance by source.' : ''}

Keep total text under 160 words.`;
}

function buildGeneralPrompt(fileNames: string[], multiFile: boolean): string {
  return `Data ingestion successful: ${fileNames.join(', ')}.
STRICT RULE: NO introductory text, greetings, or parsing summaries. Start immediately with insights.
Charts are mandatory whenever the data supports them. Do not wait for the user to ask for visuals.

Provide EXACTLY 3 crisp, actionable bullet points:
1. Most significant pattern or anomaly with the specific numbers.
2. Data quality verdict in one sentence.
3. Top business action with projected impact.

Then provide a forecast or projected direction from the current trend.

MANDATORY:
- Generate at least one interactive Plotly chart with professional styling.
- If time-series data exists, show trend plus forecast projection.
- If categorical data exists, show ranking, comparison, or distribution.
${multiFile ? '- Compare the confirmed files together and surface the most important cross-file differences.' : ''}
${multiFile ? '- If the files are not directly compatible, compare them on the common dimensions only and state that limit.' : ''}

Keep total text under 150 words.`;
}

export const buildUploadAutoPrompt = (
  uploadedFileNames: string[],
  options: AutoPromptOptions = {}
): string => {
  const domain = options.domain || 'general';
  const multiFile = Boolean(options.multiFile);

  if (domain === 'assembly_line') {
    return buildAssemblyLinePrompt(uploadedFileNames, multiFile);
  }

  if (domain === 'financial') {
    return buildFinancialPrompt(uploadedFileNames, multiFile);
  }

  return buildGeneralPrompt(uploadedFileNames, multiFile);
};

export const buildSharePointImportAutoPrompt = (
  importedFileNames: string[],
  options: AutoPromptOptions = {}
): string => {
  return buildUploadAutoPrompt(importedFileNames, options).replace(
    'Data ingestion successful',
    'SharePoint import successful'
  );
};
