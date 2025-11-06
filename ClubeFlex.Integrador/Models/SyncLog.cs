namespace ClubeFlex.Integrador.Models;

public class SyncLog
{
    public int Id { get; set; }
    public string EventId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string Status { get; set; } = "pending";
    public string? Payload { get; set; }
    public string? ErrorMessage { get; set; }
    public int Attempts { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}
