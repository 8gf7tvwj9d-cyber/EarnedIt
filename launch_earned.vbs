Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appRoot = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appRoot
shell.Run Chr(34) & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & appRoot & "\launch_earned.ps1" & Chr(34), 0, False
