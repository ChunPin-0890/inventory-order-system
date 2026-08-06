using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface IOrderService
{
    Task<List<OrderDto>> GetAllAsync(string? search = null);
    Task<OrderDto?> GetByIdAsync(int id);
    Task<OrderDto> CreateAsync(CreateOrderRequest request);
    Task<OrderDto?> UpdateStatusAsync(int id, UpdateOrderStatusRequest request);
}
