import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const schemaFiles = [
  'src/db/costAnalyticsSchema.ts',
  'src/db/llmSchema.ts',
  'src/db/observabilitySchema.ts',
  'src/db/performanceSchema.ts',
  'src/db/rbacSchema.ts',
  'src/db/scheduledReportSchema.ts',
  'src/db/tenantSchema.ts',
  'src/db/usageAnalyticsSchema.ts',
  'src/db/workspaceSchema.ts',
];

describe('database schema TypeScript compatibility', () => {
  it('has no standalone TypeScript diagnostics in the schema files touched by the fix', () => {
    const program = ts.createProgram(schemaFiles, {
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    });

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file?.fileName.includes('/src/db/'));

    expect(
      diagnostics.map((diagnostic) => {
        const fileName = diagnostic.file?.fileName ?? 'unknown';
        const start = diagnostic.start ?? 0;
        const { line, character } = diagnostic.file
          ? diagnostic.file.getLineAndCharacterOfPosition(start)
          : { line: 0, character: 0 };

        return `${fileName}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
      })
    ).toEqual([]);
  });
});
