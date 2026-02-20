export interface AuditData {
  original_row_count: number;
  clean_row_count: number;
  duplicates_removed: number;
  residual_nulls: number;
  composite_key_present: boolean;
  integrity_status: 'PASS' | 'WARN' | 'FAIL';
}

export interface ReconciliationSummary {
  session_id: string;
  filename: string;
  original_rows: number;
  clean_rows: number;
  duplicates_removed: number;
  audit: AuditData;
}

export interface SSEThought {
  type: 'thought';
  data: string;
}

export interface SSESummary {
  type: 'summary';
  data: ReconciliationSummary;
}

export interface SSEVizResult {
  type: 'viz_result';
  data: {
    success: boolean;
    plot_path: string;
  };
}

export type SSEEvent = SSEThought | SSESummary | SSEVizResult;

export interface HealthResponse {
  status: string;
  has_session: boolean;
  filename?: string;
}

export interface ChatRequest {
  question: string;
}

export interface ChatResponse {
  answer: string;
  grounded: boolean;
  session: {
    filename: string;
    original_rows: number;
    clean_rows: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  grounded?: boolean;
  session?: {
    filename: string;
    original_rows: number;
    clean_rows: number;
  };
}
