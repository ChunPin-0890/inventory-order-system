using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryOrderSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly IProductDescriptionService _service;

    public AiController(IProductDescriptionService service) => _service = service;

    // Description generation is only useful while creating/editing a product, which already
    // requires being signed in, so no [AllowAnonymous] here (also keeps API usage/cost attributable).
    [HttpPost("generate-description")]
    public async Task<ActionResult<GenerateDescriptionResponse>> GenerateDescription(GenerateDescriptionRequest request, CancellationToken ct)
    {
        try
        {
            var result = await _service.GenerateAsync(request, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
