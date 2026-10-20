# 좋아회 — 로컬 미리보기 서버 (윈도우, 설치할 것 없음)
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#
# 그다음 브라우저에서 http://localhost:8731 을 엽니다. 멈출 때는 Ctrl+C.

param([int]$Port = 8731)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

$types = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"
  ".js"="text/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8"
  ".webmanifest"="application/manifest+json; charset=utf-8"; ".svg"="image/svg+xml"
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".webp"="image/webp"
  ".ico"="image/x-icon"; ".md"="text/plain; charset=utf-8"; ".sql"="text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "포트 $Port 을 열 수 없습니다. 다른 포트로: .\serve.ps1 -Port 8732" -ForegroundColor Red
  exit 1
}
Write-Host "좋아회 → http://localhost:$Port  (Ctrl+C 로 종료)" -ForegroundColor Green

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $path = Join-Path $Root $rel

    # 폴더 밖으로 나가는 경로 차단
    $full = [System.IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($Root))) {
      $ctx.Response.StatusCode = 403
      $ctx.Response.OutputStream.Close()
      continue
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $types[$ext]
      if (-not $ct) { $ct = "application/octet-stream" }
      $ctx.Response.ContentType = $ct
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $ctx.Response.StatusCode = 200
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes("404 $rel")
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
