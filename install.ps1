# Puts a `copycmd` shim in ~/.local/bin (on PATH) that runs copycmd.py from this repo.
$bin = Join-Path $HOME ".local\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
$script = Join-Path $PSScriptRoot "copycmd.py"
Set-Content -Path (Join-Path $bin "copycmd.cmd") -Value "@python `"$script`" %*" -Encoding ascii
# Git Bash (also Claude Code's `! copycmd`) does not run .cmd files by bare name.
$posix = $script -replace '\\', '/'
[IO.File]::WriteAllText((Join-Path $bin "copycmd"), "#!/bin/sh`nexec python `"$posix`" `"`$@`"`n")
Write-Host "Installed $bin\copycmd.cmd -> $script"
