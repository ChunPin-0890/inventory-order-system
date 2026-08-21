namespace InventoryOrderSystem.Api.Models;

public enum PurchaseOrderStatus
{
    Draft,
    Ordered,
    Received,
    Cancelled
}

public class PurchaseOrder
{
    public int Id { get; set; }
    public string PoNumber { get; set; } = string.Empty;
    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? OrderedAt { get; set; }
    public DateTime? ExpectedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public ICollection<PurchaseOrderItem> Items { get; set; } = new List<PurchaseOrderItem>();
}

public class PurchaseOrderItem
{
    public int Id { get; set; }
    public int PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int OrderedQuantity { get; set; }
    public int ReceivedQuantity { get; set; }
}

/// <summary>
/// Defines the allowed purchase-order status transitions (mirrors OrderStatusMachine).
/// Draft -> Ordered -> Received, with Cancelled reachable from Draft or Ordered only —
/// never from Received (stock has already moved by then).
/// </summary>
public static class PurchaseOrderStatusMachine
{
    private static readonly Dictionary<PurchaseOrderStatus, PurchaseOrderStatus[]> AllowedTransitions = new()
    {
        [PurchaseOrderStatus.Draft] = new[] { PurchaseOrderStatus.Ordered, PurchaseOrderStatus.Cancelled },
        [PurchaseOrderStatus.Ordered] = new[] { PurchaseOrderStatus.Received, PurchaseOrderStatus.Cancelled },
        [PurchaseOrderStatus.Received] = Array.Empty<PurchaseOrderStatus>(),
        [PurchaseOrderStatus.Cancelled] = Array.Empty<PurchaseOrderStatus>(),
    };

    public static bool CanTransition(PurchaseOrderStatus from, PurchaseOrderStatus to)
        => AllowedTransitions.TryGetValue(from, out var allowed) && allowed.Contains(to);
}
