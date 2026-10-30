' guncelle.bat'i pencere acmadan calistirir (zamanlanmis gorevler icin).
' Kullanim: wscript gizli_calistir.vbs canli   ya da   wscript gizli_calistir.vbs sessiz
Set fso = CreateObject("Scripting.FileSystemObject")
klasor = fso.GetParentFolderName(WScript.ScriptFullName)
mod = "sessiz"
If WScript.Arguments.Count > 0 Then mod = WScript.Arguments(0)
CreateObject("WScript.Shell").Run """" & klasor & "\guncelle.bat"" " & mod, 0, True
