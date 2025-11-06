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
}
