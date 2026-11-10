CUSTOM HOLIDAYS - VIDEO STUDIO ON THE MAIN PC
=============================================

The Creatives page makes PICTURES in the cloud (always available) and VIDEOS on the main
office PC with ComfyUI, because videos need its graphics card. This folder connects that PC
to the dashboard with a permanent address that never changes.

  Dashboard (Render) --> permanent address --> gate (checks the key) --> ComfyUI on this PC

ONE-TIME SETUP ON THE MAIN PC
1. Make sure ComfyUI works on this PC on its own: open it, load the LTX video workflow and
   make one test video. (The dashboard uses the same models.)
2. Copy this "video-studio" folder somewhere permanent, e.g. C:\CustomHolidays\video-studio
3. Open start-video-studio.bat in Notepad and check COMFY_DIR is the ComfyUI folder. Save.
4. Install Tailscale from https://tailscale.com/download and sign in with the company
   Google account (customh.automation@gmail.com).
5. Double-click start-video-studio.bat. The first time, Tailscale may open a web page asking
   to allow "Funnel" - click Allow, then run start-video-studio.bat again.
6. Open Command Prompt and type:   tailscale funnel status
   It shows the permanent address, like https://main-pc.tail1234.ts.net
7. Open dashboard-key.txt in this folder and copy the key.
8. In Render > Custom-Holidays > Environment, add:
     COMFY_URL = the address from step 6
     COMFY_KEY = the key from step 7
   Save. Render restarts the server on its own.
9. Double-click install-autostart.bat so it all starts when the PC is switched on.
10. Open the Creatives page: the top bar should say "Video studio online".

PREFER NGROK? (what was used before)
  ngrok also gives one free permanent address, but the free plan allows only 1 GB of data a
  month, which is roughly 50-100 videos. Install ngrok, run "ngrok config add-authtoken ...",
  then put your free address in NGROK_URL inside start-video-studio.bat and use
  https://<that address> as COMFY_URL on Render.

GOOD TO KNOW
- The main PC has to be on, signed in, and not asleep for videos to work. Pictures work anyway.
- Nobody can use ComfyUI through the address without the key in dashboard-key.txt.
- If the key ever leaks, delete dashboard-key.txt, run start-video-studio.bat again (it makes
  a new key) and update COMFY_KEY on Render.
