# Zoom 화면 공유 자동화 (Zoom 7.x, Windows)
# 사용법: zoom-share.ps1 -Action probe|start|stop|status [-WindowTitle "수업 영상 플레이어"]
#  probe : 공유 창을 열고 OCR 결과만 출력한 뒤 닫는다 (클릭 없음)
#  start : 공유 창을 열고, 글자 인식으로 창·소리 공유·공유 버튼을 찾아 클릭한다
#  stop  : 공유 중이면 Alt+S로 공유를 멈춘다
#  status: Zoom 창 목록과 공유 여부를 출력한다
# 마지막 줄에 JSON 결과를 출력한다.
param(
  [ValidateSet('probe', 'start', 'stop', 'status')][string]$Action = 'probe',
  [string]$WindowTitle = 'ZOOMAUTO PLAYER'
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing, System.Runtime.WindowsRuntime
Add-Type @"
using System; using System.Runtime.InteropServices;
public class ZW {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  // 지정한 프로세스들의 '보이는' 최상위 창을 "핸들|클래스" 목록으로 돌려준다
  public static System.Collections.Generic.List<string> Visible(uint[] pids) {
    var set = new System.Collections.Generic.HashSet<uint>(pids);
    var r = new System.Collections.Generic.List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (set.Contains(p) && IsWindowVisible(h)) { var c = new System.Text.StringBuilder(256); GetClassName(h, c, 256); r.Add(h.ToInt64() + "|" + c); }
      return true; }, IntPtr.Zero);
    return r;
  }
  public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(2,0,0,0,IntPtr.Zero); mouse_event(4,0,0,0,IntPtr.Zero); }
}
"@
# 화면 배율(125%/150%)에서도 실제 픽셀 좌표를 쓰도록 DPI 인식 설정
[ZW]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

$A = [System.Windows.Automation.AutomationElement]
$Root = $A::RootElement

function Out-Result($obj) { $obj | ConvertTo-Json -Compress -Depth 5 }

function Get-ZoomWindows {
  $pids = @(Get-Process -Name Zoom -ErrorAction SilentlyContinue | ForEach-Object Id)
  @($Root.FindAll('Children', [System.Windows.Automation.Condition]::TrueCondition) |
    Where-Object { $pids -contains $_.Current.ProcessId })
}
# UI Automation의 창 목록은 가끔 창을 놓치므로 Win32로 찾은 핸들에서 요소를 만든다
function Find-ZoomWindow($class) {
  $w = Get-VisibleZoom | Where-Object { $_.class -eq $class } | Select-Object -First 1
  if (-not $w) { return $null }
  try { $A::FromHandle($w.handle) } catch { $null }
}

function Get-Rect($el) {
  $r = New-Object ZW+RECT
  [ZW]::GetWindowRect([IntPtr]$el.Current.NativeWindowHandle, [ref]$r) | Out-Null
  $r
}

function Focus-Window($el) {
  $h = [IntPtr]$el.Current.NativeWindowHandle
  if ([ZW]::IsIconic($h)) { [ZW]::ShowWindow($h, 9) | Out-Null }
  # Alt 키를 한 번 눌러 두면 다른 프로세스 창도 앞으로 가져올 수 있다
  [System.Windows.Forms.SendKeys]::SendWait('%')
  [ZW]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 500
}

# --- WinRT OCR ---
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$Scale = 2  # 작은 글자 인식률을 높이려고 2배 확대해서 읽는다

function Capture($rect) {
  $w = $rect.R - $rect.L; $h = $rect.B - $rect.T
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($rect.L, $rect.T, 0, 0, $bmp.Size)
  $g.Dispose()
  $bmp
}

