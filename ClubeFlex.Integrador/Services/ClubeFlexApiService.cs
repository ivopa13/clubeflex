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
    public async Task<bool> SendInvoiceCreatedAsync(FaturaCriadaPayload payload)
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
                return true;
            }
            else
            {
                Log.Error($"✗ Erro ao enviar fatura {payload.InvoiceIdExt}: {response.StatusCode} - {responseBody}");
                return false;
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"Exceção ao enviar fatura {payload.InvoiceIdExt}");
            return false;
        }
    }

    /// <summary>
    /// Envia pagamento confirmado para o Clube Flex
    /// </summary>
    public async Task<bool> SendPaymentConfirmedAsync(PagamentoPayload payload)
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
                Log.Information($"✓ Pagamento da fatura {payload.InvoiceIdExt} enviado com sucesso");
                return true;
            }
            else
            {
                Log.Error($"✗ Erro ao enviar pagamento da fatura {payload.InvoiceIdExt}: {response.StatusCode} - {responseBody}");
                return false;
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"Exceção ao enviar pagamento da fatura {payload.InvoiceIdExt}");
            return false;
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
