import { createClient } from 'npm:@supabase/supabase-js@2';

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

function normalizarDocumento(doc: string | null | undefined): string | null {
  if (!doc || doc.trim() === '' || doc.toUpperCase().trim() === 'N') {
    return null;
  }
  return doc;
}

function validarDocumentos(cpf: string | null | undefined, cnpj: string | null | undefined): { valid: boolean; doc: string | null; error?: string } {
  const cpfNorm = normalizarDocumento(cpf);
  const cnpjNorm = normalizarDocumento(cnpj);
  
  if (!cpfNorm && !cnpjNorm) {
    return { valid: false, doc: null, error: 'CPF ou CNPJ é obrigatório. Recebido: ambos vazios ou "N"' };
  }
  
  if (cpfNorm) {
    if (!validarCPF(cpfNorm)) {
      return { valid: false, doc: cpfNorm, error: `CPF inválido: ${cpfNorm}` };
    }
    return { valid: true, doc: cpfNorm };
  }
  
  if (cnpjNorm) {
    if (!validarCNPJ(cnpjNorm)) {
      return { valid: false, doc: cnpjNorm, error: `CNPJ inválido: ${cnpjNorm}` };
    }
    return { valid: true, doc: cnpjNorm };
  }
  
  return { valid: false, doc: null, error: 'Nenhum documento válido fornecido' };
}

interface InvoicePayload {
  event_id: string;
  source: string;
  invoice_id_ext: string;
  order_number?: string;
  total_amount: number;
  issued_at: string;
  movement_type?: string;
  customer: {
    id_ext: string;
    name: string;
    doc?: string;
    cpf?: string;
    cnpj?: string;
    email?: string;
    phone?: string;
  };
  specifier?: {
    id_ext: string;
    name: string;
    doc?: string;
    cpf?: string;
    cnpj?: string;
    email?: string;
    phone?: string;
    role: string;
  };
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

    const payload: InvoicePayload = await req.json();
    console.log('Received invoice_created webhook:', payload.event_id, payload.invoice_id_ext);

    const { event_id, invoice_id_ext, order_number, total_amount, customer, specifier, movement_type } = payload;

