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

    // Listar usuários do auth
    const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers()
    if (listErr) {
      throw listErr
    }

    // Buscar roles
    const { data: allRoles } = await supabaseAdmin.from('user_roles').select('user_id, role')

    // Buscar perfis para refletir edições feitas em /admin/usuarios
    const userIds = (listed?.users || []).map((u) => u.id)
    let profilesById: Record<string, { full_name: string | null; email: string | null; doc: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, doc')
        .in('id', userIds)
      profilesById = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email, doc: p.doc }])
      )
    }

    const users = (listed?.users || []).map((u) => {
      const role = allRoles?.find((r) => r.user_id === u.id)?.role ?? null
      const profile = profilesById[u.id]
      return {
        id: u.id,
        email: profile?.email ?? u.email,
        full_name: profile?.full_name ?? u.user_metadata?.full_name ?? null,
        doc: profile?.doc ?? null,
        role,
        created_at: u.created_at,
      }
    })

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
