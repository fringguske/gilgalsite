namespace ConstructionMS.Api.Workers;

using ConstructionMS.Application.Configuration;
using ConstructionMS.Application.Services.Tasks;
using Microsoft.Extensions.Options;

public sealed class OverdueNotificationWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<TaskInboxOptions> options,
    ILogger<OverdueNotificationWorker> logger) : BackgroundService
{
    private readonly TaskInboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(
                TimeSpan.FromSeconds(Math.Max(1, _options.InitialNotificationDelaySeconds)),
                stoppingToken);

            using var timer = new PeriodicTimer(
                TimeSpan.FromMinutes(Math.Max(1, _options.NotificationSweepMinutes)));
            do
            {
                await RunSweepAsync(stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task RunSweepAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var notifications = scope.ServiceProvider.GetRequiredService<IInAppNotificationService>();
            var inserted = await notifications.GenerateOverdueAsync(cancellationToken);
            if (inserted > 0)
                logger.LogInformation("Generated {NotificationCount} overdue in-app notifications.", inserted);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Overdue in-app notification generation failed.");
        }
    }
}
