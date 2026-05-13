import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NewCustomerPayload {
  id: string;
  customer_id_ext: string;
  name: string;
  doc?: string | null;
  email?: string | null;
  phone?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  status?: string | null;
  created_at: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:5px 0;color:#666;font-size:14px;width:120px;">${label}:</td>
    <td style="padding:5px 0;color:#333;font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

function buildEmailHtml(c: NewCustomerPayload): string {
  const panelUrl = "https://clubeflex.lovable.app/admin/gerenciar-cadastros";
  const location = [c.address_city, c.address_state].filter(Boolean).join(" / ");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background-color:#f4f4f4;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 0;">
      <table role="presentation" style="width:600px;max-width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1);">
        <tr><td style="background:linear-gradient(135deg,#ff914d 0%,#18375d 100%);padding:30px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">FLEX Clube</h1>
        </td></tr>
        <tr><td style="background:#e8f4fd;padding:20px;text-align:center;border-bottom:3px solid #18375d;">
          <div style="font-size:32px;margin-bottom:10px;">👤</div>
          <h2 style="margin:0;color:#18375d;font-size:20px;font-weight:600;">Novo Cliente Cadastrado</h2>
          <p style="margin:10px 0 0;color:#18375d;font-size:14px;">Um novo cliente acaba de entrar na base.</p>
        </td></tr>
        <tr><td style="padding:25px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td style="background:#f8f9fa;padding:20px;border-radius:8px;border-left:4px solid #ff914d;">
              <h3 style="margin:0 0 15px;color:#18375d;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Dados do Cliente</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                ${row("Nome", c.name)}
                ${row("Código ERP", c.customer_id_ext)}
                ${row("CPF/CNPJ", c.doc)}
                ${row("E-mail", c.email)}
                ${row("Telefone", c.phone)}
                ${row("Local", location)}
                ${row("Status", c.status)}
                ${row("Cadastrado em", formatDate(c.created_at))}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 25px 30px;text-align:center;">
          <a href="${panelUrl}" style="display:inline-block;background:linear-gradient(135deg,#ff914d 0%,#e07a3a 100%);color:#fff;text-decoration:none;padding:15px 40px;border-radius:8px;font-size:16px;font-weight:600;box-shadow:0 4px 6px rgba(255,145,77,.3);">Ver no Painel</a>
        </td></tr>
        <tr><td style="background:#18375d;padding:20px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:12px;opacity:.8;">Email automático do sistema FLEX Clube. Não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NewCustomerPayload = await req.json();
    console.log("New customer notification:", payload.id, payload.name);

    if (!payload.id || !payload.name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailResponse = await resend.emails.send({
      from: "FLEX Clube <noreply@flexrep.com.br>",
      to: ["financeiro@flexrep.com.br"],
      subject: `[FLEX Clube] Novo cliente cadastrado - ${payload.name}`,
      html: buildEmailHtml(payload),
    });

    console.log("Email sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("notify-new-customer error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
