param(
  [int]$Port = 4173,
  [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$stateFile = Join-Path -Path $rootPath -ChildPath "campaign-state.json"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
}

function Read-StateFile {
  if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
    return [System.IO.File]::ReadAllText($stateFile)
  }
  return "{}"
}

function Write-StateFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Json
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($stateFile, $Json, $encoding)
}

function Read-HttpLine {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.Stream]$Stream
  )

  $buffer = New-Object System.Collections.Generic.List[byte]
  while ($true) {
    $next = $Stream.ReadByte()
    if ($next -lt 0) {
      break
    }
    if ($next -eq 10) {
      break
    }
    if ($next -ne 13) {
      [void]$buffer.Add([byte]$next)
    }
  }

  if ($buffer.Count -eq 0 -and $next -lt 0) {
    return $null
  }

  return [System.Text.Encoding]::ASCII.GetString($buffer.ToArray())
}

function Read-HttpRequest {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.Sockets.TcpClient]$Client
  )

  $stream = $Client.GetStream()
  $requestLine = Read-HttpLine -Stream $stream
  if ([string]::IsNullOrWhiteSpace($requestLine)) {
    return $null
  }

  $parts = $requestLine.Split(" ")
  if ($parts.Count -lt 2) {
    return $null
  }

  $headers = @{}
  while ($true) {
    $line = Read-HttpLine -Stream $stream
    if ($null -eq $line) {
      break
    }
    if ($line.Length -eq 0) {
      break
    }
    $separator = $line.IndexOf(":")
    if ($separator -gt 0) {
      $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
      $value = $line.Substring($separator + 1).Trim()
      $headers[$name] = $value
    }
  }

  $body = ""
  if ($headers.ContainsKey("content-length")) {
    $length = 0
    if ([int]::TryParse($headers["content-length"], [ref]$length) -and $length -gt 0) {
      $bytes = New-Object byte[] $length
      $offset = 0
      while ($offset -lt $length) {
        $read = $stream.Read($bytes, $offset, $length - $offset)
        if ($read -le 0) {
          break
        }
        $offset += $read
      }
      $body = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $offset)
    }
  }

  $target = $parts[1]
  if ($target.Contains("?")) {
    $target = $target.Split("?", 2)[0]
  }

  return [pscustomobject]@{
    Method = $parts[0].ToUpperInvariant()
    Path = [System.Uri]::UnescapeDataString($target)
    Headers = $headers
    Body = $body
  }
}

function Write-HttpResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.Sockets.TcpClient]$Client,
    [Parameter(Mandatory = $true)]
    [int]$StatusCode,
    [Parameter(Mandatory = $true)]
    [byte[]]$Body,
    [Parameter(Mandatory = $true)]
    [string]$ContentType,
    [string]$StatusText = "OK"
  )

  $stream = $Client.GetStream()
  $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::ASCII, 1024, $true)
  $writer.NewLine = "`r`n"
  $writer.WriteLine("HTTP/1.1 $StatusCode $StatusText")
  $writer.WriteLine("Content-Type: $ContentType")
  $writer.WriteLine("Content-Length: $($Body.Length)")
  $writer.WriteLine("Connection: close")
  $writer.WriteLine("Cache-Control: no-store")
  $writer.WriteLine("")
  $writer.Flush()
  if ($Body.Length -gt 0) {
    $stream.Write($Body, 0, $Body.Length)
  }
}

function Write-TextResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.Sockets.TcpClient]$Client,
    [Parameter(Mandatory = $true)]
    [int]$StatusCode,
    [Parameter(Mandatory = $true)]
    [string]$Body,
    [string]$ContentType = "text/plain; charset=utf-8",
    [string]$StatusText = "OK"
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  Write-HttpResponse -Client $Client -StatusCode $StatusCode -Body $bytes -ContentType $ContentType -StatusText $StatusText
}

function Get-SharedStateJson {
  $payload = Read-StateFile
  if ([string]::IsNullOrWhiteSpace($payload)) {
    return "{}"
  }
  return $payload
}

function Save-SharedStateJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Json
  )

  Write-StateFile -Json $Json
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

$addresses = @()
try {
  $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
    Select-Object -ExpandProperty IPAddressToString
} catch {
  $addresses = @()
}

Write-Host "Serving $rootPath on http://0.0.0.0:$Port/"
if ($addresses.Count -gt 0) {
  Write-Host "LAN access:"
  $addresses | Sort-Object -Unique | ForEach-Object { Write-Host "  http://${_}:$Port/" }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $request = Read-HttpRequest -Client $client
      if ($null -eq $request) {
        Write-TextResponse -Client $client -StatusCode 400 -StatusText "Bad Request" -Body "Bad request"
        continue
      }

      if ($request.Path -eq "/api/state") {
        switch ($request.Method) {
          "GET" {
            Write-HttpResponse -Client $client -StatusCode 200 -Body ([System.Text.Encoding]::UTF8.GetBytes((Get-SharedStateJson))) -ContentType "application/json; charset=utf-8"
          }
          "PUT" {
            try {
              $incoming = if ([string]::IsNullOrWhiteSpace($request.Body)) { @{} } else { $request.Body | ConvertFrom-Json -ErrorAction Stop }
            } catch {
              Write-TextResponse -Client $client -StatusCode 400 -StatusText "Bad Request" -Body '{"error":"invalid json"}' -ContentType "application/json; charset=utf-8"
              continue
            }

            $existing = $null
            try {
              $existing = (Get-SharedStateJson) | ConvertFrom-Json -ErrorAction Stop
            } catch {
              $existing = $null
            }

            $incoming.revision = [Math]::Max(0, [int]($existing.revision)) + 1
            $incoming.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $json = $incoming | ConvertTo-Json -Depth 100
            Save-SharedStateJson -Json $json
            Write-HttpResponse -Client $client -StatusCode 200 -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8"
          }
          "POST" {
            Write-TextResponse -Client $client -StatusCode 405 -StatusText "Method Not Allowed" -Body "Method not allowed"
          }
          default {
            Write-TextResponse -Client $client -StatusCode 405 -StatusText "Method Not Allowed" -Body "Method not allowed"
          }
        }
        continue
      }

      $relativePath = $request.Path.TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $candidate = Join-Path -Path $rootPath -ChildPath $relativePath
      $resolvedPath = $null
      try {
        $resolvedPath = (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path
      } catch {
        $resolvedPath = $null
      }

      $isInsideRoot = $resolvedPath -and $resolvedPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)
      if (-not $isInsideRoot -or -not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        Write-TextResponse -Client $client -StatusCode 404 -StatusText "Not Found" -Body "Not found"
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      Write-HttpResponse -Client $client -StatusCode 200 -Body $bytes -ContentType $contentType
    } catch {
      try {
        Write-TextResponse -Client $client -StatusCode 500 -StatusText "Server Error" -Body "Server error"
      } catch {
        # ignore secondary failures
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
