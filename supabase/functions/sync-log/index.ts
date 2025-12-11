import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncLogPayload {
  event_id: string;
  event_type: 'fatura' | 'pagamento';
  status: 'pending' | 'success' | 'error';
  payload?: any;
  error_message?: string;
  attempts?: number;
  execution_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: SyncLogPayload = await req.json();

    console.log('Recebendo log de sincronização:', {
      event_id: body.event_id,
      event_type: body.event_type,
      status: body.status,
    });

    // Validar dados obrigatórios
    if (!body.event_id || !body.event_type || !body.status) {
      return new Response(
        JSON.stringify({ error: 'event_id, event_type e status são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inserir ou atualizar log
    const { data, error } = await supabase
      .from('sync_logs')
      .upsert(
        {
          event_id: body.event_id,
          event_type: body.event_type,
          status: body.status,
          payload: body.payload || null,
          error_message: body.error_message || null,
          attempts: body.attempts || 0,
          execution_id: body.execution_id || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'event_id,event_type',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar log:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Log salvo com sucesso:', data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro não tratado:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
