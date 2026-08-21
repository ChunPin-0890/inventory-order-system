using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class SupplierService : ISupplierService
{
    private readonly AppDbContext _db;

    public SupplierService(AppDbContext db) => _db = db;

    private static SupplierDto ToDto(Supplier s) => new(s.Id, s.Name, s.ContactName, s.Email, s.Phone);

    public async Task<List<SupplierDto>> GetAllAsync()
    {
        var suppliers = await _db.Suppliers.OrderBy(s => s.Name).ToListAsync();
        return suppliers.Select(ToDto).ToList();
    }

    public async Task<SupplierDto> CreateAsync(CreateSupplierRequest request)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
            throw new InvalidOperationException("Supplier name is required.");

        var supplier = new Supplier
        {
            Name = name,
            ContactName = request.ContactName,
            Email = request.Email,
            Phone = request.Phone,
        };

        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return ToDto(supplier);
    }
}
