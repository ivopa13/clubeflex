import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ValidationErrorPayload {
  id: string;
  event_id: string;
  event_type: string;
  error_type: string;
  entity_type: string;
  received_data: {
    Codigo?: string;
    Nome?: string;
    RazaoSocial?: string;
    CPFCNPJ?: string;
    [key: string]: unknown;
  };
  error_details: string;
  status: string;
  created_at: string;
}

function formatErrorType(errorType: string): string {
  switch (errorType) {
    case "invalid_cpf_cnpj":
      return "CPF/CNPJ Inválido";
    case "empty_name":
      return "Nome Vazio";
    default:
      return errorType;
  }
}

function formatEntityType(entityType: string): string {
  return entityType === "customer" ? "Cliente" : "Especificador";
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function getEntityName(data: ValidationErrorPayload): string {
  const receivedData = data.received_data || {};
  return receivedData.Nome || receivedData.RazaoSocial || "Nome não informado";
}

function getEntityCode(data: ValidationErrorPayload): string {
  const receivedData = data.received_data || {};
  return receivedData.Codigo || "N/A";
}

function buildEmailHtml(data: ValidationErrorPayload): string {
  const entityName = getEntityName(data);
  const entityCode = getEntityCode(data);
  const entityType = formatEntityType(data.entity_type);
  const errorType = formatErrorType(data.error_type);
  const errorDetails = data.error_details;
  const createdAt = formatDate(data.created_at);
  const panelUrl = "https://clubeflex.lovable.app/admin/erros-validacao";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta de Erro de Validação</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ff914d 0%, #18375d 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                FLEX Clube
              </h1>
            </td>
          </tr>

          <!-- Alert Banner -->
          <tr>
            <td style="background-color: #fef3cd; padding: 20px; text-align: center; border-bottom: 3px solid #ff914d;">
              <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
              <h2 style="margin: 0; color: #856404; font-size: 20px; font-weight: 600;">
                Alerta de Erro de Validação
              </h2>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 14px;">
                Um novo erro foi detectado durante a sincronização de dados.
              </p>
            </td>
          </tr>

          <!-- Entity Info -->
          <tr>
            <td style="padding: 25px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #18375d;">
                    <h3 style="margin: 0 0 15px 0; color: #18375d; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                      Dados do Cadastro
                    </h3>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 14px; width: 80px;">Nome:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 14px; font-weight: 600;">${entityName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 14px;">Tipo:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 14px;">${entityType}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 14px;">Código:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 14px; font-family: monospace;">${entityCode}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Error Info -->
          <tr>
            <td style="padding: 0 25px 25px 25px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545;">
                    <h3 style="margin: 0 0 15px 0; color: #dc3545; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                      Erro Identificado
                    </h3>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 14px; width: 80px;">Tipo:</td>
                        <td style="padding: 5px 0; color: #dc3545; font-size: 14px; font-weight: 600;">${errorType}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 14px; vertical-align: top;">Detalhes:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 14px;">${errorDetails}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Date Info -->
          <tr>
            <td style="padding: 0 25px 25px 25px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #f8f9fa; padding: 15px 20px; border-radius: 8px; text-align: center;">
                    <span style="color: #666; font-size: 13px;">Data do Registro: </span>
                    <span style="color: #333; font-size: 13px; font-weight: 600;">${createdAt}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 25px 30px 25px; text-align: center;">
              <a href="${panelUrl}" style="display: inline-block; background: linear-gradient(135deg, #ff914d 0%, #e07a3a 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(255, 145, 77, 0.3);">
                Acessar Painel de Erros
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #18375d; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #ffffff; font-size: 12px; opacity: 0.8;">
                Este é um email automático do sistema FLEX Clube.<br>
                Por favor, não responda a este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: ValidationErrorPayload = await req.json();
    
    console.log("Received validation error payload:", JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.id || !payload.error_type || !payload.entity_type) {
      console.error("Missing required fields in payload");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const entityName = getEntityName(payload);
    const emailSubject = `[FLEX Clube] Erro de Validação - ${entityName}`;
    const emailHtml = buildEmailHtml(payload);

    console.log(`Sending notification email for error: ${payload.id}`);
    console.log(`Entity: ${entityName}, Error Type: ${payload.error_type}`);

    const emailResponse = await resend.emails.send({
      from: "FLEX Clube <noreply@flexrep.com.br>",
      to: ["financeiro@flexrep.com.br"],
      cc: ["contato@patrezi.com.br"],
      subject: emailSubject,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification email sent",
        emailResponse 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-validation-errors function:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
