Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$barCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ProgressBar)
while ($true) {
  try {
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $top = $focused
    while ($null -ne $top) {
      $parent = $walker.GetParent($top)
      if ($null -eq $parent -or $parent -eq $root) { break }
      $top = $parent
    }
    $bar = if ($null -ne $top) { $top.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $barCondition) } else { $null }
    if ($null -ne $bar) {
      $pattern = $null
      if ($bar.TryGetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern, [ref]$pattern)) {
        $range = $pattern.Current
        $rect = $bar.Current.BoundingRectangle
        $span = $range.Maximum - $range.Minimum
        if ($span -gt 0 -and $rect.Width -ge 30 -and $rect.Height -gt 0 -and -not $bar.Current.IsOffscreen) {
          $percent = [Math]::Max(0, [Math]::Min(100, ($range.Value - $range.Minimum) / $span * 100))
          [Console]::WriteLine((@{ x = [int]$rect.X; y = [int]$rect.Y; width = [int]$rect.Width; height = [int]$rect.Height; percent = $percent } | ConvertTo-Json -Compress))
          Start-Sleep -Milliseconds 250
          continue
        }
      }
    }
  } catch { }
  [Console]::WriteLine('{}')
  Start-Sleep -Milliseconds 250
}
