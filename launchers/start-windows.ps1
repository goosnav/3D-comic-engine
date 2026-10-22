$ErrorActionPreference = 'Stop'
try {
    Set-Location (Split-Path -Parent $PSScriptRoot)
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node 22.12+ with npm from https://nodejs.org/, reopen your terminal, and run this launcher again.'
    }
    & node tools/setup.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & node bin/theatre.mjs gui @args
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
