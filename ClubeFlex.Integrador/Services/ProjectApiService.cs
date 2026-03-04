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
    /// Envia título a receber para o projeto (Sistema de Cobranças)
    /// </summary>
    public async Task<ApiResponse> SendReceivableAsync(TituloPayload payload)
    {
        return await PostAsync("/titulo-criado", payload, $"título {payload.ReceivableIdExt}");
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
    /// Método genérico para POST com tratamento de erros
    /// </summary>
    private async Task<ApiResponse> PostAsync<T>(string endpoint, T payload, string description)
    {
        try
        {
            var url = $"{_baseUrl}{endpoint}";
            var json = JsonConvert.SerializeObject(payload, Formatting.None);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            Log.Information($"[{_projectName}] Enviando {description}...");

            var response = await _httpClient.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                Log.Information($"✓ [{_projectName}] {description} enviado com sucesso");
                return new ApiResponse { Success = true, Message = responseBody };
            }
            else
            {
                Log.Error($"✗ [{_projectName}] Erro ao enviar {description}: {response.StatusCode} - {responseBody}");
                
                // Erros 4xx são problemas nos dados - nunca devem ser retentados
                var statusCode = (int)response.StatusCode;
                var isClientError = statusCode >= 400 && statusCode < 500;
                
                // Verificar se é erro de validação explícito no body
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
            return new ApiResponse 
            { 
                Success = false, 
                ErrorMessage = ex.Message 
            };
        }
    }
}
