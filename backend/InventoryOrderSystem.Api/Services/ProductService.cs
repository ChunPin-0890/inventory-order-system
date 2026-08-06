using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class ProductService : IProductService
{
    private readonly AppDbContext _db;

    public ProductService(AppDbContext db) => _db = db;

    private static ProductDto ToDto(Product p) => new(
        p.Id, p.Sku, p.Name, p.Description, p.CategoryId, p.Category?.Name ?? string.Empty, p.UnitPrice,
        p.QuantityOnHand, p.ReorderThreshold, p.QuantityOnHand <= p.ReorderThreshold, p.IsActive);

    public async Task<List<ProductDto>> GetAllAsync(int? categoryId = null, bool? lowStockOnly = null, bool includeInactive = false)
    {
        var query = _db.Products.Include(p => p.Category).AsQueryable();

        if (!includeInactive)
            query = query.Where(p => p.IsActive);

        if (categoryId.HasValue)
            query = query.Where(p => p.CategoryId == categoryId.Value);

        var products = await query.OrderBy(p => p.Name).ToListAsync();

        var result = products.Select(ToDto);
        if (lowStockOnly == true)
            result = result.Where(p => p.IsLowStock);

        return result.ToList();
    }

    public async Task<ProductDto?> GetByIdAsync(int id)
    {
        var product = await _db.Products.Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == id);
        return product is null ? null : ToDto(product);
    }

    public async Task<ProductDto> CreateAsync(CreateProductRequest request)
    {
        var categoryExists = await _db.Categories.AnyAsync(c => c.Id == request.CategoryId);
        if (!categoryExists)
            throw new InvalidOperationException($"Category {request.CategoryId} does not exist.");

        var product = new Product
        {
            Sku = request.Sku,
            Name = request.Name,
            Description = request.Description,
            CategoryId = request.CategoryId,
            UnitPrice = request.UnitPrice,
            QuantityOnHand = request.QuantityOnHand,
            ReorderThreshold = request.ReorderThreshold,
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();

        if (request.QuantityOnHand > 0)
        {
            _db.StockMovements.Add(new StockMovement
            {
                ProductId = product.Id,
                Type = StockMovementType.StockIn,
                Quantity = request.QuantityOnHand,
                Reason = "Initial stock"
            });
            await _db.SaveChangesAsync();
        }

        return (await GetByIdAsync(product.Id))!;
    }

    public async Task<ProductDto?> UpdateAsync(int id, UpdateProductRequest request)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return null;

        var categoryExists = await _db.Categories.AnyAsync(c => c.Id == request.CategoryId);
        if (!categoryExists)
            throw new InvalidOperationException($"Category {request.CategoryId} does not exist.");

        product.Name = request.Name;
        product.Description = request.Description;
        product.CategoryId = request.CategoryId;
        product.UnitPrice = request.UnitPrice;
        product.ReorderThreshold = request.ReorderThreshold;
        product.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Soft delete — the product is hidden from normal listings but its row (and order history
    /// referencing it) is preserved. Admins can still see it via includeInactive and reactivate it.
    /// </summary>
    public async Task<bool> DeactivateAsync(int id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return false;

        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<ProductDto?> ReactivateAsync(int id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return null;

        product.IsActive = true;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Manual stock adjustment (in/out) with optimistic-concurrency retry.
    /// Guards against the stock count ever going negative when adjusting downward.
    /// </summary>
    public async Task<ProductDto?> AdjustStockAsync(int id, AdjustStockRequest request)
    {
        const int maxRetries = 3;
        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            var product = await _db.Products.FindAsync(id);
            if (product is null) return null;

            var newQuantity = product.QuantityOnHand + request.Quantity;
            if (newQuantity < 0)
                throw new InvalidOperationException("Insufficient stock for this adjustment.");

            product.QuantityOnHand = newQuantity;
            product.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                ProductId = product.Id,
                Type = request.Quantity >= 0 ? StockMovementType.StockIn : StockMovementType.StockOut,
                Quantity = Math.Abs(request.Quantity),
                Reason = request.Reason
            });

            try
            {
                await _db.SaveChangesAsync();
                return await GetByIdAsync(id);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Another request modified the same product row (RowVersion mismatch) — reload and retry.
                foreach (var entry in _db.ChangeTracker.Entries())
                    entry.State = EntityState.Detached;
            }
        }

        throw new InvalidOperationException("Could not adjust stock after multiple attempts due to concurrent updates.");
    }
}
