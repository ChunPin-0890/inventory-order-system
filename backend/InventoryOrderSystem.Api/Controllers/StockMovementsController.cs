using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryOrderSystem.Api.Controllers;

[ApiController]
[Route("api/stock-movements")]
[Authorize]
public class StockMovementsController : ControllerBase
{
    private readonly IStockMovementService _service;

    public StockMovementsController(IStockMovementService service) => _service = service;

    [HttpGet]
    public async Task<ActionResult<List<StockMovementDto>>> GetAll(
        [FromQuery] int? productId, [FromQuery] StockMovementType? type,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        => Ok(await _service.GetAllAsync(productId, type, from, to));
}
