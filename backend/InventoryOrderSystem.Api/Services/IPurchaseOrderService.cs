using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface IPurchaseOrderService
{
    Task<List<PurchaseOrderDto>> GetAllAsync();
    Task<PurchaseOrderDto?> GetByIdAsync(int id);
    Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request);
    Task<PurchaseOrderDto?> MarkOrderedAsync(int id);
    Task<PurchaseOrderDto?> ReceiveAsync(int id, ReceivePurchaseOrderRequest request);
    Task<PurchaseOrderDto?> CancelAsync(int id);
}
