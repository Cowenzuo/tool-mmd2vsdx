# Visio COM 探针：打开 vsdx，读取 Visio 重算后的实际单元格值（渲染真值）
# 用法：
#   Copy-Item resources/vsdx-output/04-er-1.vsdx temp/er-render-src.vsdx -Force
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs/开发经验日志/scripts/visio-probe.ps1 temp/er-render-src.vsdx
# 说明：
#   - 先复制再打开（避免锁住产物，重新生成时报 EBUSY）；
#   - 过滤 NameU 含 Entity/Attribute/Separator/Relationship 的形状，打印 Height/PinY；
#   - 结尾务必 Close/Quit；残留进程用 Get-Process VISIO | Stop-Process -Force 清理。
param(
    [Parameter(Mandatory = $true)][string]$Vsdx
)
$ErrorActionPreference = 'Continue'
$vsdxFull = (Resolve-Path $Vsdx).Path
$visio = New-Object -ComObject Visio.Application
$visio.Visible = $false
$visio.AlertResponse = 7
$doc = $visio.Documents.Open($vsdxFull)
$pages = $doc.Pages
$page = $pages.Item(1)
$shapes = $page.Shapes
Write-Output ("shapes=" + $shapes.Count)
for ($i = 1; $i -le $shapes.Count; $i++) {
    $shape = $shapes.Item($i)
    $nameU = ''
    try { $nameU = $shape.NameU } catch {}
    if ($nameU -notmatch 'Entity|Attribute|Separator|Relationship') { continue }
    $h = ''; $py = ''; $txt = ''
    try { $h = [math]::Round($shape.CellsU('Height').ResultIU, 6) } catch {}
    try { $py = [math]::Round($shape.CellsU('PinY').ResultIU, 6) } catch {}
    try { $txt = ($shape.Text -replace "`r|`n", ' ') } catch {}
    Write-Output ("{0,-30} H={1,-10} PinY={2,-10} '{3}'" -f $nameU, $h, $py, $txt)
}
$doc.Close()
$visio.Quit()
