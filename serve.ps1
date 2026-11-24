# Server chạy thử trên máy: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
# - Phục vụ web tĩnh tại http://localhost:<Port>/
# - Cho trang quản trị (/admin) lưu thẳng vào file: PUT /__save?path=...
#   Chỉ cho phép ghi data/content.json và ảnh trong images/uploads/.
param([int]$Port = 8080)
$root = $PSScriptRoot
$types = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
            ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".webp"="image/webp"; ".gif"="image/gif";
            ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".json"="application/json; charset=utf-8"; ".md"="text/plain; charset=utf-8" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Dang chay tai http://localhost:$Port/  (trang quan tri: http://localhost:$Port/admin/)  Ctrl+C de dung"

function Send-Text($ctx, [int]$code, [string]$text) {
  $ctx.Response.StatusCode = $code
  $b = [Text.Encoding]::UTF8.GetBytes($text)
  $ctx.Response.ContentType = "text/plain; charset=utf-8"
  $ctx.Response.OutputStream.Write($b, 0, $b.Length)
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $req = $ctx.Request
    $urlPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

    if ($urlPath -eq "/__save") {
      $rel = $req.QueryString["path"]
      $okPath = ($req.HttpMethod -eq "PUT") -and $rel -and (
        $rel -eq "data/content.json" -or $rel -match '^images/uploads/[A-Za-z0-9._-]+\.(webp|jpg|jpeg|png|gif|svg|bmp)$')
      if (-not $okPath) { Send-Text $ctx 403 "Khong duoc phep ghi duong dan nay"; continue }
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $file.StartsWith($root)) { Send-Text $ctx 403 "Sai duong dan"; continue }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
      $tmp = "$file.tmp"
      $fs = [IO.File]::Create($tmp)
      try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
      Move-Item -Force $tmp $file
      Write-Host "Da luu $rel"
      Send-Text $ctx 200 "ok"
      continue
    }

    $path = $urlPath.TrimStart('/')
    if ($path -eq "" -or $path.EndsWith("/")) { $path = $path + "index.html" }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } elseif ((Test-Path (Join-Path $root $path) -PathType Container)) {
      $ctx.Response.Redirect("/" + $path.TrimEnd('/') + "/")
    } else {
      Send-Text $ctx 404 "Khong tim thay"
    }
  } catch {
    Write-Host "Loi: $_"
    try { Send-Text $ctx 500 "Loi may chu" } catch {}
  } finally {
    $ctx.Response.Close()
  }
}
