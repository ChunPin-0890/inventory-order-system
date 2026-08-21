using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryOrderSystem.Api.Controllers;

[ApiController]
[Route("api/purchase-orders")]
[Authorize]
public class PurchaseOrdersController : ControllerBase
{
    private readonly IPurchaseOrderService _service;

    public PurchaseOrdersController(IPurchaseOrderService service) => _service = service;

    [HttpGet]
    public async Task<ActionResult<List<PurchaseOrderDto>>> GetAll() => Ok(await _service.GetAllAsync());

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PurchaseOrderDto>> GetById(int id)
    {
        var po = await _service.GetByIdAsync(id);
        return po is null ? NotFound() : Ok(po);
    }

    [HttpPost]
    public async Task<ActionResult<PurchaseOrderDto>> Create(CreatePurchaseOrderRequest request)
    {
        try
        {
            var po = await _service.CreateAsync(request);
            return CreatedAtAction(nameof(GetById), new { id = po.Id }, po);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/mark-ordered")]
    public async Task<ActionResult<PurchaseOrderDto>> MarkOrdered(int id)
    {
        try
        {
            var po = await _service.MarkOrderedAsync(id);
            return po is null ? NotFound() : Ok(po);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/receive")]
    public async Task<ActionResult<PurchaseOrderDto>> Receive(int id, ReceivePurchaseOrderRequest request)
    {
        try
        {
            var po = await _service.ReceiveAsync(id, request);
            return po is null ? NotFound() : Ok(po);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    // Cancelling a purchase order (like cancelling a sales order) is Admin-only.
    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<PurchaseOrderDto>> Cancel(int id)
    {
        try
        {
            var po = await _service.CancelAsync(id);
            return po is null ? NotFound() : Ok(po);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}
