import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoicePayload {
  event_id: string;
  invoice: {
    invoice_id_ext: string;
    customer: {
      id_ext: string;
      name: string;
    };
    specifier?: {
      id_ext: string;
      name: string;
      role: string;
    };
    total_amount: number;
    items?: any[];
    created_at: string;
  };
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

    const payload: InvoicePayload = await req.json();
    console.log('Received invoice_created webhook:', payload);

    const { event_id, invoice } = payload;

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

    // Upsert customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .upsert({
        customer_id_ext: invoice.customer.id_ext,
        name: invoice.customer.name,
        status: 'active',
      }, {
        onConflict: 'customer_id_ext',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (customerError) {
      console.error('Error upserting customer:', customerError);
      throw customerError;
    }

    let specifierId = null;
    if (invoice.specifier) {
      const { data: specifier, error: specifierError } = await supabase
        .from('specifiers')
        .upsert({
          specifier_id_ext: invoice.specifier.id_ext,
          name: invoice.specifier.name,
          role: invoice.specifier.role,
          status: 'active',
        }, {
          onConflict: 'specifier_id_ext',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (specifierError) {
        console.error('Error upserting specifier:', specifierError);
        throw specifierError;
      }
      specifierId = specifier.id;
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
    const pendingCustomer = Number((totalAmount * settings.earn_rate_customer).toFixed(2));
    const pendingSpecifier = specifierId 
      ? Number((totalAmount * settings.earn_rate_specifier).toFixed(2))
      : 0;

    // Create invoice
    const { data: newInvoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_id_ext: invoice.invoice_id_ext,
        customer_id: customer.id,
        specifier_id: specifierId,
        total_amount: totalAmount,
        pending_points_customer: pendingCustomer,
        pending_points_specifier: pendingSpecifier,
        status: 'created',
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      throw invoiceError;
    }

    // Insert ledger entries
    const customerFirstName = invoice.customer.name.split(' ')[0];
    const invoiceRef = `${invoice.invoice_id_ext} - ${customerFirstName}`;
    
    const ledgerEntries = [
      {
        actor_type: 'customer',
        actor_id_customer: customer.id,
        actor_id_specifier: null,
        invoice_id: newInvoice.id,
        type: 'pending_add',
        points: pendingCustomer,
        ref: `Fatura ${invoiceRef}`,
      },
    ];

    if (specifierId && pendingSpecifier > 0) {
      ledgerEntries.push({
        actor_type: 'specifier',
        actor_id_customer: null,
        actor_id_specifier: specifierId,
        invoice_id: newInvoice.id,
        type: 'pending_add',
        points: pendingSpecifier,
        ref: `Fatura ${invoiceRef}`,
      });
    }

    const { error: ledgerError } = await supabase
      .from('points_ledger')
      .insert(ledgerEntries);

    if (ledgerError) {
      console.error('Error inserting ledger entries:', ledgerError);
      throw ledgerError;
    }

    // Record webhook event
    const { error: webhookError } = await supabase
      .from('webhook_events')
      .insert({
        event_id,
        source: 'invoice_created',
        payload: payload,
      });

    if (webhookError) {
      console.error('Error recording webhook event:', webhookError);
      throw webhookError;
    }

    console.log(`Invoice ${invoice.invoice_id_ext} processed successfully`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        invoice_id: newInvoice.id,
        pending_points_customer: pendingCustomer,
        pending_points_specifier: pendingSpecifier,
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