# 파란 버튼 위 흰 글자도 읽도록 원본과 색 반전 이미지를 둘 다 읽는다
function Invoke-Ocr($rect) {
  $bmp = Capture $rect
  $w = $bmp.Width; $h = $bmp.Height
  $big = New-Object System.Drawing.Bitmap $bmp, ($w * $Scale), ($h * $Scale)
  $bmp.Dispose()
  $file1 = Join-Path $env:TEMP 'zoomauto-ocr.png'
  $big.Save($file1, [System.Drawing.Imaging.ImageFormat]::Png)

  $inv = New-Object System.Drawing.Bitmap $big.Width, $big.Height
  $g = [System.Drawing.Graphics]::FromImage($inv)
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix00 = -1; $cm.Matrix11 = -1; $cm.Matrix22 = -1; $cm.Matrix40 = 1; $cm.Matrix41 = 1; $cm.Matrix42 = 1
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetColorMatrix($cm)
  $g.DrawImage($big, (New-Object System.Drawing.Rectangle 0, 0, $big.Width, $big.Height), 0, 0, $big.Width, $big.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $g.Dispose(); $big.Dispose()
  $file2 = Join-Path $env:TEMP 'zoomauto-ocr-inv.png'
  $inv.Save($file2, [System.Drawing.Imaging.ImageFormat]::Png)
  $inv.Dispose()

  @(Read-Ocr $file1 $rect) + @(Read-Ocr $file2 $rect)
}

function Read-Ocr($file, $rect) {
  $sf = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file)) ([Windows.Storage.StorageFile])
  $stream = Await ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $sb = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  $res = Await ($engine.RecognizeAsync($sb)) ([Windows.Media.Ocr.OcrResult])
  $stream.Dispose()

  # 줄 단위 결과를 화면 좌표로 바꾼다. 한국어 OCR은 글자 사이를 띄어 읽기도 해서 공백 없는 텍스트도 함께 둔다.
  foreach ($line in $res.Lines) {
    $ws = @($line.Words)
    $x1 = ($ws | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
    $y1 = ($ws | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
    $x2 = ($ws | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
    $y2 = ($ws | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
    [pscustomobject]@{
      text = $line.Text
      compact = ($line.Text -replace '\s', '')
      x = [int]($rect.L + $x1 / $Scale); y = [int]($rect.T + $y1 / $Scale)
      w = [int](($x2 - $x1) / $Scale); h = [int](($y2 - $y1) / $Scale)
    }
  }
}

function Get-Distance([string]$a, [string]$b) {
  $prev = 0..$b.Length
  for ($i = 1; $i -le $a.Length; $i++) {
    $cur = @($i) + (1..$b.Length | ForEach-Object { 0 })
    for ($j = 1; $j -le $b.Length; $j++) {
      $cost = 1
      if ($a[$i - 1] -ceq $b[$j - 1]) { $cost = 0 }
      $del = $prev[$j] + 1
      $ins = $cur[$j - 1] + 1
      $sub = $prev[$j - 1] + $cost
      $cur[$j] = [Math]::Min([Math]::Min($del, $ins), $sub)
    }
    $prev = $cur
  }
  $prev[$b.Length]
}

# OCR이 글자를 조금 틀려도 찾도록 유사도로 비교한다 (대소문자 무시, 줄 안의 부분 문자열 포함)
function Find-Text($lines, [string[]]$patterns, [double]$minScore = 0.7) {
  $best = $null; $bestScore = 0
  foreach ($p in $patterns) {
    $pc = ($p -replace '\s', '').ToUpper()
    foreach ($l in $lines) {
      $t = $l.compact.ToUpper()
      if ($t.Contains($pc)) { $score = 1 }
      else {
        $score = 0
        # 줄 안에서 패턴 길이만큼 잘라 가며 가장 비슷한 부분을 찾는다
        $len = [Math]::Min($pc.Length, $t.Length)
        for ($s = 0; $s -le $t.Length - $len; $s++) {
          $sub = $t.Substring($s, $len)
          $sc = 1 - (Get-Distance $sub $pc) / $pc.Length
          if ($sc -gt $score) { $score = $sc }
        }
      }
      if ($score -gt $bestScore) { $bestScore = $score; $best = $l }
    }
  }
  if ($bestScore -ge $minScore) { $best } else { $null }
}

# 체크박스(글자 왼쪽)에 Zoom 파란색 픽셀이 있으면 체크된 것으로 본다
function Test-Checked($line) {
  $r = New-Object ZW+RECT
  # OCR이 체크박스를 글자로 읽어 줄에 포함하기도 하므로 글자 왼쪽~첫 글자 부근까지 넓게 본다
  $r.L = $line.x - 40; $r.R = $line.x + [int]($line.h * 2); $r.T = $line.y - 6; $r.B = $line.y + $line.h + 6
  $bmp = Capture $r
  $blue = 0
  for ($x = 0; $x -lt $bmp.Width; $x++) { for ($y = 0; $y -lt $bmp.Height; $y++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.B -gt 180 -and $c.R -lt 90 -and $c.G -lt 160) { $blue++ }
  } }
  $bmp.Dispose()
  $blue -gt 20
}
# '공유' 버튼은 다른 글자('소리 공유', '화면 공유' 등)에도 들어 있으므로 정확히 '공유'인 줄만 찾는다
function Find-ShareButton($lines, $dlgRect) {
  $hit = $lines | Where-Object { $_.compact -eq '공유' -or $_.compact -eq 'Share' } |
    Sort-Object y -Descending | Select-Object -First 1
  if ($hit) { return $hit }
  if (-not $dlgRect) { return $null }
  # OCR이 못 읽으면 공유 창 아래쪽 띠에서 Zoom 파란색 버튼 영역을 색으로 찾는다
  $strip = New-Object ZW+RECT
  $strip.L = $dlgRect.L; $strip.R = $dlgRect.R
  $strip.T = $dlgRect.B - [int](($dlgRect.B - $dlgRect.T) * 0.12); $strip.B = $dlgRect.B
  $bmp = Capture $strip
  # 줄마다 가장 긴 연속 파란 구간을 찾고, 그중 가장 긴 줄을 버튼으로 본다 (작은 아이콘은 제외됨)
  $best = $null; $bestLen = 0
  for ($y = 0; $y -lt $bmp.Height; $y += 2) {
    $run = 0; $start = 0
    for ($x = 0; $x -lt $bmp.Width; $x += 2) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.B -gt 200 -and $c.R -lt 60 -and $c.G -gt 80 -and $c.G -lt 150) {
        if ($run -eq 0) { $start = $x }
        $run += 2
        if ($run -gt $bestLen) { $bestLen = $run; $best = @{ x = $start; y = $y } }
      } else { $run = 0 }
    }
  }
  $bmp.Dispose()
  # 버튼으로 볼 만큼 긴 파란 구간이 있어야 한다
  if ($bestLen -lt 80) { return $null }
  [pscustomobject]@{ text = '(파란 공유 버튼)'; compact = ''; x = $strip.L + $best.x; y = $strip.T + $best.y - 2; w = $bestLen; h = 4 }
}

