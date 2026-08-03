#Requires -Version 5.1
<#
.SYNOPSIS
  Creates an Azure AD app registration for PMO-CTSB Teams calendar sync (Microsoft Graph).

.NOTES
  Requires: Azure CLI (az) logged in as a Microsoft 365 / Entra ID admin.
  Install: winget install -e --id Microsoft.AzureCLI
  Login:   az login
#>

$ErrorActionPreference = 'Stop'
$AppName = 'PMO-CTSB Calendar'

function Require-Az {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host 'Azure CLI not found. Installing via winget...'
    winget install -e --id Microsoft.AzureCLI --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
      [System.Environment]::GetEnvironmentVariable('Path', 'User')
  }
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI still not available. Open a new terminal after install, run az login, then re-run this script.'
  }
}

Require-Az

Write-Host 'Checking Azure login...'
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
  Write-Host 'Opening browser for az login (use a Global Admin / Application Admin account)...'
  az login | Out-Null
  $account = az account show | ConvertFrom-Json
}

$tenantId = $account.tenantId
Write-Host "Tenant: $($account.name) ($tenantId)"

Write-Host "Creating app registration '$AppName'..."
$appJson = az ad app create --display-name $AppName --sign-in-audience AzureADMyOrg | ConvertFrom-Json
$clientId = $appJson.appId
$objectId = $appJson.id
Write-Host "Client ID: $clientId"

Write-Host 'Creating client secret (valid 24 months)...'
$secretJson = az ad app credential reset --id $clientId --append --years 2 --display-name 'pmo-ctsb-graph' | ConvertFrom-Json
$clientSecret = $secretJson.password
if (-not $clientSecret) { throw 'Failed to create client secret' }

Write-Host 'Creating service principal...'
az ad sp create --id $clientId | Out-Null

# Microsoft Graph application permission Calendars.ReadWrite
# App role id for Calendars.ReadWrite (Application): ef54d2bf-783f-4e0f-bca1-3210c0444d99
$GraphAppId = '00000003-0000-0000-c000-000000000000'
$CalendarsReadWriteRoleId = 'ef54d2bf-783f-4e0f-bca1-3210c0444d99'

Write-Host 'Adding Microsoft Graph Calendars.ReadWrite (Application)...'
az ad app permission add --id $clientId --api $GraphAppId --api-permissions "$CalendarsReadWriteRoleId=Role" | Out-Null

Write-Host 'Granting admin consent...'
try {
  az ad app permission admin-consent --id $clientId | Out-Null
  Write-Host 'Admin consent granted.'
} catch {
  Write-Host 'Could not grant admin consent from CLI. In Azure Portal: API permissions → Grant admin consent.'
}

Write-Host ''
Write-Host '===== Paste these into PMO → Settings → Teams calendar ====='
Write-Host "Directory (tenant) ID : $tenantId"
Write-Host "Application (client) ID: $clientId"
Write-Host "Client secret          : $clientSecret"
Write-Host '=============================================================='
Write-Host ''
Write-Host 'Optional Vercel env names: MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET'
Write-Host "App object id (reference): $objectId"
