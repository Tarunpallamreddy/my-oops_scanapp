# Self-elevation check: Verify if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "CRITICAL: This script must be run as Administrator! Please open PowerShell as Administrator and run it again."
    Write-Host "`nTo run as Administrator:" -ForegroundColor Yellow
    Write-Host "1. Press Windows Key, type 'PowerShell'"
    Write-Host "2. Right-click 'Windows PowerShell' and select 'Run as Administrator'"
    Write-Host "3. Navigate to this folder and run: .\enable_sql_tcp.ps1" -ForegroundColor Cyan
    Exit
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   Configuring SQL Server & Firewall for MyGo Scan      " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$regPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib"

if (-not (Test-Path $regPath)) {
    # Let's search for another instance version if MSSQL17 is not found
    $instanceKeys = Get-ChildItem -Path "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server" -ErrorAction SilentlyContinue | 
                    Where-Object { $_.Name -match "MSSQL\d+\.SQLEXPRESS" }
    
    if ($instanceKeys) {
        $firstInstance = $instanceKeys[0].PSChildName
        $regPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$firstInstance\MSSQLServer\SuperSocketNetLib"
        Write-Host "Found SQL Server instance: $firstInstance" -ForegroundColor Green
    } else {
        Write-Error "Could not locate a SQLEXPRESS instance registry key. Please ensure SQL Server Express is installed."
        Exit
    }
}

# 1. Enable TCP/IP Protocol
Write-Host "Enabling TCP/IP protocol..." -ForegroundColor Yellow
Set-ItemProperty -Path "$regPath\Tcp" -Name "Enabled" -Value 1 -Type DWord

# 2. Configure TCP/IP to listen on Port 1433 under IPAll
Write-Host "Configuring IPAll to listen on port 1433..." -ForegroundColor Yellow
Set-ItemProperty -Path "$regPath\Tcp\IPAll" -Name "TcpPort" -Value "1433" -Type String
Set-ItemProperty -Path "$regPath\Tcp\IPAll" -Name "TcpDynamicPorts" -Value "" -Type String

Write-Host "TCP/IP successfully enabled on port 1433 in the registry." -ForegroundColor Green

# 3. Create Windows Firewall Rule for API Server (Port 3000)
Write-Host "Creating inbound firewall rule for Port 3000 (MyGo Scan API)..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName "MyGoScan API 3000" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "MyGoScan API 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow | Out-Null
Write-Host "Firewall rule created successfully." -ForegroundColor Green

# 4. Restart the SQL Server Service to apply the changes
Write-Host "Restarting SQL Server (SQLEXPRESS) service..." -ForegroundColor Yellow
Restart-Service -Name "MSSQL`$$($regPath.Split('\')[-3].Split('.')[-1])" -Force

Write-Host "SQL Server service restarted successfully." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Configuration completed! SQL Server is ready on port 1433," -ForegroundColor Green
Write-Host "and Firewall is open on Port 3000." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
