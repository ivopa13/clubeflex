import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TituloPagamentoPayload {
  event_id: string
  source: string
  receivable_id_ext: string
  paid_amount: number
  paid_at: string
  payment_type: string
  payment_event_id?: string
  execution_id?: string
  /** Status forçado pelo integrador. 'P' marca o título como quitado. */
  status?: string
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

    const payload: TituloPagamentoPayload = await req.json()
    console.log('📥 Pagamento de título recebido:', payload.receivable_id_ext)

    // Validar campos obrigatórios
    if (!payload.event_id || !payload.receivable_id_ext || !payload.paid_amount) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: event_id, receivable_id_ext, paid_amount',
          validation_error: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar o título
    const { data: receivable, error: findError } = await supabaseAdmin
      .from('receivables')
      .select('id, amount, paid_amount, balance, status')
      .eq('receivable_id_ext', payload.receivable_id_ext)
      .maybeSingle()

    if (findError) {
      console.error('❌ Erro ao buscar título:', findError)
      throw new Error(`Failed to find receivable: ${findError.message}`)
    }

    if (!receivable) {
      console.warn(`⚠️ Título ${payload.receivable_id_ext} não encontrado`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Título ${payload.receivable_id_ext} não encontrado. Sincronize o título primeiro.`,
          validation_error: true,
          warning: true
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calcular novos valores
    const newPaidAmount = Number(receivable.paid_amount) + Number(payload.paid_amount)
    const newBalance = Number(receivable.amount) - newPaidAmount
    // Se o integrador informou status='P' explicitamente, força quitação (corrige pagos-fantasma).
    // Caso contrário, calcula pelo saldo como antes.
    const forcedPaid = payload.status === 'P'
    const newStatus = forcedPaid
      ? 'P'
      : (newBalance <= 0 ? 'P' : (newPaidAmount > 0 ? 'PP' : 'A')) // P = Pago, PP = Parcialmente Pago, A = Aberto

    // Atualizar o título
    // Quando status='P' é forçado, zera saldo e marca como quitado mesmo se o paid_amount cumulativo
    // não bater (renegociação, baixa parcial registrada como liquidação no ERP, etc).
    const { error: updateError } = await supabaseAdmin
      .from('receivables')
      .update({
        paid_amount: forcedPaid ? Number(receivable.amount) : newPaidAmount,
        balance: forcedPaid ? 0 : Math.max(0, newBalance),
        status: newStatus,
        is_overdue: newStatus === 'P' ? false : receivable.is_overdue,
        days_overdue: newStatus === 'P' ? 0 : receivable.days_overdue,
        updated_at: new Date().toISOString()
      })
      .eq('id', receivable.id)

    if (updateError) {
      console.error('❌ Erro ao atualizar título:', updateError)
      throw new Error(`Failed to update receivable: ${updateError.message}`)
    }

    // Registrar o pagamento
    const { error: paymentError } = await supabaseAdmin
      .from('receivable_payments')
      .insert({
        receivable_id: receivable.id,
        paid_amount: payload.paid_amount,
        paid_at: payload.paid_at,
        payment_type: payload.payment_type || 'unknown',
        payment_event_id: payload.payment_event_id || payload.event_id
      })

    if (paymentError) {
      console.error('❌ Erro ao registrar pagamento:', paymentError)
      // Não falhar por causa do registro do pagamento
    }

    console.log(`✅ Pagamento do título ${payload.receivable_id_ext} registrado. Novo saldo: ${newBalance}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        receivable_id: receivable.id,
        new_balance: Math.max(0, newBalance),
        new_status: newStatus
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro ao processar pagamento de título:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
