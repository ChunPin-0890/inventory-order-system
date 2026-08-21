using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Dtos;

public record PurchaseOrderItemRequest(int ProductId, int Quantity);

public record CreatePurchaseOrderRequest(int SupplierId, DateTime? ExpectedAt, List<PurchaseOrderItemRequest> Items);

public record PurchaseOrderItemDto(
    int Id, int ProductId, string ProductName, int OrderedQuantity, int ReceivedQuantity);

public record PurchaseOrderDto(
    int Id, string PoNumber, int SupplierId, string SupplierName, PurchaseOrderStatus Status,
    DateTime CreatedAt, DateTime? OrderedAt, DateTime? ExpectedAt, List<PurchaseOrderItemDto> Items);

/// <summary>One line of a receiving action: how much of this specific PO line arrived just now.</summary>
public record ReceiveLineRequest(int PurchaseOrderItemId, int ReceivedQuantity);

public record ReceivePurchaseOrderRequest(List<ReceiveLineRequest> Lines);
