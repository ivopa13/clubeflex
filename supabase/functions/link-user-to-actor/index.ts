import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = userData.user.id

    // Verificar se quem chamou é admin
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { userId: targetUserId } = await req.json()

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'userId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Buscar o user e seu CPF/CNPJ
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
    if (!targetUser?.user) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Buscar doc do profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('doc')
      .eq('id', targetUserId)
      .maybeSingle()

    const userDoc = profile?.doc || targetUser.user.user_metadata?.doc
    
    if (!userDoc) {
      return new Response(JSON.stringify({ error: 'Usuário não possui CPF/CNPJ cadastrado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Remover caracteres especiais do doc
    const cleanDoc = userDoc.replace(/\D/g, '')

    // Tentar vincular a um customer
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .eq('doc', cleanDoc)
      .maybeSingle()

    if (customer) {
      // Atualizar o customer com o user_id
      const { error: updateErr } = await supabaseAdmin
        .from('customers')
        .update({ user_id: targetUserId })
        .eq('id', customer.id)

      if (updateErr) throw updateErr

      // Criar role de customer
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: targetUserId, role: 'customer' }, { onConflict: 'user_id,role' })

      console.log(`✅ Usuário ${targetUserId} vinculado ao customer ${customer.id} (${customer.name})`)

      return new Response(
        JSON.stringify({
          success: true,
          linkedTo: 'customer',
          actorId: customer.id,
          actorName: customer.name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Tentar vincular a um specifier
    const { data: specifier } = await supabaseAdmin
      .from('specifiers')
      .select('id, name')
      .eq('doc', cleanDoc)
      .maybeSingle()

    if (specifier) {
      // Atualizar o specifier com o user_id
      const { error: updateErr } = await supabaseAdmin
        .from('specifiers')
        .update({ user_id: targetUserId })
        .eq('id', specifier.id)

      if (updateErr) throw updateErr

      // Criar role de specifier
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: targetUserId, role: 'specifier' }, { onConflict: 'user_id,role' })

      console.log(`✅ Usuário ${targetUserId} vinculado ao specifier ${specifier.id} (${specifier.name})`)

      return new Response(
        JSON.stringify({
          success: true,
          linkedTo: 'specifier',
          actorId: specifier.id,
          actorName: specifier.name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Se não encontrou nem customer nem specifier
    return new Response(
      JSON.stringify({ error: 'Nenhum customer ou specifier encontrado com este CPF/CNPJ' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('❌ Erro ao vincular usuário:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
