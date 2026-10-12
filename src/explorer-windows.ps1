$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject Shell.Application
$items = @()
foreach ($w in @($shell.Windows())) {
  if (-not $w) { continue }
  $fn = ''
  try { $fn = [string]$w.FullName } catch {}
  if ($fn -notmatch 'explorer') { continue }
  $path = ''
  try { $path = [string]$w.Document.Folder.Self.Path } catch {}
  $url = ''
  try { $url = [string]$w.LocationURL } catch {}
  $hwnd = 0
  try { $hwnd = [int64]$w.HWND } catch {}
  if ($hwnd -ne 0) {
    $items += [pscustomobject]@{ hwnd = $hwnd; path = $path; url = $url }
  }
}
if ($items.Count -eq 0) { '[]'; exit 0 }
$items | ConvertTo-Json -Compress
