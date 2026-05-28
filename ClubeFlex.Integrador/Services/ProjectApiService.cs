using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

/// <summary>
/// Serviço de API genérico para comunicação com projetos Lovable/Supabase
/// Substitui o ClubeFlexApiService para suportar múltiplos projetos
/// </summary>
public class ProjectApiService
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _projectName;

    public ProjectApiService(ProjectConfig config)
    {
        _projectName = config.Name;
        _baseUrl = config.BaseUrl;
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Add("apikey", config.ApiKey);
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey);
    }

    public string ProjectName => _projectName;

    /// <summary>
    /// Envia fatura criada para o projeto
    /// </summary>
    public async Task<ApiResponse> SendInvoiceCreatedAsync(FaturaCriadaPayload payload)
    {
        return await PostAsync("/fatura-criada", payload, $"fatura {payload.InvoiceIdExt}");
    }

    /// <summary>
    /// Envia pagamento confirmado para o projeto
    /// </summary>
    public async Task<ApiResponse> SendPaymentConfirmedAsync(PagamentoPayload payload)
    {
        var result = await PostAsync("/pagamento-confirmado", payload, $"pagamento da fatura {payload.InvoiceIdExt}");
        
        // Verificar se foi "ignorado" por fatura não encontrada
        if (result.Success && result.Message?.Contains("warning") == true)
        {
            Log.Warning($"⚠️ [{_projectName}] Pagamento da fatura {payload.InvoiceIdExt} ignorado: fatura não encontrada");
            return new ApiResponse 
            { 
                Success = false, 
                IsValidationError = true,
                ErrorMessage = $"Fatura não encontrada: {payload.InvoiceIdExt}. Sincronize a fatura primeiro."
            };
        }
        
        return result;
    }

    /// <summary>
    /// Envia título a receber para o projeto (Sistema de Cobranças).
    /// Sempre posta em /titulo-criado. Cancelamentos devem usar SendReceivableCancelledAsync.
    /// </summary>
    public async Task<ApiResponse> SendReceivableAsync(TituloPayload payload)
    {
        return await PostAsync("/titulo-criado", payload, $"título {payload.ReceivableIdExt}");
    }

    /// <summary>
    /// Envia cancelamento de título para /titulo-cancelado com o payload canônico
    /// (event_id, source, receivable_id_ext, cancelled_at, reason).
    /// Aplica a política: HTTP 200 com success:false NÃO é retentado.
    /// </summary>
    public async Task<ApiResponse> SendReceivableCancelledAsync(TituloCanceladoPayload payload)
    {
        var result = await PostAsync("/titulo-cancelado", payload, $"cancelamento do título {payload.ReceivableIdExt}");

        // /titulo-cancelado responde 200 com {success:false} quando o título nunca foi sincronizado.
        // Tratar como erro permanente para não retentar.
        if (result.Success && !string.IsNullOrEmpty(result.Message) && result.Message.Contains("\"success\":false"))
        {
            Log.Warning($"⚠️ [{_projectName}] /titulo-cancelado retornou 200 com success:false para {payload.ReceivableIdExt}: {result.Message}");
            return new ApiResponse
            {
                Success = false,
                IsValidationError = true,
                ErrorMessage = result.Message
            };
        }

        return result;
    }

    /// <summary>
    /// Envia pagamento de título para o projeto (Sistema de Cobranças)
    /// </summary>
    public async Task<ApiResponse> SendReceivablePaymentAsync(TituloPagamentoPayload payload)
    {
        return await PostAsync("/titulo-pago", payload, $"pagamento do título {payload.ReceivableIdExt}");
    }

    /// <summary>
    /// Envia cliente para o projeto
    /// </summary>
    public async Task<ApiResponse> SendCustomerAsync(ClientePayload payload)
    {
        return await PostAsync("/cliente-sync", payload, $"cliente {payload.CustomerIdExt}");
    }

    /// <summary>
    /// Atualiza tipos de movimento das faturas em batch
    /// </summary>
    public async Task<ApiResponse> UpdateInvoiceTypesAsync(List<(string InvoiceIdExt, string MovementType)> invoiceTypes)
    {
        var updates = invoiceTypes.Select(i => new 
        { 
            invoice_id_ext = i.InvoiceIdExt, 
            movement_type = i.MovementType 
        }).ToList();
        
        var payload = new { updates };
        return await PostAsync("/update-invoice-types", payload, $"{invoiceTypes.Count} atualizações de tipo");
    }

    /// <summary>
    /// Testa conectividade com a API do projeto
    /// </summary>
    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync(_baseUrl.Replace("/functions/v1", ""));
            Log.Information($"✓ [{_projectName}] Conectividade com API OK");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"✗ [{_projectName}] Falha ao conectar com API");
            return false;
        }
    }

    /// <summary>
    /// Método genérico para POST com tratamento de erros e log detalhado por evento
    /// </summary>
    private async Task<ApiResponse> PostAsync<T>(string endpoint, T payload, string description)
    {
        var url = $"{_baseUrl}{endpoint}";
        var json = JsonConvert.SerializeObject(payload, Formatting.None);

        // Identificar receivable_id_ext quando possível para log
        string? receivableId = null;
        try
        {
            dynamic? dyn = payload;
            receivableId = dyn?.ReceivableIdExt as string;
        }
        catch { }

        try
        {
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            Log.Information($"[{_projectName}] → POST {endpoint} | {description}");

            var response = await _httpClient.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();
            var statusCode = (int)response.StatusCode;

            // Log auditável: CODCR, endpoint, status HTTP, response body (truncado)
            var bodyPreview = responseBody.Length > 500 ? responseBody.Substring(0, 500) + "…" : responseBody;
            var auditLine = $"[AUDIT] project={_projectName} endpoint={endpoint} codcr={receivableId ?? "-"} http={statusCode} body={bodyPreview}";

            if (response.IsSuccessStatusCode)
            {
                Log.Information($"✓ [{_projectName}] {description} OK (HTTP {statusCode})");
                Log.Information(auditLine);
                return new ApiResponse { Success = true, Message = responseBody };
            }
            else
            {
                Log.Error($"✗ [{_projectName}] Erro ao enviar {description}: {statusCode} - {responseBody}");
                Log.Warning(auditLine);

                var isClientError = statusCode >= 400 && statusCode < 500;
                var isValidationError = isClientError;
                string? errorMessage = responseBody;

                try
                {
                    var errorResponse = JsonConvert.DeserializeObject<dynamic>(responseBody);
                    if (errorResponse?.validation_error == true)
                    {
                        isValidationError = true;
                        errorMessage = errorResponse?.error?.ToString() ?? responseBody;
                    }
                }
                catch { }

                if (isClientError)
                {
                    Log.Warning($"[{_projectName}] ⚠️ Erro {statusCode} (cliente) para {description} - não será retentado");
                }

                return new ApiResponse
                {
                    Success = false,
                    IsValidationError = isValidationError,
                    ErrorMessage = errorMessage
                };
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{_projectName}] Exceção ao enviar {description}");
            Log.Warning($"[AUDIT] project={_projectName} endpoint={endpoint} codcr={receivableId ?? "-"} http=EX body={ex.Message}");
            return new ApiResponse
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }
}
