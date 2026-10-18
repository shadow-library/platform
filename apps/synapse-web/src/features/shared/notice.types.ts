export interface Notice {
  intent: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
}
