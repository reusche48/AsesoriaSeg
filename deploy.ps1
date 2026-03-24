# ============================================================
# Script de Deploy - Sube archivos al servidor por FTP
# Uso: .\deploy.ps1          → sube TODOS los archivos del proyecto
#      .\deploy.ps1 rapido   → sube solo archivos modificados en las últimas 2 horas
# ============================================================

$FTP_HOST = "ftp://107.180.115.202"
$FTP_USER = "subeppk@sitemasperu.com"
$FTP_PASS = "Aa@33590728"
$REMOTE_PATH = ""

# Carpetas y archivos a EXCLUIR (no van al servidor)
$excludeDirs = @("node_modules", ".git", ".kiro", ".vscode", "database", "src\tests")
$excludeFiles = @("package.json", "package-lock.json", "vitest.config.js", "deploy.ps1", "AsesoriaSeg.code-workspace", "diagrama_bd.html", "serve.cjs")

# Modo rápido: solo archivos modificados en las últimas 2 horas
$modo = $args[0]
$horasAtras = 2

# Modo listar: explorar carpetas del FTP para encontrar la ruta correcta
if ($modo -eq "listar") {
    $rutaExplorar = $args[1]
    if (-not $rutaExplorar) { $rutaExplorar = "/" }
    Write-Host ""
    Write-Host "=== EXPLORANDO FTP: $rutaExplorar ===" -ForegroundColor Cyan
    try {
        $ftpUrl = "$FTP_HOST$rutaExplorar"
        if (-not $ftpUrl.EndsWith("/")) { $ftpUrl += "/" }
        $req = [System.Net.FtpWebRequest]::Create($ftpUrl)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails
        $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $response = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $listing = $reader.ReadToEnd()
        $reader.Close()
        $response.Close()
        Write-Host $listing -ForegroundColor White
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Presione Enter para cerrar..."
    $null = Read-Host
    exit
}

Write-Host ""
if ($modo -eq "rapido") {
    Write-Host "=== DEPLOY RAPIDO (ultimos $horasAtras horas) ===" -ForegroundColor Cyan
} else {
    Write-Host "=== DEPLOY COMPLETO ===" -ForegroundColor Cyan
}
Write-Host ""

$projectRoot = $PSScriptRoot

# Auto-actualizar versión de caché en index.html
$indexPath = Join-Path $projectRoot "index.html"
if (Test-Path $indexPath) {
    $versionTag = "v=" + (Get-Date -Format "yyyyMMddHHmm")
    $indexContent = Get-Content $indexPath -Raw
    $indexContent = $indexContent -replace '\?v=[^"'']+', "?$versionTag"
    Set-Content -Path $indexPath -Value $indexContent -NoNewline
    Write-Host "  Version cache actualizada: $versionTag" -ForegroundColor Yellow
    Write-Host ""
}

$allFiles = Get-ChildItem -Path $projectRoot -Recurse -File

# Filtrar archivos
$filesToUpload = $allFiles | Where-Object {
    $relativePath = $_.FullName.Substring($projectRoot.Length + 1)
    $skip = $false

    # Excluir carpetas
    foreach ($dir in $excludeDirs) {
        if ($relativePath.StartsWith("$dir\") -or $relativePath.StartsWith("$dir/")) {
            $skip = $true
            break
        }
    }

    # Excluir archivos específicos
    if ($excludeFiles -contains $_.Name) { $skip = $true }

    # Excluir archivos ocultos y .gitkeep
    if ($_.Name.StartsWith(".") -or $_.Name -eq ".gitkeep") { $skip = $true }

    # Modo rápido: solo recientes
    if ($modo -eq "rapido" -and !$skip) {
        $limite = (Get-Date).AddHours(-$horasAtras)
        if ($_.LastWriteTime -lt $limite) { $skip = $true }
    }

    -not $skip
}

if ($filesToUpload.Count -eq 0) {
    Write-Host "No hay archivos para subir." -ForegroundColor Yellow
    Write-Host "Presione Enter para cerrar..."
    $null = Read-Host
    exit
}

Write-Host "Archivos a subir: $($filesToUpload.Count)" -ForegroundColor White
Write-Host ""

$ok = 0
$fail = 0

foreach ($file in $filesToUpload) {
    $relativePath = $file.FullName.Substring($projectRoot.Length + 1) -replace '\\','/'
    $remoteFull = "$FTP_HOST$REMOTE_PATH/$relativePath"

    try {
        $webclient = New-Object System.Net.WebClient
        $webclient.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $webclient.UploadFile($remoteFull, $file.FullName)
        Write-Host "  OK: $relativePath" -ForegroundColor Green
        $ok++
    } catch {
        # Intentar crear carpeta remota si no existe
        try {
            $parentDir = [System.IO.Path]::GetDirectoryName($relativePath) -replace '\\','/'
            if ($parentDir) {
                $ftpDir = "$FTP_HOST$REMOTE_PATH/$parentDir/"
                $req = [System.Net.FtpWebRequest]::Create($ftpDir)
                $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
                $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
                $req.GetResponse() | Out-Null
            }
            # Reintentar subida
            $webclient2 = New-Object System.Net.WebClient
            $webclient2.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
            $webclient2.UploadFile($remoteFull, $file.FullName)
            Write-Host "  OK: $relativePath (carpeta creada)" -ForegroundColor Green
            $ok++
        } catch {
            Write-Host "  ERROR: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
            $fail++
        }
    }
}

Write-Host ""
Write-Host "=== Resultado: $ok subidos, $fail errores ===" -ForegroundColor Cyan
Write-Host "Presione Enter para cerrar..."
$null = Read-Host
