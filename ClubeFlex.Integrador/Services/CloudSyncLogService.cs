using System.Text;
using System.Text.Json;
using ClubeFlex.Integrador.Models;
using Microsoft.Extensions.Configuration;
using Serilog;

namespace ClubeFlex.Integrador.Services;

public class CloudSyncLogService
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _apiKey;

    public CloudSyncLogService(IConfiguration configuration)
    {
        _httpClient = new HttpClient();
        
        var apiConfig = configuration.GetSection("ClubeFlexApi");
        _baseUrl = apiConfig["BaseUrl"] ?? throw new Exception("BaseUrl não configurado");
        _apiKey = apiConfig["ApiKey"] ?? throw new Exception("ApiKey não configurado");
        
        _httpClient.DefaultRequestHeaders.Add("apikey", _apiKey);
    }

    public async Task SaveSyncLogAsync(SyncLog log)
    {
        try
        {
            // Mapeia event_type para o formato aceito pela tabela sync_logs (check constraint)
            var mappedEventType = log.EventType switch
            {
                "fatura-criada" or "invoice_created" or "fatura" => "fatura",
                "pagamento-confirmado" or "payment_confirmed" or "pagamento" => "pagamento",
                _ => log.EventType
            };
            var cleanEventId = log.EventId?.Trim() ?? string.Empty;

            var payload = new
            {
                event_id = cleanEventId,
                event_type = mappedEventType,
                status = log.Status,
                payload = log.Payload != null ? JsonSerializer.Deserialize<object>(log.Payload) : null,
                error_message = log.ErrorMessage,
                attempts = log.Attempts
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_baseUrl}/sync-log", content);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Log.Error($"Erro ao salvar log na nuvem: {response.StatusCode} - {errorContent}");
            }
            else
            {
                Log.Debug($"Log salvo na nuvem: {log.EventId} ({log.EventType})");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao enviar log para nuvem");
        }
    }
}
