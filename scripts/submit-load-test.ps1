param(
    [string]$BaseUrl = "http://localhost:8080",
    [int]$JobCount = 10
)

$payload = @{
    seed = 90210
    durationSeconds = 180
    courierCount = 6
    grid = @{ columns = 15; rows = 6 }
    depots = @(
        @{ x = 1; y = 1 },
        @{ x = 13; y = 1 },
        @{ x = 2; y = 4 },
        @{ x = 12; y = 4 }
    )
    demandDelay = 34
    algorithms = @("independent", "traffic", "self_selection")
    stepMilliseconds = 2000
} | ConvertTo-Json -Depth 5

$started = Get-Date
$jobs = @()

for ($index = 0; $index -lt $JobCount; $index++) {
    $headers = @{ "Idempotency-Key" = "load-test-$index-$(Get-Random)" }
    $jobs += Invoke-RestMethod `
        -Method Post `
        -Uri "$BaseUrl/api/v1/simulation-jobs" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $payload
}

$completed = 0
$failed = 0

for ($index = 0; $index -lt 60; $index++) {
    $completed = 0
    $failed = 0
    foreach ($job in $jobs) {
        $status = Invoke-RestMethod -Uri "$BaseUrl/api/v1/simulation-jobs/$($job.id)"
        if ($status.status -eq "COMPLETED") { $completed++ }
        if ($status.status -eq "FAILED") { $failed++ }
    }
    if (($completed + $failed) -eq $jobs.Count) { break }
    Start-Sleep -Seconds 1
}

[PSCustomObject]@{
    Submitted = $jobs.Count
    Completed = $completed
    Failed = $failed
    DurationSeconds = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
}
