using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Dtos;

public record OrderItemRequest(int ProductId, int Quantity);

public record CreateOrderRequest(string CustomerName, List<OrderItemRequest> Items);

public record OrderItemDto(int ProductId, string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal);

public record OrderDto(int Id, string OrderNumber, string CustomerName, OrderStatus Status,
    decimal TotalAmount, DateTime CreatedAt, List<OrderItemDto> Items);

public record UpdateOrderStatusRequest(OrderStatus Status);
