import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentPayload {
  event_id: string;
  invoice_id_ext: string;
  paid_amount: number;
  paid_at: string;
  payment_type?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: PaymentPayload = await req.json();
    console.log('Received payment:', payload.event_id, payload.invoice_id_ext);

    const { event_id, invoice_id_ext, paid_amount, paid_at } = payload;

    // Verificar idempotência
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', event_id)
      .maybeSingle();

    if (existingEvent) {
      return new Response(
        JSON.stringify({ ok: true, message: 'Event already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Buscar fatura
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`*, customer:customers(name)`)
      .eq('invoice_id_ext', invoice_id_ext)
      .single();

    if (invoiceError || !invoice) {
      await supabase.from('validation_errors').insert({
        event_id, event_type: 'payment_confirmed', error_type: 'invoice_not_found',
        entity_type: 'payment', received_data: payload,
        error_details: `Fatura ${invoice_id_ext} não encontrada.`,
      });
      return new Response(
        JSON.stringify({ ok: true, message: 'Payment ignored - invoice not found', warning: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Buscar configurações
    const { data: settings, error: settingsError } = await supabase
      .from('program_settings')
      .select('earn_rate_customer, earn_rate_specifier')
      .limit(1)
      .single();

    if (settingsError) throw settingsError;

    const totalAmount = invoice.total_amount;

    // Calcular pontos liberados para customer
    const maxCustomer = Number((totalAmount * settings.earn_rate_customer).toFixed(2));
    const liberavelCustomer = maxCustomer - invoice.released_points_customer;
    const releaseCustomer = Math.min(
      Number((paid_amount * settings.earn_rate_customer).toFixed(2)),
      liberavelCustomer
    );

    // Calcular pontos liberados para specifier
    let releaseSpecifier = 0;
    if (invoice.specifier_id) {
      const maxSpecifier = Number((totalAmount * settings.earn_rate_specifier).toFixed(2));
      const liberavelSpecifier = maxSpecifier - invoice.released_points_specifier;
      releaseSpecifier = Math.min(
        Number((paid_amount * settings.earn_rate_specifier).toFixed(2)),
        liberavelSpecifier
      );
    }

    // Atualizar fatura
    const newReleasedCustomer = invoice.released_points_customer + releaseCustomer;
    const newPendingCustomer = invoice.pending_points_customer - releaseCustomer;
    const newReleasedSpecifier = invoice.released_points_specifier + releaseSpecifier;
    const newPendingSpecifier = invoice.pending_points_specifier - releaseSpecifier;

    let newStatus = invoice.status;
    if (newReleasedCustomer >= maxCustomer && (!invoice.specifier_id || newReleasedSpecifier >= Number((totalAmount * settings.earn_rate_specifier).toFixed(2)))) {
      newStatus = 'paid';
    } else if (newReleasedCustomer > 0 || newReleasedSpecifier > 0) {
      newStatus = 'partially_paid';
    }

    await supabase.from('invoices').update({
      released_points_customer: newReleasedCustomer,
      pending_points_customer: newPendingCustomer,
      released_points_specifier: newReleasedSpecifier,
      pending_points_specifier: newPendingSpecifier,
      status: newStatus,
    }).eq('id', invoice.id);

    // Registrar no ledger
    const ledgerEntries = [];
    const customerFirstName = invoice.customer?.name?.split(' ')[0] || '';
    const invoiceRef = customerFirstName ? `${invoice_id_ext} - ${customerFirstName}` : invoice_id_ext;

    if (releaseCustomer > 0) {
      ledgerEntries.push(
        { actor_type: 'customer', actor_id_customer: invoice.customer_id, actor_id_specifier: null, invoice_id: invoice.id, type: 'pending_sub', points: -releaseCustomer, ref: `Pagamento ${invoiceRef}` },
        { actor_type: 'customer', actor_id_customer: invoice.customer_id, actor_id_specifier: null, invoice_id: invoice.id, type: 'released_add', points: releaseCustomer, ref: `Pagamento ${invoiceRef}` }
      );
    }

    if (releaseSpecifier > 0 && invoice.specifier_id) {
      ledgerEntries.push(
        { actor_type: 'specifier', actor_id_customer: null, actor_id_specifier: invoice.specifier_id, invoice_id: invoice.id, type: 'pending_sub', points: -releaseSpecifier, ref: `Pagamento ${invoiceRef}` },
        { actor_type: 'specifier', actor_id_customer: null, actor_id_specifier: invoice.specifier_id, invoice_id: invoice.id, type: 'released_add', points: releaseSpecifier, ref: `Pagamento ${invoiceRef}` }
      );
    }

    if (ledgerEntries.length > 0) {
      await supabase.from('points_ledger').insert(ledgerEntries);
    }

    // Registrar pagamento
    await supabase.from('payments').insert({
      payment_event_id: event_id,
      invoice_id: invoice.id,
      paid_amount,
      paid_at,
      payment_type: payload.payment_type || 'unknown',
    });

    // Registrar evento
    await supabase.from('webhook_events').insert({ event_id, source: 'payment_confirmed', payload });

    console.log('Payment processed:', invoice_id_ext);

    return new Response(
      JSON.stringify({ ok: true, released_points_added_customer: releaseCustomer, released_points_added_specifier: releaseSpecifier }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
