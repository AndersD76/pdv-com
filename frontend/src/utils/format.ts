// Formatação de valores e datas usada em todas as telas

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const pad = (n: number) => String(n).padStart(2, '0');

// Datas "AAAA-MM-DD" (colunas DATE) são datas de calendário, sem fuso.
// new Date('2026-10-15') seria meia-noite UTC, que no Brasil ainda é dia 14.
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  return new Date(value).toLocaleDateString('pt-BR');
}

// Instantes (colunas TIMESTAMPTZ), exibidos no fuso do navegador
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Hoje no fuso do navegador, no formato AAAA-MM-DD (toISOString() usaria UTC)
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function firstDayOfMonthISO(): string {
  return `${todayISO().slice(0, 8)}01`;
}

export function addDaysISO(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(year, month - 1, day + days);
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`;
}

// Prazo vencido: a data já passou (o próprio dia ainda não conta como vencido)
export function isPastDate(date: string | null | undefined): boolean {
  return Boolean(date) && String(date).slice(0, 10) < todayISO();
}
