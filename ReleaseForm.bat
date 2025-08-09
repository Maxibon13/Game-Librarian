@echo off

call npm install
call npm run build
call npm run dist:win

p = input("Press Enter to continue...")