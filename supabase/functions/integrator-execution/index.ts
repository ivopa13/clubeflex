import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    console.log('Recebendo requisição:', JSON.stringify(body));

    if (!body.execution_id || !body.action) {
      return new Response(
        JSON.stringify({ error: 'execution_id e action são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'start') {
      const { data, error } = await supabase
        .from('integrator_executions')
        .insert({
          execution_id: body.execution_id,
          started_at: new Date().toISOString(),
          status: 'running',
          project_name: body.project_name || 'ClubeFlex',
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar execução:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Execução iniciada:', data.id);
      return new Response(
        JSON.stringify({ success: true, id: data.id, execution_id: body.execution_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } 
    
    if (body.action === 'finish') {
      let finalStatus = body.status;
      if (finalStatus === 'completed' && (body.error_count ?? 0) > 0) {
        finalStatus = 'completed_with_errors';
      }

      const { data, error } = await supabase
        .from('integrator_executions')
        .update({
          finished_at: new Date().toISOString(),
          status: finalStatus,
          total_events: body.total_events ?? 0,
          success_count: body.success_count ?? 0,
          error_count: body.error_count ?? 0,
          invoice_count: body.invoice_count ?? 0,
          payment_count: body.payment_count ?? 0,
        })
        .eq('execution_id', body.execution_id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao finalizar execução:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Execução finalizada:', data.id, 'status:', finalStatus);
      return new Response(
        JSON.stringify({ success: true, id: data.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'action inválida. Use "start" ou "finish"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
