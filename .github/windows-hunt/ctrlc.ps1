# Sends Ctrl+C to the console of process $Target, the way a person presses Ctrl+C in that window. Runs in its own process.
param([int]$Target)
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Con {
  [DllImport("kernel32.dll")] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint p);
  [DllImport("kernel32.dll")] public static extern bool SetConsoleCtrlHandler(IntPtr h, bool add);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(uint e, uint g);
}
'@
[Con]::FreeConsole() | Out-Null
if (-not [Con]::AttachConsole([uint32]$Target)) { exit 2 }
[Con]::SetConsoleCtrlHandler([IntPtr]::Zero, $true) | Out-Null
if (-not [Con]::GenerateConsoleCtrlEvent(0, 0)) { exit 3 }
Start-Sleep -Seconds 3
exit 0
