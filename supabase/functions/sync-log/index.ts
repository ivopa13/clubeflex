import { createClient } from 'npm:@supabase/supabase-js@2';

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: SyncLogPayload = await req.json();
    console.log('Sync log:', body.event_id, body.event_type, body.status);

    if (!body.event_id || !body.event_type || !body.status) {
      return new Response(
        JSON.stringify({ error: 'event_id, event_type e status são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('sync_logs')
      .upsert({
        event_id: body.event_id,
        event_type: body.event_type,
        status: body.status,
        payload: body.payload || null,
        error_message: body.error_message || null,
        attempts: body.attempts || 0,
        execution_id: body.execution_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id,event_type' })
      .select()
      .single();

    if (error) {
      console.error('Erro:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
