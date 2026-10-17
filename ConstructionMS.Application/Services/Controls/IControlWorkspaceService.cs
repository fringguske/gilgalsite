namespace ConstructionMS.Application.Services.Controls;

using ConstructionMS.Application.DTOs.Controls;

public interface IControlWorkspaceService
{
    Task<IReadOnlyList<CashAccountResponseDto>> GetCashAccountsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<IReadOnlyList<OpeningPositionResponseDto>> GetOpeningPositionsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<OpeningPositionResponseDto> CreateOpeningPositionAsync(CreateOpeningPositionRequestDto request, int actorUserId, string actorRole);
    Task<OpeningPositionResponseDto> VerifyOpeningPositionAsync(long id, OpeningPositionDecisionRequestDto request, int actorUserId, string actorRole);
    Task<OpeningPositionResponseDto> DecideOpeningPositionAsync(long id, OpeningPositionDecisionRequestDto request, int actorUserId, string actorRole);

    Task<IReadOnlyList<MaterialReturnResponseDto>> GetMaterialReturnsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<MaterialIssueDisputeResolutionResponseDto> ResolveMaterialIssueDisputeAsync(long materialIssueId, ResolveMaterialIssueDisputeRequestDto request, int actorUserId, string actorRole);
    Task<MaterialReturnResponseDto> CreateMaterialReturnAsync(CreateMaterialReturnRequestDto request, int actorUserId, string actorRole);
    Task<MaterialReturnResponseDto> ReceiveMaterialReturnAsync(long id, ReceiveMaterialReturnRequestDto request, int actorUserId, string actorRole);
    Task<IReadOnlyList<CustodyCloseoutResponseDto>> GetCustodyCloseoutsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<CustodyCloseoutResponseDto> SubmitCustodyCloseoutAsync(SubmitCustodyCloseoutRequestDto request, int actorUserId, string actorRole);
    Task<CustodyCloseoutResponseDto> ReviewCustodyCloseoutAsync(long id, ReviewCustodyCloseoutRequestDto request, int actorUserId, string actorRole);

    Task<IReadOnlyList<OperationalPeriodResponseDto>> GetPeriodsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<OperationalPeriodResponseDto> CreatePeriodAsync(CreateOperationalPeriodRequestDto request, int actorUserId, string actorRole);
    Task<OperationalPeriodResponseDto> SubmitPeriodCloseAsync(long id, PeriodActionRequestDto request, int actorUserId, string actorRole);
    Task<OperationalPeriodResponseDto> DecidePeriodCloseAsync(long id, PeriodDecisionRequestDto request, int actorUserId, string actorRole);
    Task<IReadOnlyList<ControlledCorrectionResponseDto>> GetCorrectionsAsync(int actorUserId, string actorRole, int? projectId = null);
    Task<ControlledCorrectionResponseDto> CreateCorrectionAsync(CreateControlledCorrectionRequestDto request, int actorUserId, string actorRole);
    Task<ControlledCorrectionResponseDto> DecideCorrectionAsync(long id, CorrectionDecisionRequestDto request, int actorUserId, string actorRole);
}
