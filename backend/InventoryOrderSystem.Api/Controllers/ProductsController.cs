using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryOrderSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly IProductService _service;

    public ProductsController(IProductService service) => _service = service;

    // Read access is public — lets a portfolio visitor browse the catalog without an account.
    // Everything that mutates data still requires authentication (see [Authorize] below).
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<ProductDto>>> GetAll(
        [FromQuery] int? categoryId, [FromQuery] bool? lowStockOnly, [FromQuery] bool includeInactive = false)
    {
        // Only Admins can request inactive (soft-deleted) products.
        if (includeInactive && !User.IsInRole("Admin"))
            includeInactive = false;

        return Ok(await _service.GetAllAsync(categoryId, lowStockOnly, includeInactive));
    }

    [HttpGet("{id:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<ProductDto>> GetById(int id)
    {
        var product = await _service.GetByIdAsync(id);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost]
    public async Task<ActionResult<ProductDto>> Create(CreateProductRequest request)
    {
        try
        {
            var product = await _service.CreateAsync(request);
            return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProductDto>> Update(int id, UpdateProductRequest request)
    {
        try
        {
            var product = await _service.UpdateAsync(id, request);
            return product is null ? NotFound() : Ok(product);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    // Soft delete: hides the product from normal views but preserves it (and its order history).
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Deactivate(int id)
        => await _service.DeactivateAsync(id) ? NoContent() : NotFound();

    [HttpPost("{id:int}/reactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ProductDto>> Reactivate(int id)
    {
        var product = await _service.ReactivateAsync(id);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost("{id:int}/adjust-stock")]
    public async Task<ActionResult<ProductDto>> AdjustStock(int id, AdjustStockRequest request)
    {
        try
        {
            var product = await _service.AdjustStockAsync(id, request);
            return product is null ? NotFound() : Ok(product);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}
