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

// Função auxiliar: normaliza "N" para null
function normalizarDocumento(doc: string | null | undefined): string | null {
  if (!doc || doc.trim() === '' || doc.toUpperCase().trim() === 'N') {
    return null;
  }
  return doc;
}

// Validação de documento (CPF ou CNPJ)
function validarDocumento(doc: string | null | undefined): boolean {
  const docNormalizado = normalizarDocumento(doc);
  
  // Se não tem documento, é inválido
  if (!docNormalizado) {
    return false;
  }
  
  const cleanDoc = docNormalizado.replace(/[^\d]/g, '');
  if (cleanDoc.length === 11) {
    return validarCPF(docNormalizado);
  } else if (cleanDoc.length === 14) {
    return validarCNPJ(docNormalizado);
  }
  return false;
}

// Validação de entidade (Customer ou Specifier) - aceita "N" em um documento se o outro for válido
function validarDocumentos(cpf: string | null | undefined, cnpj: string | null | undefined): { valid: boolean; doc: string | null; error?: string } {
  const cpfNorm = normalizarDocumento(cpf);
  const cnpjNorm = normalizarDocumento(cnpj);
  
  // Pelo menos um documento deve existir
  if (!cpfNorm && !cnpjNorm) {
    return { 
      valid: false, 
      doc: null,
      error: 'CPF ou CNPJ é obrigatório. Recebido: ambos vazios ou "N"'
    };
  }
  
  // Se tem CPF, validar
  if (cpfNorm) {
    if (!validarCPF(cpfNorm)) {
      return { 
        valid: false, 
        doc: cpfNorm,
        error: `CPF inválido: ${cpfNorm}`
      };
    }
    return { valid: true, doc: cpfNorm };
  }
  
  // Se tem CNPJ, validar
  if (cnpjNorm) {
    if (!validarCNPJ(cnpjNorm)) {
      return { 
        valid: false, 
        doc: cnpjNorm,
        error: `CNPJ inválido: ${cnpjNorm}`
      };
    }
    return { valid: true, doc: cnpjNorm };
  }
  
  return { 
    valid: false, 
    doc: null,
    error: 'Nenhum documento válido fornecido'
  };
}

