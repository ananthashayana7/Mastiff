import { describe, expect, it } from 'vitest';

import { buildDeterministicFinancialSummary, extractFinancialMetricsFromContent } from '../src/lib/financialSummaryGuard';

const PREBO_CONTENT = `
PreBo Statement of Profit and loss for the year Jan to June 2025 ( Amt T INR) PreBo Statement of Profit and loss for the year (YTD) June 2025 (Amt T INR)
Particulars Notes Jan'25 Feb'25 Mar'25 Apr'25 May'25 Jun'25 Jan'25 YTD Feb'25 YTD Mar'25 YTD Apr'25 YTD May'25 YTD Jun'25
A- Total Income
Revenue from operations 1 1,10,109 1,09,935 1,16,567 1,10,771 1,18,800 1,09,395 1,10,109 2,20,044 3,36,611 4,47,382 5,66,182 6,75,577
Other income 2 255 169 296 2,703 - - 255 424 720 3,423 3,423 3,423
Total Income 1,10,364 1,10,104 1,16,863 1,13,474 1,18,800 1,09,395 1,10,364 2,20,468 3,37,331 4,50,804 5,69,604 6,79,000
B- Total Expenses
Cost of raw material consumed 3 -60,541 -73,160 -83,364 -70,013 -56,738 -65,273 -60,541 -1,33,701 -2,17,066 -2,87,078 -3,43,816 -4,09,089
Changes in inventories of finished goods and work-in-progress 4 1,596 428 13,096 5,135 -24,325 1,493 1,596 2,025 15,121 20,256 -4,069 -2,576
Employee benefits expense 5 -19,018 -17,609 -26,572 -25,294 -21,899 -19,234 -19,018 -36,627 -63,199 -88,493 -1,10,392 -1,29,625
Depreciation and amortisation expenses 7 -2,978 -2,737 457 -6,049 -3,057 -5,915 -2,978 -5,714 -5,257 -11,306 -14,363 -20,278
Other expenses 8 -11,390 -10,083 -14,158 -11,856 -12,056 -12,266 -11,390 -21,473 -35,631 -47,487 -59,543 -71,808
Total expenses -92,330 -1,03,161 -1,10,542 -1,08,076 -1,18,075 -1,01,194 -92,330 -1,95,490 -3,06,032 -4,14,108 -5,32,183 -6,33,377
Profit before tax (EBIT) 18,035 6,943 6,321 5,397 725 8,201 18,035 24,978 31,299 36,696 37,421 45,622
Current tax -4,691 -1,805 -1,647 -1,405 -191 -1,967 -4,691 -6,496 -8,143 -9,548 -9,739 -11,706
Profit for the year (PAT) 13,344 5,138 4,674 3,992 535 6,234 13,344 18,482 23,156 27,148 27,683 33,917
`;

describe('financial summary guard', () => {
  it('extracts core financial metrics from pasted P&L content', () => {
    const metrics = extractFinancialMetricsFromContent(PREBO_CONTENT);

    expect(metrics?.pat?.monthly).toEqual([13344, 5138, 4674, 3992, 535, 6234]);
    expect(metrics?.pat?.ytd[5]).toBe(33917);
    expect(metrics?.totalIncome?.ytd[5]).toBe(679000);
    expect(metrics?.inventory?.monthly[4]).toBe(-24325);
  });

  it('builds an exact deterministic executive summary for pasted P&L data', () => {
    const summary = buildDeterministicFinancialSummary(PREBO_CONTENT, true);

    expect(summary).toContain('**33,917 T INR**');
    expect(summary).toContain('**5.0%** PAT margin');
    expect(summary).toContain('**86.6%**');
    expect(summary).toContain('**67,834 T INR**');
    expect(summary).toContain('📊 See interactive charts below for details.');
    expect(summary).not.toContain('90% drop');
  });
});