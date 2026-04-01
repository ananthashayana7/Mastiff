export const buildUploadAutoPrompt = (uploadedFileNames: string[]): string => `Upload successful: ${uploadedFileNames.join(', ')}.
STRICT RULE: NO introductory text, greetings, or parsing summaries. Start IMMEDIATELY with insights.

Provide EXACTLY 3 crisp, actionable bullet points:
1. **Most significant pattern/anomaly** - with the specific numbers.
2. **Data quality verdict** - one sentence: is this data reliable for decisions?
3. **Top business action** - one boardroom-ready recommendation with projected impact.

Then provide a FORECAST: Based on detected trends, what is the projected direction? Show it visually.

MANDATORY: Generate at least ONE high-fidelity interactive Plotly chart with professional styling.
- If time-series data exists, show trend + forecast projection.
- If categorical data, show distribution or comparison.
- Use vivid colors, clear labels, and hover tooltips.

Keep total text under 150 words. Charts speak louder than text.`;

export const buildSharePointImportAutoPrompt = (importedFileNames: string[]): string => `SharePoint import successful: ${importedFileNames.join(', ')}.
Provide EXACTLY 3 concise, management-ready bullets:
1) Most significant insight/anomaly with numbers.
2) Data reliability verdict in one sentence.
3) Highest-impact action recommendation.

Then provide a forecast/projection from current trends.
MANDATORY: include at least one interactive Plotly chart.`;
