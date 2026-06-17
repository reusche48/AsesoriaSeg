# ============================================================
# Script de Deploy - Sube archivos a Git y luego al servidor FTP
# Uso: .\deploy.ps1          → commit+push git + sube TODOS los archivos FTP
#      .\deploy.ps1 rapido   → commit+push git + sube solo archivos modificados en las últimas 2 horas
# ============================================================

$FTP_HOST = "ftp://107.180.115.202"
$FTP_USER = "subeppk@sitemasperu.com"
$FTP_PASS = "Aa@33590728"
$REMOTE_PATH = ""

# Carpetas y archivos a EXCLUIR del FTP (no van al servidor)
$excludeDirs = @("node_modules", ".git", ".kiro", ".vscode", "database", "src\tests")
$excludeFiles = @("package.json", "package-lock.json", "vitest.config.js", "deploy.ps1", "AsesoriaSeg.code-workspace", "diagrama_bd.html", "serve.cjs")

$modo = $args[0]
$horasAtras = 2

# ============================================================
# PASO 1: GIT — commit y push
# ============================================================
Write-Host ""
Write-Host "=== PASO 1: GIT ===" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot

# NOTA: El cache-busting con ?v= se eliminó a propósito.
# Agregar ?v= al <script src="src/app.js"> hacía que app.js se cargara
# DOS veces (con y sin query, porque los módulos internos importan
# '../app.js' sin query), creando dos instancias de la app y duplicando
# los listeners. Ahora la caché la gestiona .htaccess (no-cache + revalidate).

# Verificar si hay cambios para commitear
$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
    $commitMsg = "Deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    Write-Host "  Archivos modificados detectados:" -ForegroundColor White
    git status --short
    Write-Host ""

    git add -A
    if (-not $?) {
        Write-Host "  ERROR en git add" -ForegroundColor Red
    } else {
        git commit -m $commitMsg
        if (-not $?) {
            Write-Host "  ERROR en git commit" -ForegroundColor Red
        } else {
            Write-Host ""
            git push origin main
            if ($?) {
                Write-Host "  Git push OK -> main" -ForegroundColor Green
            } else {
                Write-Host "  ERROR en git push (continuando con FTP...)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  Sin cambios en Git, nada que commitear." -ForegroundColor Gray
    # Push por si hay commits locales sin subir
    git push origin main 2>&1 | Out-Null
}

Write-Host ""

# ============================================================
# PASO 2: FTP — subir archivos al servidor
# ============================================================
if ($modo -eq "rapido") {
    Write-Host "=== PASO 2: FTP RAPIDO (ultimos $horasAtras horas) ===" -ForegroundColor Cyan
} else {
    Write-Host "=== PASO 2: FTP COMPLETO ===" -ForegroundColor Cyan
}
Write-Host ""

$allFiles = Get-ChildItem -Path $projectRoot -Recurse -File

$filesToUpload = $allFiles | Where-Object {
    $relativePath = $_.FullName.Substring($projectRoot.Length + 1)
    $skip = $false

    foreach ($dir in $excludeDirs) {
        if ($relativePath.StartsWith("$dir\") -or $relativePath.StartsWith("$dir/")) {
            $skip = $true; break
        }
    }

    if ($excludeFiles -contains $_.Name) { $skip = $true }
    # Omitir dotfiles EXCEPTO .htaccess (necesario en el servidor para control de caché)
    if (($_.Name.StartsWith(".") -and $_.Name -ne ".htaccess") -or $_.Name -eq ".gitkeep") { $skip = $true }

    if ($modo -eq "rapido" -and !$skip) {
        $limite = (Get-Date).AddHours(-$horasAtras)
        if ($_.LastWriteTime -lt $limite) { $skip = $true }
    }

    -not $skip
}

if ($filesToUpload.Count -eq 0) {
    Write-Host "No hay archivos para subir al FTP." -ForegroundColor Yellow
} else {
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
            try {
                $parentDir = [System.IO.Path]::GetDirectoryName($relativePath) -replace '\\','/'
                if ($parentDir) {
                    $ftpDir = "$FTP_HOST$REMOTE_PATH/$parentDir/"
                    $req = [System.Net.FtpWebRequest]::Create($ftpDir)
                    $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
                    $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
                    $req.GetResponse() | Out-Null
                }
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
    Write-Host "=== FTP: $ok subidos, $fail errores ===" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Deploy finalizado ===" -ForegroundColor Green
Write-Host ""
