using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class PurchaseOrderService : IPurchaseOrderService
{
    private readonly AppDbContext _db;

    public PurchaseOrderService(AppDbContext db) => _db = db;

    private static PurchaseOrderDto ToDto(PurchaseOrder po) => new(
        po.Id, po.PoNumber, po.SupplierId, po.Supplier?.Name ?? string.Empty, po.Status,
        po.CreatedAt, po.OrderedAt, po.ExpectedAt,
        po.Items.Select(i => new PurchaseOrderItemDto(
            i.Id, i.ProductId, i.Product?.Name ?? string.Empty, i.OrderedQuantity, i.ReceivedQuantity)).ToList());

    public async Task<List<PurchaseOrderDto>> GetAllAsync()
    {
        var pos = await _db.PurchaseOrders
            .Include(po => po.Supplier)
            .Include(po => po.Items).ThenInclude(i => i.Product)
            .OrderByDescending(po => po.CreatedAt)
            .ToListAsync();
        return pos.Select(ToDto).ToList();
    }

    public async Task<PurchaseOrderDto?> GetByIdAsync(int id)
    {
        var po = await _db.PurchaseOrders
            .Include(po => po.Supplier)
            .Include(po => po.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(po => po.Id == id);
        return po is null ? null : ToDto(po);
    }

    public async Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request)
    {
        if (request.Items is null || request.Items.Count == 0)
            throw new InvalidOperationException("Purchase order must contain at least one item.");

        var supplierExists = await _db.Suppliers.AnyAsync(s => s.Id == request.SupplierId);
        if (!supplierExists)
            throw new InvalidOperationException($"Supplier {request.SupplierId} does not exist.");

        var po = new PurchaseOrder
        {
            PoNumber = $"PO-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}",
            SupplierId = request.SupplierId,
            ExpectedAt = request.ExpectedAt,
            Status = PurchaseOrderStatus.Draft,
        };

        foreach (var item in request.Items)
        {
            var productExists = await _db.Products.AnyAsync(p => p.Id == item.ProductId);
            if (!productExists)
                throw new InvalidOperationException($"Product {item.ProductId} does not exist.");
            if (item.Quantity <= 0)
                throw new InvalidOperationException("Ordered quantity must be positive.");

            po.Items.Add(new PurchaseOrderItem { ProductId = item.ProductId, OrderedQuantity = item.Quantity });
        }

        _db.PurchaseOrders.Add(po);
        await _db.SaveChangesAsync();
        return (await GetByIdAsync(po.Id))!;
    }

    public async Task<PurchaseOrderDto?> MarkOrderedAsync(int id)
    {
        var po = await _db.PurchaseOrders.Include(po => po.Items).FirstOrDefaultAsync(po => po.Id == id);
        if (po is null) return null;

        if (!PurchaseOrderStatusMachine.CanTransition(po.Status, PurchaseOrderStatus.Ordered))
            throw new InvalidOperationException($"Cannot mark a '{po.Status}' purchase order as Ordered.");

        po.Status = PurchaseOrderStatus.Ordered;
        po.OrderedAt = DateTime.UtcNow;
        po.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    public async Task<PurchaseOrderDto?> CancelAsync(int id)
    {
        var po = await _db.PurchaseOrders.FirstOrDefaultAsync(po => po.Id == id);
        if (po is null) return null;

        if (!PurchaseOrderStatusMachine.CanTransition(po.Status, PurchaseOrderStatus.Cancelled))
            throw new InvalidOperationException($"Cannot cancel a '{po.Status}' purchase order.");

        po.Status = PurchaseOrderStatus.Cancelled;
        po.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Receives one or more lines of a purchase order: increases each line's ReceivedQuantity,
    /// increases the corresponding product's stock (concurrency-safe, same retry pattern as
    /// order stock deduction), and logs a StockMovement per line — all inside one transaction,
    /// so a failure on any single line rolls back every stock change made in this call.
    /// Once every line is fully received, the purchase order itself transitions to Received.
    /// </summary>
    public async Task<PurchaseOrderDto?> ReceiveAsync(int id, ReceivePurchaseOrderRequest request)
    {
        if (request.Lines is null || request.Lines.Count == 0)
            throw new InvalidOperationException("Specify at least one line to receive.");

        var po = await _db.PurchaseOrders.Include(po => po.Items).FirstOrDefaultAsync(po => po.Id == id);
        if (po is null) return null;

        if (po.Status != PurchaseOrderStatus.Ordered)
            throw new InvalidOperationException($"Only an 'Ordered' purchase order can be received (current status: '{po.Status}').");

        await using var transaction = await _db.Database.BeginTransactionAsync();
        try
        {
            foreach (var line in request.Lines)
            {
                var item = po.Items.FirstOrDefault(i => i.Id == line.PurchaseOrderItemId)
                    ?? throw new InvalidOperationException($"Purchase order line {line.PurchaseOrderItemId} does not belong to this purchase order.");

                var outstanding = item.OrderedQuantity - item.ReceivedQuantity;
                if (line.ReceivedQuantity <= 0)
                    throw new InvalidOperationException("Received quantity must be positive.");
                if (line.ReceivedQuantity > outstanding)
                    throw new InvalidOperationException(
                        $"Cannot receive {line.ReceivedQuantity} for line {item.Id} — only {outstanding} outstanding.");

                item.ReceivedQuantity += line.ReceivedQuantity;
                await IncreaseStockWithRetryAsync(item.ProductId, line.ReceivedQuantity, po.PoNumber);
            }

            if (po.Items.All(i => i.ReceivedQuantity >= i.OrderedQuantity))
            {
                po.Status = PurchaseOrderStatus.Received;
            }
            po.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            return await GetByIdAsync(id);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// Same optimistic-concurrency retry pattern as OrderService's stock deduction, just additive:
    /// re-reads the product fresh on every attempt so a concurrent write elsewhere (a sale, a
    /// manual adjustment) is never silently overwritten by a stale receiving update.
    /// </summary>
    private async Task IncreaseStockWithRetryAsync(int productId, int quantity, string poNumber)
    {
        const int maxRetries = 3;

        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            var product = await _db.Products.FindAsync(productId)
                ?? throw new InvalidOperationException($"Product {productId} not found.");

            product.QuantityOnHand += quantity;
            product.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                ProductId = product.Id,
                Type = StockMovementType.StockIn,
                Quantity = quantity,
                Reason = $"Purchase order {poNumber} received",
            });

            try
            {
                await _db.SaveChangesAsync();
                return;
            }
            catch (DbUpdateConcurrencyException)
            {
                // Detach only the Product that conflicted — NOT the whole change tracker. The
                // PurchaseOrder/PurchaseOrderItem tracked by the caller are already mid-edit
                // (ReceivedQuantity was just incremented) and must stay tracked so that edit is
                // still saved once this retry succeeds.
                _db.Entry(product).State = EntityState.Detached;
                // loop again and re-read the latest RowVersion / quantity
            }
        }

        throw new InvalidOperationException("Could not update stock due to concurrent updates. Please retry receiving.");
    }
}