$ShareDialogClass = 'ZPShareEntranceClass'

function Open-ShareDialog {
  $dlg = Find-ZoomWindow $ShareDialogClass
  if ($dlg) { return $dlg }
  $meet = Find-ZoomWindow 'ConfMultiTabContentWndClass'
  if (-not $meet) { throw 'NO_MEETING' }
  # 다른 창에 포커스를 뺏기면 단축키가 안 먹으므로 최대 3번 시도한다
  for ($try = 0; $try -lt 3; $try++) {
    Focus-Window $meet
    [System.Windows.Forms.SendKeys]::SendWait('%s')
    for ($i = 0; $i -lt 12; $i++) {
      Start-Sleep -Milliseconds 250
      $dlg = Find-ZoomWindow $ShareDialogClass
      if ($dlg) { Start-Sleep -Milliseconds 700; return $dlg }
    }
  }
  throw 'SHARE_DIALOG_NOT_OPENED'
}

function Close-ShareDialog {
  $dlg = Find-ZoomWindow $ShareDialogClass
  if ($dlg) { Focus-Window $dlg; [System.Windows.Forms.SendKeys]::SendWait('{ESC}') }
}

# 공유 중이면 회의 창과 다른 Zoom 창(공유 툴바 등)이 생긴다. 실제 판정 기준은 status로 확인해 정한다.
# Zoom 7.1.9에서 확인: 공유 중에는 'ZPFloatToolbarClass'(화면 공유 회의 컨트롤) 창이 생긴다
# '새 공유' 창이 떠 있는 동안에는 툴바가 숨겨지므로 주석 창(ZoomAnnoWindowWndClass)도 함께 본다
$SharingClasses = @('ZPFloatToolbarClass', 'ZoomAnnoWindowWndClass')
# 보이는 Zoom 창을 Win32로 직접 센다 (UI Automation은 공유 툴바를 놓칠 때가 있다)
function Get-VisibleZoom {
  $pids = [uint32[]]@(Get-Process -Name Zoom -ErrorAction SilentlyContinue | ForEach-Object Id)
  if (-not $pids.Count) { return @() }
  @([ZW]::Visible($pids) | ForEach-Object { $p = $_.Split('|'); [pscustomobject]@{ handle = [IntPtr][int64]$p[0]; class = $p[1] } })
}
function Test-Sharing {
  [bool](Get-VisibleZoom | Where-Object { $SharingClasses -contains $_.class })
}
function Get-HandleRect($h) { $r = New-Object ZW+RECT; [ZW]::GetWindowRect($h, [ref]$r) | Out-Null; $r }

