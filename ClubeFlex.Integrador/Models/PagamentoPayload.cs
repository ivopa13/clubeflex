using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace ClubeFlex.Integrador.Models;

public class PagamentoPayload
{
    [JsonProperty("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonProperty("invoice_id_ext")]
    public string InvoiceIdExt { get; set; } = string.Empty;

    [JsonProperty("paid_amount")]
    public decimal PaidAmount { get; set; }

    [JsonProperty("paid_at")]
    public string PaidAt { get; set; } = string.Empty;

    [JsonProperty("payment_type")]
    public string PaymentType { get; set; } = string.Empty;

    /// <summary>
    /// Checksum MD5 dos campos principais para detectar alterações
    /// </summary>
    [JsonProperty("checksum")]
    public string Checksum { get; set; } = string.Empty;

    /// <summary>
    /// Calcula o checksum baseado nos campos que identificam o pagamento
    /// </summary>
    public void CalculateChecksum()
    {
        // Campos que identificam unicamente o pagamento
        var dataToHash = $"{EventId}|{InvoiceIdExt}|{PaidAmount:F2}|{PaidAt}|{PaymentType}";
        
        using var md5 = MD5.Create();
        var inputBytes = Encoding.UTF8.GetBytes(dataToHash);
        var hashBytes = md5.ComputeHash(inputBytes);
        
        Checksum = Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}
