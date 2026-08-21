using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryOrderSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SuppliersController : ControllerBase
{
    private readonly ISupplierService _service;

    public SuppliersController(ISupplierService service) => _service = service;

    // Suppliers power the purchase-order form's dropdown, same reasoning as Categories —
    // public read, authenticated write.
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<SupplierDto>>> GetAll() => Ok(await _service.GetAllAsync());

    [HttpPost]
    public async Task<ActionResult<SupplierDto>> Create(CreateSupplierRequest request)
    {
        try
        {
            var supplier = await _service.CreateAsync(request);
            return Ok(supplier);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
