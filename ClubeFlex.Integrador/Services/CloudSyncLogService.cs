using System.Text;
using System.Text.Json;
using ClubeFlex.Integrador.Models;
using Microsoft.Extensions.Configuration;
using Serilog;

namespace ClubeFlex.Integrador.Services;

public class CloudSyncLogService
{
    private readonly HttpClient _httpClient;
    private readonly string _functionsUrl;
    private readonly string _apiUrl;
    private readonly string _apiKey;

    public CloudSyncLogService(IConfiguration configuration)
    {
        _httpClient = new HttpClient();
        
        var apiConfig = configuration.GetSection("ClubeFlexApi");
        var baseUrl = apiConfig["BaseUrl"] ?? throw new Exception("BaseUrl não configurado");
        _apiKey = apiConfig["ApiKey"] ?? throw new Exception("ApiKey não configurado");
        
        // Separar URLs para Edge Functions e PostgREST
        var cleanBaseUrl = baseUrl.Replace("/rest/v1", "").Replace("/functions/v1", "");
        _functionsUrl = $"{cleanBaseUrl}/functions/v1";
        _apiUrl = $"{cleanBaseUrl}/rest/v1";
        
        Log.Debug($"🔧 CloudSyncLogService configurado:");
        Log.Debug($"   Functions URL: {_functionsUrl}");
        Log.Debug($"   API URL: {_apiUrl}");
        
        _httpClient.DefaultRequestHeaders.Add("apikey", _apiKey);
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");
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

            var response = await _httpClient.PostAsync($"{_functionsUrl}/sync-log", content);

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

    public async Task<HashSet<string>> GetSuccessfulEventIdsAsync(string eventType)
    {
        var eventIds = new HashSet<string>();
        
        try
        {
            var url = $"{_apiUrl}/sync_logs?event_type=eq.{eventType}&status=eq.success&select=event_id";
            
            Log.Debug($"🔍 Consultando sync_logs: {url}");
            
            var response = await _httpClient.GetAsync(url);
            
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                Log.Debug($"📥 Response JSON: {json.Substring(0, Math.Min(200, json.Length))}...");
                
                var logs = JsonSerializer.Deserialize<List<SyncLogResponse>>(json);
                
                foreach (var log in logs ?? Enumerable.Empty<SyncLogResponse>())
                {
                    if (!string.IsNullOrEmpty(log.EventId))
                        eventIds.Add(log.EventId);
                }
                
                Log.Information($"✅ {eventIds.Count} event_ids já sincronizados ({eventType})");
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Log.Warning($"❌ Erro ao consultar sync_logs: {response.StatusCode} - {errorContent}");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, $"⚠️ Não foi possível consultar logs sincronizados ({eventType}). Continuando sem filtro.");
        }
        
        return eventIds;
    }
}