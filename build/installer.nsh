!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "果蝇乐园.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "果蝇乐园造福版.exe" /T'
  nsExec::ExecToLog 'taskkill /F /FI "WINDOWTITLE eq 果蝇乐园*" /T'
!macroend
