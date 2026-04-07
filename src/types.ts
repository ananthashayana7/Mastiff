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
    responseEnvelope?: {
      insights: string[];
      forecast: string;
      hasChart: boolean;
      hasCode: boolean;
    };
    responseEnvelopeMeta?: {
      usedFallback: boolean;
      contractRepairAttempted: boolean;
      contractRepaired: boolean;
      initialViolations: string[];
    };
  };
  status?: 'thinking' | 'done' | 'error';
  mode?: AnalysisMode;
  persona?: string;
  sources?: GroundingSource[];
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