try {
  switch ($Action) {
    'status' {
      $list = @(Get-VisibleZoom | ForEach-Object { $_.class })
      $list | ForEach-Object { "  $_" }
      Out-Result @{ ok = $true; sharing = (Test-Sharing); windows = $list }
    }
    'probe' {
      $dlg = Open-ShareDialog
      $rect = Get-Rect $dlg
      $lines = @(Invoke-Ocr $rect)
      $lines | ForEach-Object { "  ($($_.x),$($_.y)) '$($_.text)'" }
      $win = Find-Text $lines @($WindowTitle)
      $sound = Find-Text $lines @('소리 공유', 'Share sound')
      $btn = Find-ShareButton $lines $rect
      $found = @{
        window = $(if ($win) { "$($win.text) @ $($win.x),$($win.y)" })
        sound  = $(if ($sound) { "$($sound.text) @ $($sound.x),$($sound.y) checked=$(Test-Checked $sound)" })
        button = $(if ($btn) { "$($btn.text) @ $($btn.x),$($btn.y)" })
      }
      Close-ShareDialog
      Out-Result @{ ok = $true; found = $found; lineCount = $lines.Count }
    }
    'start' {
      if (Test-Sharing) { Out-Result @{ ok = $true; sharing = $true; note = 'ALREADY_SHARING' }; break }
      $dlg = Open-ShareDialog
      $rect = Get-Rect $dlg
      $lines = @(Invoke-Ocr $rect)
      $win = Find-Text $lines @($WindowTitle)
      if (-not $win) { Close-ShareDialog; throw 'PLAYER_WINDOW_NOT_FOUND' }
      # 창 이름 글자는 썸네일 아래에 있으므로 이름을 클릭하면 그 창이 선택된다
      Focus-Window $dlg
      [ZW]::Click($win.x + [int]($win.w / 2), $win.y + [int]($win.h / 2))
      Start-Sleep -Milliseconds 500

      $lines = @(Invoke-Ocr $rect)
      $sound = Find-Text $lines @('소리 공유', 'Share sound')
      $btn = Find-ShareButton $lines $rect
      if (-not $btn) { Close-ShareDialog; throw 'SHARE_BUTTON_NOT_FOUND' }
      if (-not $sound) { Close-ShareDialog; throw 'SOUND_OPTION_NOT_FOUND' }
      $soundClicked = $false
      if (-not (Test-Checked $sound)) {
        # 라벨 글자를 누르면 체크가 바뀐다. 줄 가운데(글자 위)를 누른 뒤 색으로 결과를 확인한다.
        [ZW]::Click($sound.x + [int]($sound.w / 2), $sound.y + [int]($sound.h / 2))
        $soundClicked = $true
        Start-Sleep -Milliseconds 400
        if (-not (Test-Checked $sound)) { Close-ShareDialog; throw 'SOUND_CHECK_FAILED' }
      }
      # '비디오 공유에 최적화'도 체크한다 (영상 끊김 방지). 실패해도 공유는 계속 진행한다.
      $optimized = $false
      $opt = Find-Text $lines @('비디오 공유에 최적화', 'Optimize for video sharing')
      if ($opt) {
        if (-not (Test-Checked $opt)) {
          # 줄 끝의 (?) 도움말 아이콘을 피하려고 글자 앞쪽 1/3 지점을 누른다
          [ZW]::Click($opt.x + [int]($opt.w / 3), $opt.y + [int]($opt.h / 2))
          Start-Sleep -Milliseconds 400
        }
        $optimized = [bool](Test-Checked $opt)
      }
      [ZW]::Click($btn.x + [int]($btn.w / 2), $btn.y + [int]($btn.h / 2))
      # 비디오 최적화를 켜면 공유 시작이 느려질 수 있어 최대 20초까지 기다린다
      for ($i = 0; $i -lt 66; $i++) {
        Start-Sleep -Milliseconds 300
        if (Test-Sharing) { break }
      }
      $sharing = Test-Sharing
      Out-Result @{ ok = $sharing; sharing = $sharing; soundClicked = $soundClicked; optimized = $optimized; error = $(if ($sharing) { $null } else { 'SHARE_NOT_CONFIRMED' }) }
    }
    'stop' {
      if (-not (Test-Sharing)) { Out-Result @{ ok = $true; sharing = $false; note = 'NOT_SHARING' }; break }
      # 이전 시도로 '새 공유' 창이 열려 있으면 먼저 닫는다 (닫아야 공유 툴바가 다시 나타난다)
      if (Find-ZoomWindow $ShareDialogClass) {
        Close-ShareDialog
        for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Milliseconds 250; if (Find-ZoomWindow 'ZPFloatToolbarClass') { break } }
      }
      $method = 'none'
      # 1) 공유 툴바의 [공유 중지] 버튼을 글자 인식으로 찾아 누른다
      foreach ($w in (Get-VisibleZoom | Where-Object { $_.class -match 'Tool[Bb]ar' })) {
        $r = Get-HandleRect $w.handle
        if (($r.R - $r.L) -lt 50 -or ($r.B - $r.T) -lt 10) { continue }
        $lines = @(Invoke-Ocr $r)
        $stopBtn = Find-Text $lines @('공유 중지', 'Stop share') 0.6
        if ($stopBtn) {
          [ZW]::Click($stopBtn.x + [int]($stopBtn.w / 2), $stopBtn.y + [int]($stopBtn.h / 2))
          $method = 'button'
          for ($i = 0; $i -lt 16; $i++) { Start-Sleep -Milliseconds 250; if (-not (Test-Sharing)) { break } }
          break
        }
      }
      # 2) 그래도 공유 중이면 Alt+S를 시도하고, '새 공유' 창이 열리면 닫는다
      if (Test-Sharing) {
        $bar = Find-ZoomWindow 'ZPFloatToolbarClass'
        if ($bar) { Focus-Window $bar }
        [System.Windows.Forms.SendKeys]::SendWait('%s')
        $method = 'hotkey'
        for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Milliseconds 250; if (Find-ZoomWindow $ShareDialogClass) { break } }
        if (Find-ZoomWindow $ShareDialogClass) { Close-ShareDialog; Start-Sleep -Milliseconds 500 }
      }
      $sharing = Test-Sharing
      Out-Result @{ ok = (-not $sharing); sharing = $sharing; method = $method }
    }
  }
} catch {
  Out-Result @{ ok = $false; error = "$($_.Exception.Message)" }
  exit 1
}
