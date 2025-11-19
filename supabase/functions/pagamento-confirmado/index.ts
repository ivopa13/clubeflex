import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentPayload {
  event_id: string;
  invoice_id_ext: string;
  paid_amount: number;
  paid_at: string;
  payment_type?: string; // Opcional para retrocompatibilidade
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: PaymentPayload = await req.json();
    console.log('Received payment_confirmed webhook:', payload);

    const { event_id, invoice_id_ext, paid_amount, paid_at } = payload;

    // Check if event already processed (idempotency)
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', event_id)
      .maybeSingle();

    if (existingEvent) {
      console.log(`Event ${event_id} already processed, skipping`);
      return new Response(
        JSON.stringify({ ok: true, message: 'Event already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get invoice with customer name
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(name)
      `)
      .eq('invoice_id_ext', invoice_id_ext)
      .single();

    if (invoiceError || !invoice) {
      console.error('Invoice not found:', invoice_id_ext);
      
      // Registrar erro de validação para não ficar retentando
      await supabase.from('validation_errors').insert({
        event_id: event_id,
        event_type: 'payment_confirmed',
        error_type: 'invoice_not_found',
        entity_type: 'payment',
        received_data: payload,
        error_details: `Fatura ${invoice_id_ext} não foi encontrada. Certifique-se de que a fatura foi sincronizada antes de enviar o pagamento. Em modo teste, apenas as faturas mais recentes são sincronizadas.`,
      });
      
      // Retornar 200 para que o integrador não fique retentando
      return new Response(
        JSON.stringify({ ok: true, message: 'Payment ignored - invoice not found', warning: 'Invoice must be synced before payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get program settings
    const { data: settings, error: settingsError } = await supabase
      .from('program_settings')
      .select('earn_rate_customer, earn_rate_specifier')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw settingsError;
    }

    const totalAmount = invoice.total_amount;

    // Calculate released points for customer
    const maxCustomer = Number((totalAmount * settings.earn_rate_customer).toFixed(2));
    const liberavelCustomer = maxCustomer - invoice.released_points_customer;
    const releaseCustomer = Math.min(
      Number((paid_amount * settings.earn_rate_customer).toFixed(2)),
      liberavelCustomer
    );

    // Calculate released points for specifier
    let releaseSpecifier = 0;
    if (invoice.specifier_id) {
      const maxSpecifier = Number((totalAmount * settings.earn_rate_specifier).toFixed(2));
      const liberavelSpecifier = maxSpecifier - invoice.released_points_specifier;
      releaseSpecifier = Math.min(
        Number((paid_amount * settings.earn_rate_specifier).toFixed(2)),
        liberavelSpecifier
      );
    }

    // Update invoice
    const newReleasedCustomer = invoice.released_points_customer + releaseCustomer;
    const newPendingCustomer = invoice.pending_points_customer - releaseCustomer;
    const newReleasedSpecifier = invoice.released_points_specifier + releaseSpecifier;
    const newPendingSpecifier = invoice.pending_points_specifier - releaseSpecifier;

    // Determine new status
    let newStatus = invoice.status;
    if (newReleasedCustomer >= maxCustomer && (!invoice.specifier_id || newReleasedSpecifier >= Number((totalAmount * settings.earn_rate_specifier).toFixed(2)))) {
      newStatus = 'paid';
    } else if (newReleasedCustomer > 0 || newReleasedSpecifier > 0) {
      newStatus = 'partially_paid';
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        released_points_customer: newReleasedCustomer,
        pending_points_customer: newPendingCustomer,
        released_points_specifier: newReleasedSpecifier,
        pending_points_specifier: newPendingSpecifier,
        status: newStatus,
      })
      .eq('id', invoice.id);

    if (updateError) {
      console.error('Error updating invoice:', updateError);
      throw updateError;
    }

    // Insert ledger entries
    const ledgerEntries = [];
    const customerFirstName = invoice.customer?.name?.split(' ')[0] || '';
    const invoiceRef = customerFirstName ? `${invoice_id_ext} - ${customerFirstName}` : invoice_id_ext;

    if (releaseCustomer > 0) {
      ledgerEntries.push({
        actor_type: 'customer',
        actor_id_customer: invoice.customer_id,
        actor_id_specifier: null,
        invoice_id: invoice.id,
        type: 'pending_sub',
        points: -releaseCustomer,
        ref: `Pagamento ${invoiceRef}`,
      });
      ledgerEntries.push({
        actor_type: 'customer',
        actor_id_customer: invoice.customer_id,
        actor_id_specifier: null,
        invoice_id: invoice.id,
        type: 'released_add',
        points: releaseCustomer,
        ref: `Pagamento ${invoiceRef}`,
      });
    }

    if (releaseSpecifier > 0 && invoice.specifier_id) {
      ledgerEntries.push({
        actor_type: 'specifier',
        actor_id_customer: null,
        actor_id_specifier: invoice.specifier_id,
        invoice_id: invoice.id,
        type: 'pending_sub',
        points: -releaseSpecifier,
        ref: `Pagamento ${invoiceRef}`,
      });
      ledgerEntries.push({
        actor_type: 'specifier',
        actor_id_customer: null,
        actor_id_specifier: invoice.specifier_id,
        invoice_id: invoice.id,
        type: 'released_add',
        points: releaseSpecifier,
        ref: `Pagamento ${invoiceRef}`,
      });
    }

    if (ledgerEntries.length > 0) {
      const { error: ledgerError } = await supabase
        .from('points_ledger')
        .insert(ledgerEntries);

      if (ledgerError) {
        console.error('Error inserting ledger entries:', ledgerError);
        throw ledgerError;
      }
    }

    // Create payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        payment_event_id: event_id,
        invoice_id: invoice.id,
        paid_amount,
        paid_at,
        payment_type: payload.payment_type || 'unknown',
      });

    if (paymentError) {
      console.error('Error recording payment:', paymentError);
      throw paymentError;
    }

    // Record webhook event
    const { error: webhookError } = await supabase
      .from('webhook_events')
      .insert({
        event_id,
        source: 'payment_confirmed',
        payload: payload,
      });

    if (webhookError) {
      console.error('Error recording webhook event:', webhookError);
      throw webhookError;
    }

    console.log(`Payment for invoice ${invoice_id_ext} processed successfully`);

    return new Response(
      JSON.stringify({ 
        ok: true,
        released_points_added_customer: releaseCustomer,
        released_points_added_specifier: releaseSpecifier,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
