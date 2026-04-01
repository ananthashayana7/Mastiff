import { describe, expect, it } from 'vitest';
import { buildSharePointImportAutoPrompt, buildUploadAutoPrompt } from '../src/lib/analysisPrompts';

describe('analysisPrompts', () => {
  it('buildUploadAutoPrompt includes uploaded filenames and guardrails', () => {
    const prompt = buildUploadAutoPrompt(['sales.csv', 'cohort.xlsx']);

    expect(prompt).toContain('Upload successful: sales.csv, cohort.xlsx.');
    expect(prompt).toContain('Provide EXACTLY 3 crisp, actionable bullet points:');
    expect(prompt).toContain('Then provide a FORECAST');
    expect(prompt).toContain('MANDATORY: Generate at least ONE high-fidelity interactive Plotly chart');
  });

  it('buildSharePointImportAutoPrompt includes imported filenames and requirements', () => {
    const prompt = buildSharePointImportAutoPrompt(['budget.csv']);

    expect(prompt).toContain('SharePoint import successful: budget.csv.');
    expect(prompt).toContain('Provide EXACTLY 3 concise, management-ready bullets:');
    expect(prompt).toContain('Then provide a forecast/projection from current trends.');
    expect(prompt).toContain('MANDATORY: include at least one interactive Plotly chart.');
  });
});
