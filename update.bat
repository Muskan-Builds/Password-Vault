@echo off
set /p msg="Enter update message (e.g. Added FaceID): "
git add .
git commit -m "%msg%"
git push
echo --------------------------------------
echo Done! Your app is updating on Netlify.
pause
