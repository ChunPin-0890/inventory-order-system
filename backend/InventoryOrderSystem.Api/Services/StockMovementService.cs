using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class StockMovementService : IStockMovementService
{
    private readonly AppDbContext _db;

    public StockMovementService(AppDbContext db) => _db = db;

    private static StockMovementDto ToDto(StockMovement m) => new(
        m.Id, m.ProductId, m.Product?.Name ?? string.Empty, m.Type, m.Quantity, m.Reason, m.OrderId, m.CreatedAt);

    public async Task<List<StockMovementDto>> GetAllAsync(
        int? productId = null, StockMovementType? type = null, DateTime? from = null, DateTime? to = null)
    {
        var query = _db.StockMovements.Include(m => m.Product).AsQueryable();

        if (productId.HasValue)
            query = query.Where(m => m.ProductId == productId.Value);
        if (type.HasValue)
            query = query.Where(m => m.Type == type.Value);
        if (from.HasValue)
            query = query.Where(m => m.CreatedAt >= from.Value);
        if (to.HasValue)
            query = query.Where(m => m.CreatedAt <= to.Value);

        var movements = await query.OrderByDescending(m => m.CreatedAt).ToListAsync();
        return movements.Select(ToDto).ToList();
    }
}