interface InvoicePayload {
  event_id: string;
  source: string;
  invoice_id_ext: string;
  order_number?: string;
  total_amount: number;
  issued_at: string;
  movement_type?: string; // produto ou servico
  customer: {
    id_ext: string;
    name: string;
    doc?: string;  // Mantém compatibilidade
    cpf?: string;  // Novos campos separados
    cnpj?: string;
    email?: string;
    phone?: string;
  };
  specifier?: {
    id_ext: string;
    name: string;
    doc?: string;  // Mantém compatibilidade
    cpf?: string;  // Novos campos separados
    cnpj?: string;
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

    const { event_id, invoice_id_ext, order_number, total_amount, customer, specifier, movement_type } = payload;

    // Validar dados do cliente
    if (!customer.name || customer.name.trim() === '') {
      console.error('Validação falhou: Nome do cliente vazio');
      
      // Registrar erro de validação
      await supabase.from('validation_errors').insert({
        event_id: event_id,
        event_type: 'invoice_created',
        error_type: 'empty_name',
        entity_type: 'customer',
        received_data: customer,
        error_details: 'Nome do cliente está vazio ou ausente',
      });
      
      return new Response(
        JSON.stringify({ ok: false, error: 'Nome do cliente é obrigatório', validation_error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar documento do cliente (suporta doc único ou cpf/cnpj separados)
    const customerCpf = customer.cpf || (customer.doc && customer.doc.replace(/[^\d]/g, '').length === 11 ? customer.doc : null);
    const customerCnpj = customer.cnpj || (customer.doc && customer.doc.replace(/[^\d]/g, '').length === 14 ? customer.doc : null);
    const customerDocValidation = validarDocumentos(customerCpf, customerCnpj);
    
    if (!customerDocValidation.valid) {
      console.error('Validação falhou: CPF/CNPJ do cliente inválido:', customerDocValidation.error);
      
      // Registrar erro de validação
      await supabase.from('validation_errors').insert({
        event_id: event_id,
        event_type: 'invoice_created',
        error_type: 'invalid_cpf_cnpj',
        entity_type: 'customer',
        received_data: customer,
        error_details: customerDocValidation.error,
      });
      
      return new Response(
        JSON.stringify({ ok: false, error: 'Cliente deve ter CPF ou CNPJ válido', validation_error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar dados do especificador (se presente)
    let specifierDocValidation = null;
    if (specifier) {
      if (!specifier.name || specifier.name.trim() === '') {
        console.error('Validação falhou: Nome do especificador vazio');
        
        // Registrar erro de validação
        await supabase.from('validation_errors').insert({
          event_id: event_id,
          event_type: 'invoice_created',
          error_type: 'empty_name',
          entity_type: 'specifier',
          received_data: specifier,
          error_details: 'Nome do especificador está vazio ou ausente',
        });
        
        return new Response(
          JSON.stringify({ ok: false, error: 'Nome do especificador é obrigatório', validation_error: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Validar documento do especificador (suporta doc único ou cpf/cnpj separados)
      // OPCIONAL: Se não tem nenhum documento, aceita sem validar
      const specifierCpf = specifier.cpf || (specifier.doc && specifier.doc.replace(/[^\d]/g, '').length === 11 ? specifier.doc : null);
      const specifierCnpj = specifier.cnpj || (specifier.doc && specifier.doc.replace(/[^\d]/g, '').length === 14 ? specifier.doc : null);
      
      // Se tem algum documento, valida
      if (specifierCpf || specifierCnpj) {
        specifierDocValidation = validarDocumentos(specifierCpf, specifierCnpj);
        
        if (!specifierDocValidation.valid) {
          console.error('Validação falhou: CPF/CNPJ do especificador inválido:', specifierDocValidation.error);
          
          // Registrar erro de validação
          await supabase.from('validation_errors').insert({
            event_id: event_id,
            event_type: 'invoice_created',
            error_type: 'invalid_cpf_cnpj',
            entity_type: 'specifier',
            received_data: specifier,
            error_details: specifierDocValidation.error,
          });
          
          return new Response(
            JSON.stringify({ ok: false, error: 'Especificador deve ter CPF ou CNPJ válido', validation_error: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      } else {
        // Se não tem documento, aceita (especificadores podem não ter CPF/CNPJ)
        console.log('Especificador sem documento - permitido');
        specifierDocValidation = { valid: true, doc: null };
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
      
      // Se o order_number veio no payload mas está NULL no banco, atualizar
      if (order_number) {
        await supabase
          .from('invoices')
          .update({ order_number: order_number })
          .eq('invoice_id_ext', invoice_id_ext)
          .is('order_number', null);
      }
      
      return new Response(
        JSON.stringify({ ok: true, message: 'Event already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Upsert customer baseado no doc (CNPJ/CPF)
    // Primeiro, verificar se já existe um customer com esse doc
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('doc', customerDocValidation.doc!)
      .maybeSingle();

    let customerData;
    
    if (existingCustomer) {
      console.log(`Customer com doc ${customerDocValidation.doc} já existe, atualizando...`);
      
      // Verificar se o customer_id_ext já está no array external_ids
      const externalIds = existingCustomer.external_ids || [];
      const idExists = externalIds.some((item: any) => item.id_ext === customer.id_ext);
      
      // Preparar o novo array de external_ids
      let updatedExternalIds = [...externalIds];
      if (!idExists) {
        updatedExternalIds.push({ id_ext: customer.id_ext, name: customer.name });
        console.log(`Adicionando novo CODCLI ${customer.id_ext} ao customer ${existingCustomer.id}`);
      } else {
        // Atualizar o nome se o id_ext já existe
        updatedExternalIds = updatedExternalIds.map((item: any) => 
          item.id_ext === customer.id_ext 
            ? { id_ext: customer.id_ext, name: customer.name }
            : item
        );
        console.log(`Atualizando nome do CODCLI ${customer.id_ext} existente`);
      }
      
      // Atualizar o customer
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update({
          customer_id_ext: customer.id_ext, // Atualizar para o mais recente
          name: customer.name, // Atualizar para o mais recente
          email: customer.email ?? existingCustomer.email,
          phone: customer.phone ?? existingCustomer.phone,
          external_ids: updatedExternalIds,
        })
        .eq('id', existingCustomer.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating customer:', updateError);
        throw updateError;
      }
      customerData = updated;
    } else {
      console.log(`Criando novo customer com doc ${customerDocValidation.doc}`);
      
      // Criar novo customer
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
      
      if (createError) {
        console.error('Error creating customer:', createError);
        throw createError;
      }
      customerData = created;
    }

    let specifierId = null;
    if (specifier && specifierDocValidation) {
      // Se tem documento válido, fazer upsert baseado no doc
      if (specifierDocValidation.doc) {
        const { data: existingSpecifier } = await supabase
          .from('specifiers')
          .select('*')
          .eq('doc', specifierDocValidation.doc)
          .maybeSingle();

        if (existingSpecifier) {
          console.log(`Specifier com doc ${specifierDocValidation.doc} já existe, atualizando...`);
          
          const externalIds = existingSpecifier.external_ids || [];
          const idExists = externalIds.some((item: any) => item.id_ext === specifier.id_ext);
          
          let updatedExternalIds = [...externalIds];
          if (!idExists) {
            updatedExternalIds.push({ id_ext: specifier.id_ext, name: specifier.name });
            console.log(`Adicionando novo código ${specifier.id_ext} ao specifier ${existingSpecifier.id}`);
          } else {
            updatedExternalIds = updatedExternalIds.map((item: any) => 
              item.id_ext === specifier.id_ext 
                ? { id_ext: specifier.id_ext, name: specifier.name }
                : item
            );
            console.log(`Atualizando nome do código ${specifier.id_ext} existente`);
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
          
          if (updateError) {
            console.error('Error updating specifier:', updateError);
            throw updateError;
          }
          specifierId = updated.id;
        } else {
          console.log(`Criando novo specifier com doc ${specifierDocValidation.doc}`);
          
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
          
          if (createError) {
            console.error('Error creating specifier:', createError);
            throw createError;
          }
          specifierId = created.id;
        }
      } else {
        // Sem documento, fazer upsert pelo specifier_id_ext (comportamento antigo)
        console.log('Specifier sem documento, usando specifier_id_ext como chave');
        
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
        order_number: order_number || null,
        customer_id: customerData.id,
        specifier_id: specifierId,
        total_amount: total_amount,
        pending_points_customer: pendingCustomer,
        pending_points_specifier: pendingSpecifier,
        status: 'created',
        movement_type: movement_type || 'produto',
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

    // Send WhatsApp notifications
    const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const whatsappTemplateCustomer = Deno.env.get('WHATSAPP_TEMPLATE_NAME'); // Template para cliente
    const whatsappTemplateSpecifier = Deno.env.get('WHATSAPP_TEMPLATE_SPECIFIER'); // Template para especificador

    if (whatsappPhoneNumberId && whatsappAccessToken) {
      // Helper to format phone number for WhatsApp
      const formatPhoneForWhatsApp = (phone: string | null | undefined): string | null => {
        if (!phone) return null;
        // Remove all non-digits
        let cleaned = phone.replace(/\D/g, '');
        // If starts with 0, remove it
        if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
        // Add Brazil country code if not present
        if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
        // WhatsApp requires at least 12 digits for Brazil (55 + DDD + number)
        if (cleaned.length < 12) return null;
        return cleaned;
      };

      // Helper to send WhatsApp message
      const sendWhatsAppMessage = async (to: string, templateName: string, recipientName: string, customerName: string, invoiceNumber: string, totalAmount: number, pendingPoints: number) => {
        try {
          const response = await fetch(
            `https://graph.facebook.com/v21.0/${whatsappPhoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${whatsappAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'template',
                template: {
                  name: templateName,
                  language: { code: 'pt_BR' },
                  components: [
                    {
                      type: 'body',
                      parameters: [
                        { type: 'text', text: recipientName.split(' ')[0] }, // First name of recipient
                        { type: 'text', text: customerName.split(' ')[0] }, // First name of customer (for specifier template)
                        { type: 'text', text: invoiceNumber },
                        { type: 'text', text: totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
                        { type: 'text', text: pendingPoints.toString() },
                      ],
                    },
                  ],
                },
              }),
            }
          );

          const result = await response.json();
          if (!response.ok) {
            console.error(`WhatsApp API error for ${to}:`, result);
          } else {
            console.log(`WhatsApp message sent to ${to}:`, result);
          }
          return result;
        } catch (error) {
          console.error(`Error sending WhatsApp to ${to}:`, error);
          return null;
        }
      };

      // Send to customer
      if (whatsappTemplateCustomer) {
        const customerPhone = formatPhoneForWhatsApp(customer.phone);
        if (customerPhone) {
          console.log(`Sending WhatsApp notification to customer: ${customerPhone}`);
          await sendWhatsAppMessage(customerPhone, whatsappTemplateCustomer, customer.name, customer.name, invoice_id_ext, total_amount, pendingCustomer);
        } else {
          console.log('Customer phone not available or invalid for WhatsApp');
        }
      } else {
        console.log('Customer WhatsApp template not configured');
      }

      // Send to specifier if exists
      if (specifier && specifierId && pendingSpecifier > 0 && whatsappTemplateSpecifier) {
        const specifierPhone = formatPhoneForWhatsApp(specifier.phone);
        if (specifierPhone) {
          console.log(`Sending WhatsApp notification to specifier: ${specifierPhone}`);
          await sendWhatsAppMessage(specifierPhone, whatsappTemplateSpecifier, specifier.name, customer.name, invoice_id_ext, total_amount, pendingSpecifier);
        } else {
          console.log('Specifier phone not available or invalid for WhatsApp');
        }
      }
    } else {
      console.log('WhatsApp credentials not configured, skipping notifications');
    }

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
    
    // Extract detailed error information
    let errorMessage = 'Unknown error';
    let errorDetails = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    // Check for Postgres/Supabase specific errors
    if (error && typeof error === 'object') {
      const pgError = error as any;
      
      // Enum constraint violation
      if (pgError.code === '22P02' || errorMessage.includes('invalid input value for enum')) {
        console.error('Enum validation error - possibly invalid role value:', pgError);
        errorMessage = `Valor de enum inválido. Detalhes: ${errorMessage}`;
        errorDetails = {
          code: pgError.code,
          hint: pgError.hint,
          details: pgError.details,
        };
      }
      
      // Foreign key violation
      if (pgError.code === '23503') {
        console.error('Foreign key violation:', pgError);
        errorMessage = `Referência inválida no banco de dados: ${errorMessage}`;
      }
      
      // Unique constraint violation
      if (pgError.code === '23505') {
        console.error('Unique constraint violation:', pgError);
        errorMessage = `Registro duplicado: ${errorMessage}`;
      }
      
      // Log full error object for debugging
      console.error('Full error object:', JSON.stringify(pgError, null, 2));
    }
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: errorMessage,
        ...(errorDetails && { details: errorDetails })
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
