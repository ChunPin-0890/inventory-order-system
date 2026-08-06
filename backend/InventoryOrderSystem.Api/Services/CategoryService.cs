using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryOrderSystem.Api.Services;

public class CategoryService : ICategoryService
{
    private readonly AppDbContext _db;

    public CategoryService(AppDbContext db) => _db = db;

    public async Task<List<CategoryDto>> GetAllAsync()
    {
        var categories = await _db.Categories.OrderBy(c => c.Name).ToListAsync();
        return categories.Select(c => new CategoryDto(c.Id, c.Name)).ToList();
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryRequest request)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
            throw new InvalidOperationException("Category name is required.");

        var existing = await _db.Categories.FirstOrDefaultAsync(c => c.Name == name);
        if (existing is not null)
            return new CategoryDto(existing.Id, existing.Name);

        var category = new Category { Name = name };
        _db.Categories.Add(category);
        await _db.SaveChangesAsync();
        return new CategoryDto(category.Id, category.Name);
    }
}
