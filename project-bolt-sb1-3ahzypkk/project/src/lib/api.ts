import type { HealthResponse, ChatRequest, ChatResponse, SSEEvent } from './types';

const API_BASE = 'http://localhost:8000';

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Backend offline');
  return response.json();
}

export async function* streamReconciliation(file: File): AsyncGenerator<SSEEvent> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/reconcile`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error('Reconciliation failed');
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as SSEEvent;
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    }
  }
}

export async function* streamVisualization(): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${API_BASE}/visualize`, {
    method: 'POST',
  });

  if (!response.ok) throw new Error('Visualization failed');
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as SSEEvent;
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    }
  }
}

export function getPlotUrl(): string {
  return `${API_BASE}/plot`;
}

export async function askQuestion(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) throw new Error('Question failed');
  return response.json();
}
