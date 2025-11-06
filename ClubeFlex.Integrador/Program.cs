using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Services;

namespace ClubeFlex.Integrador;

class Program
{
    static async Task<int> Main(string[] args)
    {
        // Configurar Serilog
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.Console()
            .WriteTo.File("logs/sync-.txt", rollingInterval: RollingInterval.Day)
            .CreateLogger();

        try
        {
            Log.Information("=== Clube Flex Integrador Iniciado ===");

            // Carregar configurações
            var configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .Build();

            // Validar configurações obrigatórias
            var connectionString = configuration.GetConnectionString("LocalDatabase");
            var apiBaseUrl = configuration["ClubeFlexApi:BaseUrl"];
            var apiKey = configuration["ClubeFlexApi:ApiKey"];

            if (string.IsNullOrEmpty(connectionString))
            {
                Log.Fatal("Connection string 'LocalDatabase' não configurada no appsettings.json");
                return 1;
            }

            if (string.IsNullOrEmpty(apiBaseUrl) || string.IsNullOrEmpty(apiKey))
            {
                Log.Fatal("Configurações da API do Clube Flex não encontradas no appsettings.json");
                return 1;
            }

            // Inicializar serviços
            var databaseService = new DatabaseService(connectionString);
            var apiService = new ClubeFlexApiService(apiBaseUrl, apiKey);
            var cloudSyncLogService = new CloudSyncLogService(configuration);
            var syncService = new SyncService(databaseService, apiService, cloudSyncLogService, configuration);

            // Executar sincronização
            Log.Information("Iniciando sincronização...");
            await syncService.ExecuteSyncAsync();
            Log.Information("Sincronização concluída com sucesso");

            return 0;
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Erro fatal durante execução");
            return 1;
        }
        finally
        {
            Log.Information("=== Clube Flex Integrador Finalizado ===");
            Log.CloseAndFlush();
        }
    }
}
