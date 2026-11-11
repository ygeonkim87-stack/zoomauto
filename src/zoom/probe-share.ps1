Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
"@
$A = [System.Windows.Automation.AutomationElement]
$root = $A::RootElement
$pids = @(Get-Process -Name Zoom | ForEach-Object Id)
function ZoomWindows { $root.FindAll('Children', [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $pids -contains $_.Current.ProcessId } }
$meet = ZoomWindows | Where-Object { $_.Current.ClassName -eq 'ConfMultiTabContentWndClass' } | Select-Object -First 1
if (-not $meet) { 'NO_MEETING'; exit 1 }
$h = [IntPtr]$meet.Current.NativeWindowHandle
[W]::ShowWindow($h, 9) | Out-Null
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 600
[System.Windows.Forms.SendKeys]::SendWait('%s')
Start-Sleep -Milliseconds 2500
foreach ($w in ZoomWindows) {
  "== WINDOW '$($w.Current.Name)' class=$($w.Current.ClassName)"
  $all = $w.FindAll('Descendants', [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) { if ($e.Current.Name) { "   [$($e.Current.ControlType.ProgrammaticName)] '$($e.Current.Name)' class=$($e.Current.ClassName)" } }
}
