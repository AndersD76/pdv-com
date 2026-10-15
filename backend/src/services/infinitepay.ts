import { HttpError } from '../utils/http.js';

// Checkout Integrado da InfinitePay (https://www.infinitepay.io/checkout-documentacao).
// A única credencial é a InfiniteTag da loja; o webhook não é assinado, por isso todo
// pagamento é confirmado consultando /payment_check antes de ser aceito.
const API_URL = (process.env.INFINITEPAY_API_URL || 'https://api.checkout.infinitepay.io').replace(/\/+$/, '');
const TIMEOUT_MS = 15_000;

export interface CheckoutItem {
  description: string;
  quantity: number;
  price: number; // centavos
}

export interface CreateLinkParams {
  handle: string;
  orderNsu: string;
  items: CheckoutItem[];
  redirectUrl: string;
  webhookUrl: string;
  customer: { name: string; phone_number: string; email?: string };
  address?: { cep: string; street: string; neighborhood: string; number: string; complement?: string };
}

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null; text: string }> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    // resposta sem JSON
  }
  return { status: response.status, data, text };
}

export async function createCheckoutLink(params: CreateLinkParams): Promise<{ url: string; slug: string | null }> {
  let result;
  try {
    result = await post('/links', {
      handle: params.handle,
      order_nsu: params.orderNsu,
      items: params.items,
      redirect_url: params.redirectUrl,
      webhook_url: params.webhookUrl,
      customer: params.customer,
      ...(params.address ? { address: params.address } : {})
    });
  } catch (error) {
    console.error('InfinitePay: falha ao criar link de pagamento:', error);
    throw new HttpError(502, 'Não foi possível conectar ao pagamento. Tente novamente em instantes.');
  }

  // A documentação mostra a resposta como { checkout_url } ou { link, slug }
  const url = result.data && (result.data.checkout_url || result.data.link || result.data.url);
  if (result.status >= 300 || typeof url !== 'string') {
    console.error(`InfinitePay: resposta inesperada ao criar link (HTTP ${result.status}):`, result.text.slice(0, 500));
    throw new HttpError(502, 'Não foi possível gerar o pagamento. Tente novamente em instantes.');
  }

  return { url, slug: typeof result.data?.slug === 'string' ? result.data.slug : null };
}

export interface PaymentCheck {
  paid: boolean;
  amount: number;      // centavos
  paidAmount: number;  // centavos (pode incluir juros do parcelamento)
  installments: number;
  captureMethod: string | null;
}

export async function checkPayment(params: { handle: string; orderNsu: string; transactionNsu: string; slug: string }): Promise<PaymentCheck> {
  const result = await post('/payment_check', {
    handle: params.handle,
    order_nsu: params.orderNsu,
    transaction_nsu: params.transactionNsu,
    slug: params.slug
  });

  if (result.status >= 300 || !result.data) {
    console.error(`InfinitePay: falha na consulta de pagamento (HTTP ${result.status}):`, result.text.slice(0, 500));
    throw new Error('Consulta de pagamento indisponível');
  }

  const data = result.data;
  return {
    paid: data.success === true && data.paid === true,
    amount: Number(data.amount) || 0,
    paidAmount: Number(data.paid_amount) || 0,
    installments: Number(data.installments) || 1,
    captureMethod: typeof data.capture_method === 'string' ? data.capture_method : null
  };
}
