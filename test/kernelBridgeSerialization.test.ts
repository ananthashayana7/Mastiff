import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { kernelService } from '../src/services/kernel';

afterEach(() => {
  kernelService.terminateAll();
});

describe('kernel bridge serialization', () => {
  it(
    'serializes plain Python date and datetime values in bridge responses',
    async () => {
      const response = await kernelService.execute(
        `kernel-serialization-${randomUUID()}`,
        `
from datetime import date, datetime, time

df = pd.DataFrame({
    "DateOnly": [date(2025, 6, 6), date(2025, 6, 7)],
    "TotalCount": [578, 814],
})

plotly_json = [{
    "generated_on": date(2025, 6, 6),
    "generated_at": datetime(2025, 6, 6, 14, 34, 0),
    "generated_time": time(14, 34, 0),
}]

result = {"temporal_summary": df.to_dict(orient="records")}
`,
        []
      );

      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
      expect(response.updated_df_sample).toEqual([
        { DateOnly: '2025-06-06', TotalCount: 578 },
        { DateOnly: '2025-06-07', TotalCount: 814 },
      ]);
      expect(response.plotly_charts).toEqual([
        {
          generated_on: '2025-06-06',
          generated_at: '2025-06-06T14:34:00',
          generated_time: '14:34:00',
        },
      ]);
    },
    300000
  );
});
