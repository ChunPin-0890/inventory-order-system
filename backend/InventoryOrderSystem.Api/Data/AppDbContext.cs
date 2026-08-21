using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>(e =>
        {
            e.HasIndex(p => p.Sku).IsUnique();
            e.Property(p => p.UnitPrice).HasColumnType("decimal(18,2)");
            e.Property(p => p.RowVersion).IsRowVersion();
            e.HasOne(p => p.Category).WithMany(c => c.Products).HasForeignKey(p => p.CategoryId);
        });

        modelBuilder.Entity<Category>(e =>
        {
            e.HasIndex(c => c.Name).IsUnique();
        });

        modelBuilder.Entity<Order>(e =>
        {
            e.HasIndex(o => o.OrderNumber).IsUnique();
            e.Property(o => o.TotalAmount).HasColumnType("decimal(18,2)");
        });

        modelBuilder.Entity<OrderItem>(e =>
        {
            e.Property(oi => oi.UnitPrice).HasColumnType("decimal(18,2)");
            e.HasOne(oi => oi.Order).WithMany(o => o.Items).HasForeignKey(oi => oi.OrderId);
            e.HasOne(oi => oi.Product).WithMany().HasForeignKey(oi => oi.ProductId);
        });

        modelBuilder.Entity<StockMovement>(e =>
        {
            e.HasOne(sm => sm.Product).WithMany(p => p.StockMovements).HasForeignKey(sm => sm.ProductId);
        });

        modelBuilder.Entity<PurchaseOrder>(e =>
        {
            e.HasIndex(po => po.PoNumber).IsUnique();
            e.HasOne(po => po.Supplier).WithMany(s => s.PurchaseOrders).HasForeignKey(po => po.SupplierId);
        });

        modelBuilder.Entity<PurchaseOrderItem>(e =>
        {
            e.HasOne(poi => poi.PurchaseOrder).WithMany(po => po.Items).HasForeignKey(poi => poi.PurchaseOrderId);
            e.HasOne(poi => poi.Product).WithMany().HasForeignKey(poi => poi.ProductId);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
        });
    }
}
