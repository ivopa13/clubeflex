import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TituloPayload {
  event_id: string
  source: string
  receivable_id_ext: string
  invoice_id_ext?: string
  amount: number
  paid_amount: number
  balance: number
  due_date: string
  issued_at: string
  installment_number: number
  total_installments: number
  status: string
  days_overdue: number
  is_overdue: boolean
  document_number?: string
  description?: string
  customer: {
    id_ext: string
    name: string
    doc?: string
    cpf?: string
    cnpj?: string
    email?: string
    phone?: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: TituloPayload = await req.json()
    console.log('📥 Título recebido:', payload.receivable_id_ext)

    // Validar campos obrigatórios
    if (!payload.receivable_id_ext || !payload.customer?.id_ext) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'receivable_id_ext e customer.id_ext são obrigatórios',
          validation_error: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determinar o doc do cliente (prioridade: doc > cpf > cnpj)
    const customerDoc = payload.customer.doc || payload.customer.cpf || payload.customer.cnpj

    // Se não tiver doc, registrar erro de validação e retornar
    if (!customerDoc) {
      console.warn(`⚠️ Cliente ${payload.customer.id_ext} (${payload.customer.name}) não possui CPF/CNPJ`)
      
      // Registrar erro de validação
      await supabaseAdmin.from('validation_errors').insert({
        event_id: payload.event_id,
        event_type: 'titulo_criado',
        entity_type: 'customer',
        error_type: 'missing_doc',
        error_details: `Cliente ${payload.customer.name} (ID: ${payload.customer.id_ext}) não possui CPF/CNPJ cadastrado no ERP`,
        received_data: payload,
        status: 'pending'
      })

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cliente ${payload.customer.name} não possui CPF/CNPJ cadastrado`,
          validation_error: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Limpar doc (remover caracteres especiais)
    const cleanDoc = customerDoc.replace(/\D/g, '')

    // Upsert do cliente
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .upsert({
        customer_id_ext: payload.customer.id_ext,
        name: payload.customer.name,
        doc: cleanDoc,
        email: payload.customer.email || null,
        phone: payload.customer.phone || null,
        status: 'active'
      }, { 
        onConflict: 'customer_id_ext',
        ignoreDuplicates: false 
      })
      .select('id')
      .single()

    if (customerError) {
      console.error('❌ Erro ao upsert customer:', customerError)
      throw new Error(`Failed to upsert customer: ${customerError.message}`)
    }

    console.log(`✅ Cliente ${payload.customer.name} (${cleanDoc}) processado`)

    // Upsert do título
    const { data: receivable, error: receivableError } = await supabaseAdmin
      .from('receivables')
      .upsert({
        receivable_id_ext: payload.receivable_id_ext,
        invoice_id_ext: payload.invoice_id_ext || null,
        customer_id: customer.id,
        amount: payload.amount,
        paid_amount: payload.paid_amount,
        balance: payload.balance,
        due_date: payload.due_date,
        issued_at: payload.issued_at,
        installment_number: payload.installment_number,
        total_installments: payload.total_installments,
        status: payload.status,
        days_overdue: payload.days_overdue,
        is_overdue: payload.is_overdue,
        document_number: payload.document_number || null,
        description: payload.description || null
      }, {
        onConflict: 'receivable_id_ext',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (receivableError) {
      console.error('❌ Erro ao upsert receivable:', receivableError)
      throw new Error(`Failed to upsert receivable: ${receivableError.message}`)
    }

    console.log(`✅ Título ${payload.receivable_id_ext} sincronizado com sucesso`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        receivable_id: receivable.id,
        customer_id: customer.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro ao processar título:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
