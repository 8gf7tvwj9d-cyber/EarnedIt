Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\blief\Desktop\chore app\chorepay"
shell.Run Chr(34) & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & "C:\Users\blief\Desktop\chore app\chorepay\launch_earned.ps1" & Chr(34), 0, False
