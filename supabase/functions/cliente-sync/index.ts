import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ClienteSyncPayload {
  event_id: string;
  source: string;
  customer_id_ext: string;
  name: string;
  cpf?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  checksum: string;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  created_at_ext?: string | null;
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

    const body: ClienteSyncPayload = await req.json();
    console.log('cliente-sync recebido:', body.event_id, body.customer_id_ext);

    if (!body.event_id || !body.customer_id_ext || !body.name) {
      return new Response(
        JSON.stringify({ error: 'event_id, customer_id_ext e name são obrigatórios', validation_error: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar doc: CPF ou CNPJ (o que não for nulo/vazio)
    const cpfClean = body.cpf?.replace(/[^0-9]/g, '') || '';
    const cnpjClean = body.cnpj?.replace(/[^0-9]/g, '') || '';
    const doc = cpfClean || cnpjClean || '';

    // UPSERT por customer_id_ext
    const { data, error } = await supabase
      .from('customers')
      .upsert({
        customer_id_ext: body.customer_id_ext,
        name: body.name,
        doc,
        email: body.email || null,
        phone: body.phone || null,
        status: body.status || 'active',
        address_street: body.street || null,
        address_number: body.number || null,
        address_complement: body.complement || null,
        address_neighborhood: body.neighborhood || null,
        address_city: body.city || null,
        address_state: body.state || null,
        address_zip: body.zip_code || null,
        created_at_ext: body.created_at_ext || null,
      }, { onConflict: 'customer_id_ext' })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao upsert customer:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Registrar no sync_logs
    await supabase
      .from('sync_logs')
      .upsert({
        event_id: body.event_id,
        event_type: 'cliente',
        status: 'success',
        payload: body,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id,event_type' });

    console.log('Cliente sincronizado:', data.id);
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
