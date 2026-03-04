using Newtonsoft.Json;

namespace ClubeFlex.Integrador.Models;

/// <summary>
/// Configuração de um projeto destino para sincronização
/// Permite enviar dados para múltiplos projetos Lovable simultaneamente
/// </summary>
public class ProjectConfig
{
    /// <summary>
    /// Nome identificador do projeto (ex: "ClubeFlex", "SistemaCobrancas")
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// URL base das Edge Functions do projeto Supabase
    /// Ex: "https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1"
    /// </summary>
    public string BaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Chave de API (anon key) do projeto Supabase
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Se verdadeiro, sincroniza faturas (MOVENDA) para este projeto
    /// </summary>
    public bool SyncInvoices { get; set; } = false;

    /// <summary>
    /// Se verdadeiro, sincroniza pagamentos (CONTARECEBERREC, MOVENDAREC, CHEQUES) para este projeto
    /// </summary>
    public bool SyncPayments { get; set; } = false;

    /// <summary>
    /// Se verdadeiro, sincroniza títulos a receber (CONTARECEBER) para este projeto
    /// </summary>
    public bool SyncReceivables { get; set; } = false;

    /// <summary>
    /// Se verdadeiro, sincroniza a base de clientes (CLIENTE) para este projeto
    /// </summary>
    public bool SyncCustomers { get; set; } = false;

    /// <summary>
    /// Se verdadeiro, ignora o filtro de data ao buscar títulos a receber.
    /// Necessário para régua de cobrança que precisa considerar dívidas antigas (vencidas).
    /// Default: true quando SyncReceivables = true
    /// </summary>
    public bool SyncReceivablesIgnoreDate { get; set; } = true;

    /// <summary>
    /// Data de corte para sincronização completa de títulos.
    /// Títulos com vencimento ANTES desta data: sincroniza apenas os em aberto (não pagos, não cancelados).
    /// Títulos com vencimento A PARTIR desta data: sincroniza todos (abertos, pagos, cancelados).
    /// Pagamentos de títulos: sincroniza apenas os com data a partir desta data.
    /// Se null, sincroniza tudo sem filtro de status.
    /// Formato: "yyyy-MM-dd"
    /// </summary>
    public string? SyncReceivablesFullFromDate { get; set; }

    /// <summary>
    /// Valida se a configuração do projeto está completa
    /// </summary>
    public bool IsValid()
    {
        return !string.IsNullOrEmpty(Name) 
            && !string.IsNullOrEmpty(BaseUrl) 
            && !string.IsNullOrEmpty(ApiKey)
            && (SyncInvoices || SyncPayments || SyncReceivables || SyncCustomers);
    }

    /// <summary>
    /// Retorna descrição do que este projeto sincroniza
    /// </summary>
    public string GetSyncDescription()
    {
        var syncs = new List<string>();
        if (SyncInvoices) syncs.Add("faturas");
        if (SyncPayments) syncs.Add("pagamentos");
        if (SyncReceivables) syncs.Add("títulos a receber");
        if (SyncCustomers) syncs.Add("clientes");
        return syncs.Count > 0 ? string.Join(", ", syncs) : "nada";
    }
}
