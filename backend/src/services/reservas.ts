import { sql } from '../database.js';

// Uma peça fica reservada enquanto houver pedido online aguardando pagamento dentro do prazo.
// Reservas vencidas deixam de valer sozinhas (não precisa de rotina de limpeza).
export async function reservaAtivaAte(productId: number): Promise<Date | null> {
  const [row] = await sql`
    SELECT MAX(expira_em) as ate FROM online_orders
    WHERE product_id = ${productId} AND status = 'AGUARDANDO_PAGAMENTO' AND expira_em > now()
  ` as Array<{ ate: Date | null }>;
  return row?.ate ?? null;
}
