# Zoom 창과 UI 요소를 접근성(UI Automation)으로 얼마나 볼 수 있는지 출력한다.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$zoomPids = @(Get-Process -Name Zoom -ErrorAction SilentlyContinue | ForEach-Object Id)
"Zoom 프로세스: $($zoomPids -join ', ')"
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($w in $wins) {
  if ($zoomPids -notcontains $w.Current.ProcessId) { continue }
  "== 창: '$($w.Current.Name)' class=$($w.Current.ClassName)"
  $all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  "   요소 수: $($all.Count)"
  $i = 0
  foreach ($e in $all) {
    if ($e.Current.Name -and $i -lt 60) {
      "   [$($e.Current.ControlType.ProgrammaticName)] '$($e.Current.Name)' id=$($e.Current.AutomationId)"
      $i++
    }
  }
}
