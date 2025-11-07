import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validação de CPF
function validarCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;
  
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(10))) return false;
  
  return true;
}

// Validação de CNPJ
function validarCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/[^\d]/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  
  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digitos.charAt(0))) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digitos.charAt(1))) return false;
  
  return true;
}

// Validação de documento (CPF ou CNPJ)
function validarDocumento(doc: string): boolean {
  const cleanDoc = doc.replace(/[^\d]/g, '');
  if (cleanDoc.length === 11) {
    return validarCPF(doc);
  } else if (cleanDoc.length === 14) {
    return validarCNPJ(doc);
  }
  return false;
}

interface InvoicePayload {
  event_id: string;
  source: string;
  invoice_id_ext: string;
  total_amount: number;
  issued_at: string;
  customer: {
    id_ext: string;
    name: string;
    doc: string;
    email?: string;
    phone?: string;
  };
  specifier?: {
    id_ext: string;
    name: string;
    doc: string;
    email?: string;
    phone?: string;
    role: string;
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

    const { event_id, invoice_id_ext, total_amount, customer, specifier } = payload;

    // Validar dados do cliente
    if (!customer.name || customer.name.trim() === '') {
      console.error('Validação falhou: Nome do cliente vazio');
      return new Response(
        JSON.stringify({ ok: false, error: 'Nome do cliente é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!customer.doc || !validarDocumento(customer.doc)) {
      console.error('Validação falhou: CPF/CNPJ do cliente inválido:', customer.doc);
      return new Response(
        JSON.stringify({ ok: false, error: 'CPF/CNPJ do cliente inválido ou ausente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar dados do especificador (se presente)
    if (specifier) {
      if (!specifier.name || specifier.name.trim() === '') {
        console.error('Validação falhou: Nome do especificador vazio');
        return new Response(
          JSON.stringify({ ok: false, error: 'Nome do especificador é obrigatório' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (!specifier.doc || !validarDocumento(specifier.doc)) {
        console.error('Validação falhou: CPF/CNPJ do especificador inválido:', specifier.doc);
        return new Response(
          JSON.stringify({ ok: false, error: 'CPF/CNPJ do especificador inválido ou ausente' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

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
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .upsert({
        customer_id_ext: customer.id_ext,
        name: customer.name,
        doc: customer.doc,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
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
    if (specifier) {
      const { data: specifierData, error: specifierError } = await supabase
        .from('specifiers')
        .upsert({
          specifier_id_ext: specifier.id_ext,
          name: specifier.name,
          doc: specifier.doc,
          email: specifier.email ?? null,
          phone: specifier.phone ?? null,
          role: specifier.role,
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
      specifierId = specifierData.id;
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

    const pendingCustomer = Number((total_amount * settings.earn_rate_customer).toFixed(2));
    const pendingSpecifier = specifierId 
      ? Number((total_amount * settings.earn_rate_specifier).toFixed(2))
      : 0;

    // Create invoice
    const { data: newInvoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_id_ext: invoice_id_ext,
        customer_id: customerData.id,
        specifier_id: specifierId,
        total_amount: total_amount,
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
    const customerFirstName = customer.name.split(' ')[0];
    const invoiceRef = `${invoice_id_ext} - ${customerFirstName}`;
    
    const ledgerEntries = [
      {
        actor_type: 'customer',
        actor_id_customer: customerData.id,
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

    console.log(`Invoice ${invoice_id_ext} processed successfully`);

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
