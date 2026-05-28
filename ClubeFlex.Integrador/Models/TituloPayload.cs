using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace ClubeFlex.Integrador.Models;

/// <summary>
/// Payload para sincronização de títulos a receber (CONTARECEBER)
/// Usado pelo sistema de cobranças
/// </summary>
public class TituloPayload
{
    [JsonProperty("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "erp_windows";

    /// <summary>
    /// ID único do título no ERP (CODCR)
    /// </summary>
    [JsonProperty("receivable_id_ext")]
    public string ReceivableIdExt { get; set; } = string.Empty;

    /// <summary>
    /// ID da venda que gerou o título (CODMOVENDA)
    /// </summary>
    [JsonProperty("invoice_id_ext")]
    public string? InvoiceIdExt { get; set; }

    /// <summary>
    /// Valor do título
    /// </summary>
    [JsonProperty("amount")]
    public decimal Amount { get; set; }

    /// <summary>
    /// Valor já pago (para títulos parcialmente pagos)
    /// </summary>
    [JsonProperty("paid_amount")]
    public decimal PaidAmount { get; set; }

    /// <summary>
    /// Saldo devedor (Amount - PaidAmount)
    /// </summary>
    [JsonProperty("balance")]
    public decimal Balance { get; set; }

    /// <summary>
    /// Data de vencimento (formato yyyy-MM-dd)
    /// </summary>
    [JsonProperty("due_date")]
    public string DueDate { get; set; } = string.Empty;

    /// <summary>
    /// Data de emissão (formato yyyy-MM-dd)
    /// </summary>
    [JsonProperty("issued_at")]
    public string IssuedAt { get; set; } = string.Empty;

    /// <summary>
    /// Número da parcela
    /// </summary>
    [JsonProperty("installment_number")]
    public int InstallmentNumber { get; set; }

    /// <summary>
    /// Total de parcelas
    /// </summary>
    [JsonProperty("total_installments")]
    public int TotalInstallments { get; set; }

    /// <summary>
    /// Situação do título: A = Aberto, P = Pago, C = Cancelado
    /// </summary>
    [JsonProperty("status")]
    public string Status { get; set; } = "A";

    /// <summary>
    /// Dias de atraso (calculado se vencido)
    /// </summary>
    [JsonProperty("days_overdue")]
    public int DaysOverdue { get; set; }

    /// <summary>
    /// Indica se o título está vencido
    /// </summary>
    [JsonProperty("is_overdue")]
    public bool IsOverdue { get; set; }

    /// <summary>
    /// Número do documento/duplicata
    /// </summary>
    [JsonProperty("document_number")]
    public string? DocumentNumber { get; set; }

    /// <summary>
    /// Descrição ou observação do título
    /// </summary>
    [JsonProperty("description")]
    public string? Description { get; set; }

    /// <summary>
    /// Dados do cliente
    /// </summary>
    [JsonProperty("customer")]
    public CustomerData Customer { get; set; } = new();

    /// <summary>
    /// ID da execução do integrador (para rastreamento)
    /// </summary>
    [JsonProperty("execution_id")]
    public string? ExecutionId { get; set; }

    /// <summary>
    /// Data de cancelamento (DATCANCEL) — não serializado.
    /// Usado apenas para roteamento interno: quando Status='C' e CancelledAt está presente,
    /// o integrador emite um evento /titulo-cancelado em vez de /titulo-criado.
    /// </summary>
    [JsonIgnore]
    public DateTime? CancelledAt { get; set; }

    /// <summary>
    /// Motivo do cancelamento (apenas uso local para gerar TituloCanceladoPayload).
    /// </summary>
    [JsonIgnore]
    public string? CancelReason { get; set; }

    /// <summary>
    /// CPF do cliente (não serializado em /titulo-criado — vai em customer.cpf).
    /// Mantido aqui para uso por filtros locais (HasValidDoc).
    /// </summary>
    [JsonIgnore]
    public string? CustomerCpfRaw => Customer?.Cpf;

    /// <summary>
    /// CNPJ do cliente (idem).
    /// </summary>
    [JsonIgnore]
    public string? CustomerCnpjRaw => Customer?.Cnpj;

    /// <summary>
    /// Checksum MD5 dos campos que podem mudar (Amount, PaidAmount, Balance, Status)
    /// Usado para detectar alterações e evitar sincronização desnecessária
    /// </summary>
    [JsonProperty("checksum")]
    public string Checksum { get; set; } = string.Empty;

    /// <summary>
    /// Calcula o checksum baseado nos campos que podem mudar
    /// </summary>
    public void CalculateChecksum()
    {
        // Campos que podem mudar e devem disparar uma nova sincronização
        var dataToHash = $"{Amount:F2}|{PaidAmount:F2}|{Balance:F2}|{Status}|{DueDate}";
        
        using var md5 = MD5.Create();
        var inputBytes = Encoding.UTF8.GetBytes(dataToHash);
        var hashBytes = md5.ComputeHash(inputBytes);
        
        Checksum = Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}

/// <summary>
/// Payload para confirmação de pagamento de título
/// </summary>
public class TituloPagamentoPayload
{
    [JsonProperty("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "erp_windows";

    /// <summary>
    /// ID único do título no ERP (CODCR)
    /// </summary>
    [JsonProperty("receivable_id_ext")]
    public string ReceivableIdExt { get; set; } = string.Empty;

    /// <summary>
    /// Valor pago
    /// </summary>
    [JsonProperty("paid_amount")]
    public decimal PaidAmount { get; set; }

    /// <summary>
    /// Data do pagamento (formato yyyy-MM-dd)
    /// </summary>
    [JsonProperty("paid_at")]
    public string PaidAt { get; set; } = string.Empty;

    /// <summary>
    /// Tipo de pagamento (cash, check, pix, etc)
    /// </summary>
    [JsonProperty("payment_type")]
    public string PaymentType { get; set; } = "unknown";

    /// <summary>
    /// Status do título após este pagamento (P = quitado).
    /// Quando enviado, a edge function força o status do receivable em vez de calcular pelo saldo.
    /// Use 'P' quando FLAGPAGO='S' ou SALDO &lt;= 0 no Firebird.
    /// </summary>
    [JsonProperty("status", NullValueHandling = NullValueHandling.Ignore)]
    public string? Status { get; set; }

    /// <summary>
    /// ID do evento de pagamento (usado como chave de deduplicação no receivable_payments)
    /// Geralmente é o mesmo valor do EventId
    /// </summary>
    [JsonProperty("payment_event_id")]
    public string PaymentEventId { get; set; } = string.Empty;

    /// <summary>
    /// ID da execução do integrador (para rastreamento)
    /// </summary>
    [JsonProperty("execution_id")]
    public string? ExecutionId { get; set; }

    /// <summary>
    /// Checksum MD5 para detectar alterações
    /// </summary>
    [JsonProperty("checksum")]
    public string Checksum { get; set; } = string.Empty;

    /// <summary>
    /// CPF do cliente do título (não serializado — usado apenas para filtragem local)
    /// </summary>
    [JsonIgnore]
    public string? CustomerCpf { get; set; }

    /// <summary>
    /// CNPJ do cliente do título (não serializado — usado apenas para filtragem local)
    /// </summary>
    [JsonIgnore]
    public string? CustomerCnpj { get; set; }

    /// <summary>
    /// Calcula o checksum baseado nos campos do pagamento
    /// </summary>
    public void CalculateChecksum()
    {
        var dataToHash = $"{EventId}|{ReceivableIdExt}|{PaidAmount:F2}|{PaidAt}|{PaymentType}|{Status}";
        
        using var md5 = MD5.Create();
        var inputBytes = Encoding.UTF8.GetBytes(dataToHash);
        var hashBytes = md5.ComputeHash(inputBytes);
        
        Checksum = Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}
