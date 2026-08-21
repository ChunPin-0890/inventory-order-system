using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Services;

public interface IStockMovementService
{
    Task<List<StockMovementDto>> GetAllAsync(
        int? productId = null, StockMovementType? type = null, DateTime? from = null, DateTime? to = null);
}
