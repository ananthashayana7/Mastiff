
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
  workspaceId?: string;
  metadata?: any;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  dataContext?: string;
  visualization?: VisualizationData;
  code?: string;
  images?: string[];
  status?: 'thinking' | 'done' | 'error';
  mode?: AnalysisMode;
  persona?: string;
  sources?: GroundingSource[];
}

export type AnalysisMode = 'standard' | 'deep' | 'fast' | 'ml';

export interface VisualizationData {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'table' | 'cluster';
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
