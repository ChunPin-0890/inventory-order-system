using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class OrderService : IOrderService
{
    private readonly AppDbContext _db;

    public OrderService(AppDbContext db) => _db = db;

    private static OrderDto ToDto(Order o) => new(
        o.Id, o.OrderNumber, o.CustomerName, o.Status, o.TotalAmount, o.CreatedAt,
        o.Items.Select(i => new OrderItemDto(
            i.ProductId, i.Product?.Name ?? string.Empty, i.Quantity, i.UnitPrice, i.Quantity * i.UnitPrice
        )).ToList());

    public async Task<List<OrderDto>> GetAllAsync(string? search = null)
    {
        var orders = await _db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            orders = orders.Where(o =>
                o.CustomerName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                o.OrderNumber.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        return orders.Select(ToDto).ToList();
    }

    public async Task<OrderDto?> GetByIdAsync(int id)
    {
        var order = await _db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == id);
        return order is null ? null : ToDto(order);
    }

    /// <summary>
    /// Creates an order and atomically deducts stock for every line item.
    /// Uses a DB transaction plus a per-product optimistic-concurrency retry loop so that
    /// two customers ordering the last unit of the same product can never both succeed.
    /// </summary>
    public async Task<OrderDto> CreateAsync(CreateOrderRequest request)
    {
        if (request.Items is null || request.Items.Count == 0)
            throw new InvalidOperationException("Order must contain at least one item.");

        await using var transaction = await _db.Database.BeginTransactionAsync();

        try
        {
            var order = new Order
            {
                OrderNumber = $"ORD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}",
                CustomerName = request.CustomerName,
                Status = OrderStatus.Pending,
            };

            decimal total = 0;

            foreach (var item in request.Items)
            {
                var product = await DeductStockWithRetryAsync(item.ProductId, item.Quantity, orderNumber: order.OrderNumber);

                var lineTotal = product.UnitPrice * item.Quantity;
                total += lineTotal;

                order.Items.Add(new OrderItem
                {
                    ProductId = product.Id,
                    Quantity = item.Quantity,
                    UnitPrice = product.UnitPrice,
                });
            }

            order.TotalAmount = total;

            _db.Orders.Add(order);
            await _db.SaveChangesAsync();

            await transaction.CommitAsync();

            return (await GetByIdAsync(order.Id))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private async Task<Product> DeductStockWithRetryAsync(int productId, int quantity, string orderNumber)
    {
        const int maxRetries = 3;

        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            var product = await _db.Products.FindAsync(productId)
                ?? throw new InvalidOperationException($"Product {productId} not found.");

            if (product.QuantityOnHand < quantity)
                throw new InvalidOperationException(
                    $"Insufficient stock for '{product.Name}'. Available: {product.QuantityOnHand}, requested: {quantity}.");

            product.QuantityOnHand -= quantity;
            product.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                ProductId = product.Id,
                Type = StockMovementType.StockOut,
                Quantity = quantity,
                Reason = $"Order {orderNumber}",
            });

            try
            {
                await _db.SaveChangesAsync();
                return product;
            }
            catch (DbUpdateConcurrencyException)
            {
                foreach (var entry in _db.ChangeTracker.Entries())
                    entry.State = EntityState.Detached;
                // Loop again and re-read the latest RowVersion / quantity.
            }
        }

        throw new InvalidOperationException("Could not reserve stock due to concurrent updates. Please retry the order.");
    }

    public async Task<OrderDto?> UpdateStatusAsync(int id, UpdateOrderStatusRequest request)
    {
        var order = await _db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order is null) return null;

        if (!OrderStatusMachine.CanTransition(order.Status, request.Status))
            throw new InvalidOperationException(
                $"Cannot transition order from '{order.Status}' to '{request.Status}'.");

        // Restock items if the order is cancelled before shipping.
        if (request.Status == OrderStatus.Cancelled)
        {
            foreach (var item in order.Items)
            {
                var product = await _db.Products.FindAsync(item.ProductId);
                if (product is not null)
                {
                    product.QuantityOnHand += item.Quantity;
                    _db.StockMovements.Add(new StockMovement
                    {
                        ProductId = product.Id,
                        Type = StockMovementType.StockIn,
                        Quantity = item.Quantity,
                        Reason = $"Order {order.OrderNumber} cancelled",
                        OrderId = order.Id,
                    });
                }
            }
        }

        order.Status = request.Status;
        order.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(order);
    }
}
