' ARAM 내전 오버레이 - 콘솔 창 없이 실행하는 런처
' (검은 도스창 안 뜸. 끄려면: 트레이 아이콘 우클릭 - 종료)
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = appDir
exePath = appDir & "\node_modules\electron\dist\electron.exe"
sh.Run """" & exePath & """ .", 0, False