    // Validar nome do cliente
    if (!customer.name || customer.name.trim() === '') {
      await supabase.from('validation_errors').insert({
        event_id, event_type: 'invoice_created', error_type: 'empty_name',
        entity_type: 'customer', received_data: customer,
        error_details: 'Nome do cliente está vazio ou ausente',
      });
      return new Response(
        JSON.stringify({ ok: false, error: 'Nome do cliente é obrigatório', validation_error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar documento do cliente
    const customerCpf = customer.cpf || (customer.doc && customer.doc.replace(/[^\d]/g, '').length === 11 ? customer.doc : null);
    const customerCnpj = customer.cnpj || (customer.doc && customer.doc.replace(/[^\d]/g, '').length === 14 ? customer.doc : null);
    const customerDocValidation = validarDocumentos(customerCpf, customerCnpj);
    
    if (!customerDocValidation.valid) {
      await supabase.from('validation_errors').insert({
        event_id, event_type: 'invoice_created', error_type: 'invalid_cpf_cnpj',
        entity_type: 'customer', received_data: customer,
        error_details: customerDocValidation.error,
      });
      return new Response(
        JSON.stringify({ ok: false, error: 'Cliente deve ter CPF ou CNPJ válido', validation_error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar especificador se presente
    let specifierDocValidation = null;
    if (specifier) {
      if (!specifier.name || specifier.name.trim() === '') {
        await supabase.from('validation_errors').insert({
          event_id, event_type: 'invoice_created', error_type: 'empty_name',
          entity_type: 'specifier', received_data: specifier,
          error_details: 'Nome do especificador está vazio ou ausente',
        });
        return new Response(
          JSON.stringify({ ok: false, error: 'Nome do especificador é obrigatório', validation_error: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const specifierCpf = specifier.cpf || (specifier.doc && specifier.doc.replace(/[^\d]/g, '').length === 11 ? specifier.doc : null);
      const specifierCnpj = specifier.cnpj || (specifier.doc && specifier.doc.replace(/[^\d]/g, '').length === 14 ? specifier.doc : null);
      
      if (specifierCpf || specifierCnpj) {
        specifierDocValidation = validarDocumentos(specifierCpf, specifierCnpj);
        if (!specifierDocValidation.valid) {
          await supabase.from('validation_errors').insert({
            event_id, event_type: 'invoice_created', error_type: 'invalid_cpf_cnpj',
            entity_type: 'specifier', received_data: specifier,
            error_details: specifierDocValidation.error,
          });
          return new Response(
            JSON.stringify({ ok: false, error: 'Especificador deve ter CPF ou CNPJ válido', validation_error: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      } else {
        specifierDocValidation = { valid: true, doc: null };
      }
    }

    // Verificar idempotência
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', event_id)
      .maybeSingle();

    if (existingEvent) {
      if (order_number) {
        await supabase.from('invoices').update({ order_number }).eq('invoice_id_ext', invoice_id_ext).is('order_number', null);
      }
      return new Response(
        JSON.stringify({ ok: true, message: 'Event already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Upsert customer baseado no doc
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('doc', customerDocValidation.doc!)
      .maybeSingle();

    let customerData;
    
    if (existingCustomer) {
      const externalIds = existingCustomer.external_ids || [];
      const idExists = externalIds.some((item: any) => item.id_ext === customer.id_ext);
      let updatedExternalIds = [...externalIds];
      
      if (!idExists) {
        updatedExternalIds.push({ id_ext: customer.id_ext, name: customer.name });
      } else {
        updatedExternalIds = updatedExternalIds.map((item: any) => 
          item.id_ext === customer.id_ext ? { id_ext: customer.id_ext, name: customer.name } : item
        );
      }
      
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update({
          customer_id_ext: customer.id_ext,
          name: customer.name,
          email: customer.email ?? existingCustomer.email,
          phone: customer.phone ?? existingCustomer.phone,
          external_ids: updatedExternalIds,
        })
        .eq('id', existingCustomer.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      customerData = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from('customers')
        .insert({
          customer_id_ext: customer.id_ext,
          name: customer.name,
          doc: customerDocValidation.doc!,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
          status: 'active',
          external_ids: [{ id_ext: customer.id_ext, name: customer.name }],
        })
        .select()
        .single();
      
      if (createError) throw createError;
      customerData = created;
    }

    // Processar especificador se presente
    let specifierId = null;
    if (specifier && specifierDocValidation) {
      if (specifierDocValidation.doc) {
        const { data: existingSpecifier } = await supabase
          .from('specifiers')
          .select('*')
          .eq('doc', specifierDocValidation.doc)
          .maybeSingle();

        if (existingSpecifier) {
          const externalIds = existingSpecifier.external_ids || [];
          const idExists = externalIds.some((item: any) => item.id_ext === specifier.id_ext);
          let updatedExternalIds = [...externalIds];
          
          if (!idExists) {
            updatedExternalIds.push({ id_ext: specifier.id_ext, name: specifier.name });
          } else {
            updatedExternalIds = updatedExternalIds.map((item: any) => 
              item.id_ext === specifier.id_ext ? { id_ext: specifier.id_ext, name: specifier.name } : item
            );
          }
          
          const { data: updated, error: updateError } = await supabase
            .from('specifiers')
            .update({
              specifier_id_ext: specifier.id_ext,
              name: specifier.name,
              email: specifier.email ?? existingSpecifier.email,
              phone: specifier.phone ?? existingSpecifier.phone,
              role: specifier.role,
              external_ids: updatedExternalIds,
            })
            .eq('id', existingSpecifier.id)
            .select()
            .single();
          
          if (updateError) throw updateError;
          specifierId = updated.id;
        } else {
          const { data: created, error: createError } = await supabase
            .from('specifiers')
            .insert({
              specifier_id_ext: specifier.id_ext,
              name: specifier.name,
              doc: specifierDocValidation.doc,
              email: specifier.email ?? null,
              phone: specifier.phone ?? null,
              role: specifier.role,
              status: 'active',
              external_ids: [{ id_ext: specifier.id_ext, name: specifier.name }],
            })
            .select()
            .single();
          
          if (createError) throw createError;
          specifierId = created.id;
        }
      } else {
        const { data: specifierData, error: specifierError } = await supabase
          .from('specifiers')
          .upsert({
            specifier_id_ext: specifier.id_ext,
            name: specifier.name,
            doc: 'N/A',
            email: specifier.email ?? null,
            phone: specifier.phone ?? null,
            role: specifier.role,
            status: 'active',
            external_ids: [{ id_ext: specifier.id_ext, name: specifier.name }],
          }, { onConflict: 'specifier_id_ext', ignoreDuplicates: false })
          .select()
          .single();

        if (specifierError) throw specifierError;
        specifierId = specifierData.id;
      }
    }

    // Buscar configurações
    const { data: settings, error: settingsError } = await supabase
      .from('program_settings')
      .select('earn_rate_customer, earn_rate_specifier')
      .limit(1)
      .single();

    if (settingsError) throw settingsError;

    const pendingCustomer = Number((total_amount * settings.earn_rate_customer).toFixed(2));
    const pendingSpecifier = specifierId ? Number((total_amount * settings.earn_rate_specifier).toFixed(2)) : 0;

    // Verificar se fatura já existe
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_id_ext', invoice_id_ext)
      .maybeSingle();

    if (existingInvoice) {
      await supabase.from('invoices').update({
        customer_id: customerData.id,
        specifier_id: specifierId,
        total_amount,
        movement_type: movement_type ?? null,
        order_number: order_number ?? null,
      }).eq('id', existingInvoice.id);
      
      await supabase.from('webhook_events').insert({ event_id, source: 'invoice_created', payload });
      
      return new Response(
        JSON.stringify({ ok: true, invoice_id: existingInvoice.id, updated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Criar fatura
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_id_ext,
        order_number: order_number ?? null,
        customer_id: customerData.id,
        specifier_id: specifierId,
        total_amount,
        pending_points_customer: pendingCustomer,
        pending_points_specifier: pendingSpecifier,
        released_points_customer: 0,
        released_points_specifier: 0,
        status: 'created',
        movement_type: movement_type ?? null,
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Registrar pontos pendentes no ledger
    const ledgerEntries = [];
    const customerFirstName = customer.name.split(' ')[0];
    const invoiceRef = `${invoice_id_ext} - ${customerFirstName}`;

    if (pendingCustomer > 0) {
      ledgerEntries.push({
        actor_type: 'customer',
        actor_id_customer: customerData.id,
        actor_id_specifier: null,
        invoice_id: invoiceData.id,
        type: 'pending_add',
        points: pendingCustomer,
        ref: `Nova fatura ${invoiceRef}`,
      });
    }

    if (pendingSpecifier > 0 && specifierId) {
      ledgerEntries.push({
        actor_type: 'specifier',
        actor_id_customer: null,
        actor_id_specifier: specifierId,
        invoice_id: invoiceData.id,
        type: 'pending_add',
        points: pendingSpecifier,
        ref: `Nova fatura ${invoiceRef}`,
      });
    }

    if (ledgerEntries.length > 0) {
      const { error: ledgerError } = await supabase.from('points_ledger').insert(ledgerEntries);
      if (ledgerError) throw ledgerError;
    }

    // Registrar evento
    await supabase.from('webhook_events').insert({ event_id, source: 'invoice_created', payload });

    console.log('Invoice created successfully:', invoiceData.id);

    return new Response(
      JSON.stringify({
        ok: true,
        invoice_id: invoiceData.id,
        pending_points_customer: pendingCustomer,
        pending_points_specifier: pendingSpecifier,
      }),
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
