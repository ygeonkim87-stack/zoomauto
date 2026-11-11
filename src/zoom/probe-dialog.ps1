Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$A = [System.Windows.Automation.AutomationElement]
$cond = New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'ZPShareEntranceClass')
$dlg = $A::RootElement.FindFirst('Children', $cond)
if (-not $dlg) { 'NO_DIALOG'; exit 1 }
$r = $dlg.Current.BoundingRectangle
"dialog rect: $r"
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
function Dump($el, $depth) {
  if ($depth -gt 6) { return }
  $c = $walker.GetFirstChild($el)
  while ($c) {
    ('  ' * $depth) + "[$($c.Current.ControlType.ProgrammaticName)] '$($c.Current.Name)' class=$($c.Current.ClassName)"
    Dump $c ($depth + 1)
    $c = $walker.GetNextSibling($c)
  }
}
Dump $dlg 0
# 공유 창 닫기
$h = [IntPtr]$dlg.Current.NativeWindowHandle
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W2 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
[W2]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{ESC}')
Start-Sleep -Milliseconds 800
$still = $A::RootElement.FindFirst('Children', $cond)
"dialog closed: $(-not $still)"
