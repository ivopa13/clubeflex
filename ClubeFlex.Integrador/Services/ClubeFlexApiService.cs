using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

public class ClubeFlexApiService
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;

    public ClubeFlexApiService(string baseUrl, string apiKey)
    {
        _baseUrl = baseUrl;
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Add("apikey", apiKey);
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
    }

    /// <summary>
    /// Envia fatura criada para o Clube Flex
    /// </summary>
    public async Task<ApiResponse> SendInvoiceCreatedAsync(FaturaCriadaPayload payload)
    {
        try
        {
            var url = $"{_baseUrl}/fatura-criada";
            var json = JsonConvert.SerializeObject(payload, Formatting.None);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            Log.Information($"Enviando fatura {payload.InvoiceIdExt} para Clube Flex...");

            var response = await _httpClient.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                Log.Information($"✓ Fatura {payload.InvoiceIdExt} enviada com sucesso");
                return new ApiResponse { Success = true };
            }
            else
            {
                Log.Error($"✗ Erro ao enviar fatura {payload.InvoiceIdExt}: {response.StatusCode} - {responseBody}");
                
                // Verificar se é erro de validação
                var isValidationError = false;
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
                catch
                {
                    // Se não conseguir parsear, assume que não é erro de validação
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
            Log.Error(ex, $"Exceção ao enviar fatura {payload.InvoiceIdExt}");
            return new ApiResponse 
            { 
                Success = false, 
                ErrorMessage = ex.Message 
            };
        }
    }

    /// <summary>
    /// Envia pagamento confirmado para o Clube Flex
    /// </summary>
    public async Task<ApiResponse> SendPaymentConfirmedAsync(PagamentoPayload payload)
    {
        try
        {
            var url = $"{_baseUrl}/pagamento-confirmado";
            var json = JsonConvert.SerializeObject(payload, Formatting.None);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            Log.Information($"Enviando pagamento da fatura {payload.InvoiceIdExt} para Clube Flex...");

            var response = await _httpClient.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                // Verificar se foi "ignorado" por fatura não encontrada
                try
                {
                    var successResponse = JsonConvert.DeserializeObject<dynamic>(responseBody);
                    if (successResponse?.warning != null)
                    {
                        var warning = successResponse.warning.ToString();
                        Log.Warning($"⚠️ Pagamento da fatura {payload.InvoiceIdExt} ignorado: {warning}");
                        return new ApiResponse 
                        { 
                            Success = false, 
                            IsValidationError = true,
                            ErrorMessage = $"Fatura não encontrada: {payload.InvoiceIdExt}. Sincronize a fatura primeiro."
                        };
                    }
                }
                catch
                {
                    // Se não conseguir parsear, assume que foi sucesso normal
                }
                
                Log.Information($"✓ Pagamento da fatura {payload.InvoiceIdExt} enviado com sucesso");
                return new ApiResponse { Success = true };
            }
            else
            {
                Log.Error($"✗ Erro ao enviar pagamento da fatura {payload.InvoiceIdExt}: {response.StatusCode} - {responseBody}");
                
                // Verificar se é erro de validação
                var isValidationError = false;
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
                catch
                {
                    // Se não conseguir parsear, assume que não é erro de validação
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
            Log.Error(ex, $"Exceção ao enviar pagamento da fatura {payload.InvoiceIdExt}");
            return new ApiResponse 
            { 
                Success = false, 
                ErrorMessage = ex.Message 
            };
        }
    }

    /// <summary>
    /// Atualiza tipos de movimento das faturas em batch
    /// </summary>
    public async Task<ApiResponse> UpdateInvoiceTypesAsync(List<(string InvoiceIdExt, string MovementType)> invoiceTypes)
    {
        try
        {
            var url = $"{_baseUrl}/update-invoice-types";
            
            var updates = invoiceTypes.Select(i => new 
            { 
                invoice_id_ext = i.InvoiceIdExt, 
                movement_type = i.MovementType 
            }).ToList();
            
            var payload = new { updates };
            var json = JsonConvert.SerializeObject(payload, Formatting.None);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            Log.Information($"Enviando {invoiceTypes.Count} atualizações de tipo de movimento...");

            var response = await _httpClient.PostAsync(url, content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonConvert.DeserializeObject<dynamic>(responseBody);
                var successCount = result?.successCount ?? 0;
                var errorCount = result?.errorCount ?? 0;
                
                Log.Information($"✓ Atualização concluída: {successCount} sucesso, {errorCount} erros");
                return new ApiResponse 
                { 
                    Success = true, 
                    Message = $"{successCount} atualizadas, {errorCount} erros"
                };
            }
            else
            {
                Log.Error($"✗ Erro ao atualizar tipos: {response.StatusCode} - {responseBody}");
                return new ApiResponse 
                { 
                    Success = false, 
                    ErrorMessage = responseBody 
                };
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Exceção ao atualizar tipos de movimento");
            return new ApiResponse 
            { 
                Success = false, 
                ErrorMessage = ex.Message 
            };
        }
    }

    /// <summary>
    /// Testa conectividade com a API do Clube Flex
    /// </summary>
    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            // Tenta fazer uma requisição simples para verificar conectividade
            var response = await _httpClient.GetAsync(_baseUrl.Replace("/functions/v1", ""));
            Log.Information("✓ Conectividade com API do Clube Flex OK");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "✗ Falha ao conectar com API do Clube Flex");
            return false;
        }
    }
}
