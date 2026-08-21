using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Dtos;

public record StockMovementDto(
    int Id, int ProductId, string ProductName, StockMovementType Type,
    int Quantity, string? Reason, int? OrderId, DateTime CreatedAt);
