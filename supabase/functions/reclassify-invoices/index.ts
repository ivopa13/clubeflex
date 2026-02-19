import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json() as { mode: "preview" | "execute"; invoice_ids?: string[] };
    const { mode, invoice_ids } = body;

    if (mode === "preview") {
      // Busca faturas com movement_type = 'produto' mas cujo invoice_id_ext
      // termina com padrões conhecidos de código 064 (serviço).
      // Como não temos o código original no banco, listamos TODAS as faturas
      // com movement_type = 'produto' para o admin revisar e selecionar quais
      // devem ser reclassificadas para 'servico'.
      const { data, error, count } = await supabase
        .from("invoices")
        .select("id, invoice_id_ext, total_amount, movement_type, status, created_at", { count: "exact" })
        .eq("movement_type", "produto")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, invoices: data, total: count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "execute") {
      if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "invoice_ids array required for execute mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atualiza em lote as faturas selecionadas para movement_type = 'servico'
      const { error, count } = await supabase
        .from("invoices")
        .update({ movement_type: "servico" })
        .in("id", invoice_ids);

      if (error) throw error;

      console.log(`Reclassified ${count} invoices to 'servico'`);

      return new Response(
        JSON.stringify({ success: true, updated: invoice_ids.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid mode. Use 'preview' or 'execute'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
