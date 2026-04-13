export type UserRole = 'Admin' | 'Analyst' | 'Viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  totpSecret?: string;
  isPremium?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  files?: DataFile[];
  messages?: ChatMessage[];
}

export interface ConnectorSummary {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  isActive?: boolean | null;
  lastTestedAt?: string | number | null;
  lastUsedAt?: string | number | null;
  createdAt?: string | number | null;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AnalysisConfidence {
  label: 'High' | 'Moderate' | 'Low';
  summary: string;
}

export interface AnalysisProvenance {
  sourceFiles: Array<{
    id?: string;
    name: string;
    rowCount: number;
    columnCount: number;
    selectedColumns: string[];
    ignoredColumns: string[];
  }>;
  rowsAnalyzed: number;
  columnsConsidered: string[];
  ignoredColumns: string[];
  dateRange?: {
    field: string;
    min: string;
    max: string;
  };
  reliability: {
    label: 'High' | 'Moderate' | 'Low';
    notes: string[];
  };
  warnings: string[];
}

export interface AnalysisResponseEnvelope {
  headline: string;
  insights: string[];
  actions: string[];
  forecast: string;
  forecastOptions: ForecastOption[];
  decisionGrade: 'Decision-grade' | 'Directional' | 'Needs review';
  decisionSummary: string;
  confidence: AnalysisConfidence;
  coverage: string;
  watchouts: string[];
  dataQuality: string;
  hasChart: boolean;
  hasCode: boolean;
}

export interface DataFile {
  id: string;
  name: string;
  type: string;
  content: string;
  preview: any[];
  columns: string[];
  metadata?: {
    row_count: number;
    column_count: number;
    validationStatus?: 'pending' | 'active';
    selectedColumns?: string[];
    extraction_warning?: string;
    original_filename?: string;
    sheet_name?: string;
    sheet_names?: string[];
    header_row_index?: number;
    dropped_empty_rows?: number;
    dropped_empty_columns?: number;
    schema_review_notes?: string[];
    duplicate_resolution?: 'none' | 'replaced' | 'versioned';
    replaced_file_ids?: string[];
    version_label?: string;
    datasetIntelligence?: {
      generatedAt: string;
      summary: string[];
      businessTerms: string[];
      units: string[];
      measures: string[];
      dimensions: string[];
      dateFields: string[];
      keyCandidates: string[];
      candidateKpis: string[];
      missingnessHotspots: string[];
      anomalies: string[];
      columnRoles: Record<string, 'measure' | 'dimension' | 'date' | 'key' | 'text' | 'unknown'>;
    };
    analysisMemory?: {
      lastUpdatedAt: string;
      detectedKpis: string[];
      topFindings: string[];
      commonFilters: string[];
      previousCharts: string[];
      recentPrompts: string[];
      recentActions: string[];
      acceptedMappings: Array<{ from: string; to: string }>;
      renamedBusinessTerms: string[];
    };
    columns: Record<string, {
      dtype: string;
      null_count: number;
      null_percentage: number;
      unique_count: number;
      sample_values: any[];
      stats?: {
        min: number;
        max: number;
        mean: number;
        median: number;
        std: number;
        q1: number;
        q3: number;
      };
      top_categories?: { value: string; count: number }[];
    }>;
    sample: any[];
  };
  workspaceId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  dataContext?: string;
  visualization?: VisualizationData;
  code?: string;
  images?: string[];
  charts?: string[];
  result?: {
    output?: string;
    error?: string;
    charts?: string[];
    plotly_charts?: any[];
    traceback?: string;
    updated_df_sample?: any[];
    responseEnvelope?: AnalysisResponseEnvelope;
    provenance?: AnalysisProvenance;
    responseEnvelopeMeta?: {
      usedFallback: boolean;
      contractRepairAttempted: boolean;
      contractRepaired: boolean;
      initialViolations: string[];
    };
    followUpPrompts?: string[];
  };
  status?: 'thinking' | 'done' | 'error';
  mode?: AnalysisMode;
  persona?: string;
  sources?: GroundingSource[];
}

export interface ForecastOption {
  id: string;
  label: string;
  summary: string;
  confidence: 'Low' | 'Medium' | 'High';
}

export type AnalysisMode = 'chat' | 'analysis';

export interface VisualizationData {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'table' | 'cluster' | 'area' | 'radar' | 'heatmap' | 'composedbar' | 'treemap' | 'funnel';
  title: string;
  data: any[];
  config: {
    xAxis?: string;
    yAxis?: string;
    label?: string;
    keys?: string[];
  };
}

export interface AnalystPersona {
  id: string;
  name: string;
  description: string;
  instruction: string;
  icon: string;
}
