/**
 * helpContent.ts — the words of the Help Center.
 * Staff guide: how to use each page. Company guide: how the dashboard is run (owner only).
 * To change the help text, edit this file. Each section's `id` is what the ? button links to.
 */
export type HelpSection = {
  id: string;
  group: string;
  title: string;
  route?: string;          // page the section is about; the ? button on that page opens this section
  intro: string;
  steps?: string[];        // numbered steps
  points?: { label: string; text: string }[]; // label + explanation rows
  tips?: string[];
  diagram?: "system";
};

export const STAFF: HelpSection[] = [
  {
    id: "getting-started", group: "Start here", title: "Getting started",
    intro: "The dashboard is where the whole team works: clients, trips, vouchers, suppliers and team chat, all in one place. It opens in any browser at custom-holidays.vercel.app.",
    steps: [
      "Sign in with your work email and password. New here? Click Sign up, enter your name, email and a password, then click the link in the confirmation email.",
      "The sidebar on the left has every page, grouped by area. Click the panel icon at the top left to fold it away.",
      "The bar at the top has search, light or dark mode, refresh, notifications and your initials, which open your Profile.",
      "The round CH button in the bottom right corner opens CH Assistant. Ask it anything about clients, trips or suppliers, or attach a document to ask about.",
      "Every page has a ? button at the top. It opens the part of this guide for that page.",
    ],
    tips: [
      "Forgot your password? On the sign-in screen, click Forgot password. The email has a link that lets you choose a new one.",
      "If a page says 'Waking up the server', wait. After a quiet spell the server takes up to a minute to start, then everything is fast again.",
    ],
  },
  {
    id: "notifications", group: "Start here", title: "Notifications",
    intro: "The bell at the top shows what needs you: new chat messages and mentions, new leads, and trips leaving soon or coming back today.",
    steps: [
      "Click the bell to see the list. Click an item to open it.",
      "Mark all read clears the red count.",
      "To get alerts on your computer even when the dashboard is closed, open your Profile and click Turn on under Desktop notifications, then click Allow in the browser.",
    ],
    tips: ["Desktop alerts are set up per computer and per browser. Turn them on again on each computer you use."],
  },
  {
    id: "overview", group: "Every day", title: "Overview", route: "/",
    intro: "The first page you see. A snapshot of leads, revenue this month, active suppliers and recent activity.",
    points: [
      { label: "Top figures", text: "Total leads, revenue so far this month, conversion rate and active suppliers." },
      { label: "Lead pipeline", text: "How many leads are at each stage, from new to booked." },
      { label: "Recent activity", text: "The latest changes across the dashboard." },
    ],
  },
  {
    id: "leads", group: "Lead Analytics", title: "Master CRM", route: "/leads",
    intro: "Every client and lead in one place, with their trips, documents and notes.",
    steps: [
      "Use the tabs to switch between All clients, Leads, Booked and Past travellers.",
      "Type in the search box to find someone by name, phone or trip.",
      "Click a row to open their record on the right: contact details, trips, documents and the latest note.",
      "To add someone, click + New client, fill in the details and save.",
    ],
    tips: ["Have a spreadsheet of leads or a business card? Click Import at the top of the page."],
  },
  {
    id: "web-analytics", group: "Lead Analytics", title: "Web Analytics", route: "/web-analytics",
    intro: "Where enquiries come from: website, Google, Meta ads, WhatsApp and referrals, week by week.",
    tips: ["Website visitor numbers appear once Google Analytics is connected in Profile → Connections."],
  },
  {
    id: "meta-analytics", group: "Lead Analytics", title: "Meta Analytics", route: "/meta-analytics",
    intro: "Leads from Instagram and Facebook ads: how many came in, from which form, and how many went on to book.",
  },
  {
    id: "itineraries", group: "Operations", title: "Itineraries", route: "/itineraries",
    intro: "Every itinerary PDF made in Claude, in one place, plus the prompt to make a new one.",
    steps: [
      "The first time, click Choose the folder and pick the folder on your computer where itinerary PDFs are saved. The dashboard remembers it on this computer.",
      "Click any itinerary to open it.",
      "To make a new one, click Sample prompt (client hasn't booked) or Detailed prompt (client has booked), fill in what you know, click Copy prompt and paste it into Claude.",
    ],
    tips: ["The folder is remembered per computer. On a new computer, choose it once again."],
  },
  {
    id: "price-compare", group: "Operations", title: "Price Compare", route: "/price-compare",
    intro: "Compare hotel prices across suppliers and booking sites for the same dates, rooms and meals.",
    steps: [
      "Enter the trip or client, the city and hotel, check-in and check-out, and the number of adults and children.",
      "Add the price from each source. With the Grab-price Chrome extension installed, prices are read straight from the booking site.",
      "Pick the best option and click Confirm price. Download Excel gives you the costing sheet.",
    ],
    tips: ["Always check the cancellation policy and meals before confirming. A cheaper rate is often non-refundable."],
  },
  {
    id: "quotes", group: "Operations", title: "Quote Generator", route: "/quotes",
    intro: "Make a clean, branded quote for a client: package, prices, tax, discount and terms.",
    steps: [
      "Fill in the client details and the trip.",
      "Add each item with its price. Add GST and any discount.",
      "Check the summary, click Save quote, then Download PDF to share it with the client.",
    ],
    tips: ["Quotes are valid for 7 days unless you change the note."],
  },
  {
    id: "vouchers", group: "Operations", title: "Voucher Generator", route: "/vouchers",
    intro: "Turn supplier confirmations into branded vouchers and a complete trip folder.",
    steps: [
      "Choose the client and trip at the top.",
      "Drop in all the confirmations at once: hotel, transfer, tour and flight. PDF, image or saved email all work. Each one is read and becomes a voucher, in day order.",
      "Check each voucher. Anything shown in red needs a quick look, such as meals or a missing date. Click a voucher to fix it, or Type a voucher in to add one by hand.",
      "Click Make vouchers to see the preview. Download each PDF, or download the whole trip folder as a .zip.",
      "If Google Drive or a PC folder is connected, the trip folder is saved there too.",
    ],
    tips: ["Read every voucher once before sending it. The details are read automatically and can occasionally be wrong."],
  },
  {
    id: "chat", group: "Operations", title: "Team Chat", route: "/chat",
    intro: "Chat with the team, like WhatsApp: groups, direct messages, photos, videos, files and voice notes.",
    steps: [
      "Pick a chat on the left, or start a new group or direct message from the top of the list.",
      "Type and press Enter to send. Shift + Enter starts a new line. Type @ and a name to mention someone.",
      "Click the paperclip to send photos, videos or files. Several photos are sent together as an album.",
      "Hover over a message and click the small arrow in its corner for more: reply, react, forward, star, pin, copy, edit, delete or info.",
    ],
    points: [
      { label: "Edit", text: "Your own messages, within 15 minutes of sending." },
      { label: "Delete for everyone", text: "Your own messages, within 48 hours. Delete for me works on any message." },
      { label: "Ticks", text: "One tick means sent, two grey ticks means some people have read it, two blue ticks means everyone has." },
    ],
  },
  {
    id: "automations", group: "Operations", title: "Automations", route: "/automations",
    intro: "Jobs that run on their own, such as replying to new leads, daily digests and review requests. Each card shows what it does and whether it is running.",
    tips: ["Anything that goes out to a client waits for your approval first."],
  },
  {
    id: "trips", group: "Trips", title: "Active Trips", route: "/trips",
    intro: "Every booked trip on one board, in four columns: Preparing, Ready to go, Travelling now and Just back.",
    steps: [
      "Trips move between columns on their own as the dates pass.",
      "Each card shows what is left to do, such as vouchers to make or an itinerary to send.",
      "Click New trip to add a trip.",
    ],
  },
  {
    id: "suppliers", group: "Suppliers", title: "Suppliers", route: "/suppliers",
    intro: "Every DMC, hotel and partner, found automatically in the company Gmail, with their rates and emails.",
    steps: [
      "Use the type chips to filter: DMC, Hotel, Transport, Activity and more. Search finds a name, place, email or contact.",
      "The list shows 50 at a time. Use the arrows at the bottom to move between pages, and Sort to put the latest emails, most rates or A–Z first.",
      "Click a supplier to see their details and rates, and to edit them.",
      "Gmail is checked on its own every 5 minutes. Click Check Gmail now to check straight away, and Activity to watch it happen and see the recent emails it read.",
      "Needs review lists contacts with no clear type and no rates. Choose a type to keep one, or click Not a supplier to hide it. Nothing is deleted.",
      "Click Add supplier to add one by hand.",
    ],
    points: [
      { label: "Teal dot in Recent emails", text: "Rates were saved from that email." },
      { label: "Gold dot", text: "A supplier email was read, such as a booking confirmation, but had no prices." },
      { label: "Grey dot", text: "Skipped: newsletters, app notifications, invites, auto-replies and personal emails." },
    ],
    tips: ["If the status bar says Gmail isn't connected, the owner needs to connect it in Profile → Connections."],
  },
  {
    id: "active-deals", group: "Suppliers", title: "Active Deals", route: "/active-deals",
    intro: "Track partnerships and negotiations with suppliers: deal type, value, commission and dates.",
    steps: ["Click New Deal, enter the supplier, type, value and dates, and save.", "Click the pencil on a deal to edit it."],
  },
  {
    id: "campaign-design", group: "Marketing", title: "Campaigns", route: "/campaign-design",
    intro: "Plan outreach to leads or suppliers: who to contact, on which channel, and the messages to send.",
    steps: ["Choose a campaign for leads or for suppliers.", "Give it a name, pick the channel and add the steps.", "Draft messages are prepared for you to review before anything is sent."],
  },
  {
    id: "content", group: "Marketing", title: "Content", route: "/content",
    intro: "Write social posts, blogs and captions about destinations and trips, using Custom Holidays' own details.",
    steps: ["Pick what to make, such as a post, caption or blog.", "Choose whether to use Custom Holidays' own data, and add the destination or topic.", "Create it, then edit and copy the result."],
  },
  {
    id: "creatives", group: "Marketing", title: "Creatives", route: "/creatives",
    intro: "Make pictures and short videos for social media. Pictures are made in the cloud and always work. Videos are made on the office's main PC, so they work while that PC is on. The bar at the top says which is available.",
    points: [
      { label: "Picture", text: "Describe it, pick a shape (Story, Square, Post or Wide) and click Make picture. Takes 10 to 30 seconds. Turn into a video sends it straight to Video from a picture." },
      { label: "Video from text", text: "Describe a scene and pick the shape and length. Videos take 3 to 8 minutes." },
      { label: "Video from a picture", text: "Choose a photo, say how it should move, and click Bring it to life. The photo stays as it is; only gentle movement is added." },
      { label: "Storyboard", text: "Type a destination. A short film plan is written scene by scene with a picture for each. Make each clip into a video, or click Make all videos." },
      { label: "Reel", text: "Describe any kind of reel in your own words: a slow destination film, a numbered top 5, a day-by-day itinerary, an offer with your price, travel tips, a fast trend reel or anything else. It works out the kind of reel and plans it. Need an idea fills in a sample. After planning you can change the text position, font, size and pace under Look. Pictures can be real photos, real video clips (from Pexels) or AI-made; use the swap button on a clip for a different one. Music: Find music suggests free Creative Commons tracks to listen to and use, or upload your own. Credits for photos and music are added when you copy the caption. Pick a length. It plans the clips, makes a picture for each (or moving clips when the video studio is on) and adds the text. Switch the opening title, text on each clip, logo, end card and music on or off, edit any text, reorder clips, then Download reel. It saves as MP4 in Chrome or Edge; keep the tab open while it saves. An Instagram caption and hashtags are written for you to copy." },
    ],
    tips: ["Pictures and videos are kept for 3 days, so download the ones you want to keep.", "If the bar says the video studio is offline, the main PC is off or ComfyUI isn't running. Pictures still work."],
  },
  {
    id: "finance-kpis", group: "Finance", title: "Finance KPIs", route: "/finance-kpis",
    intro: "The company's figures straight from Tally, updated every 15 minutes while Tally is open on the finance computer.",
    points: [
      { label: "Top row", text: "Sales so far this month, gross profit and margin, net profit after running costs, and cash and bank today." },
      { label: "Sales and costs by month", text: "Each month of the financial year. Hover over a month to see its profit. The dashed line is the monthly sales target." },
      { label: "Targets", text: "This month against the sales and margin targets. Owners set them with the pencil." },
      { label: "Money owed to us", text: "What clients still owe, biggest first. Advance payments are shown separately." },
      { label: "Money we owe suppliers", text: "What we still owe DMCs, hotels and other suppliers, biggest first." },
      { label: "Bank and cash", text: "Today's balance in each bank and cash account. An overdraft shows in red." },
      { label: "Spending this month", text: "The biggest costs this month, by Tally account." },
    ],
    tips: [
      "If the page says Tally wasn't open, the figures shown are from the last time it was. They update on their own once Tally is opened again.",
      "The figures are only as up to date as the entries in Tally.",
    ],
  },
  {
    id: "profile", group: "Your account", title: "Profile and settings", route: "/profile",
    intro: "Open it from your initials at the top right.",
    points: [
      { label: "Connections", text: "Gmail, Google Drive, the PC folder and Google Analytics. Connect or manage each one here." },
      { label: "Account", text: "Your name, email and role. Change your password here." },
      { label: "Desktop notifications", text: "Turn alerts on or off for this computer, and send yourself a test." },
      { label: "Appearance", text: "Light or dark mode." },
    ],
  },
  {
    id: "faq", group: "Your account", title: "Common questions",
    intro: "Quick answers to the things people ask most.",
    points: [
      { label: "A page says 'Waking up the server'", text: "Normal after a quiet spell. Wait up to a minute and the page loads by itself." },
      { label: "A page says it didn't load properly", text: "Click Try again. If it keeps happening, click Reload dashboard and tell the owner which page it was." },
      { label: "I can't find a client", text: "Search by phone number as well as name, and check the All clients tab rather than Leads." },
      { label: "A voucher has the wrong details", text: "Click the voucher in the list and edit it before downloading. The original document is never changed." },
      { label: "I'm not getting desktop alerts", text: "Profile → Desktop notifications → Turn on, then Send a test. Also check that the browser is allowed to show notifications." },
      { label: "Something looks out of date", text: "Click the refresh button in the top bar." },
    ],
  },
];

export const COMPANY: HelpSection[] = [
  {
    id: "co-how", group: "How it works", title: "How the dashboard fits together", diagram: "system",
    intro: "The dashboard is made of five services. Each one does one job, and all of them are on free plans today.",
    points: [
      { label: "Vercel", text: "Hosts the website itself, custom-holidays.vercel.app. Publishes every change automatically." },
      { label: "Render", text: "The backend server at custom-holidays.onrender.com. Reads Gmail, extracts documents, runs CH Assistant and the automations." },
      { label: "Supabase", text: "The database: clients, trips, vouchers, suppliers, chat, logins and uploaded files." },
      { label: "Google Cloud", text: "Lets the dashboard connect to Gmail and Google Drive. Project 'automation', owned by customh.automation@gmail.com." },
      { label: "GitHub", text: "Stores the code: customhautomation-hash/Custom-Holidays. Vercel and Render both publish from it." },
    ],
  },
  {
    id: "co-accounts", group: "How it works", title: "Accounts and who owns them",
    intro: "Keep these logins safe and in the company's name, not a single employee's. Whoever has them controls the dashboard.",
    points: [
      { label: "Google (customh.automation@gmail.com)", text: "Owns Google Cloud and the company Gmail the suppliers are read from." },
      { label: "GitHub (customhautomation-hash)", text: "Owns the code. Needed to publish changes." },
      { label: "Supabase (customhautomation-hash's Org)", text: "Owns the database and all staff logins." },
      { label: "Vercel and Render", text: "Signed in with GitHub. Hold the settings and keys for the website and server." },
    ],
    tips: ["Turn on 2-step verification for every one of these, and keep the backup codes somewhere safe in the office."],
  },
  {
    id: "co-costs", group: "How it works", title: "Costs and free-plan limits",
    intro: "Everything costs ₹0 a month today. These are the limits to know about (checked November 2026).",
    points: [
      { label: "Render (server)", text: "Sleeps after 15 minutes without use and takes about a minute to wake, which is why staff sometimes see 'Waking up the server'. 750 free hours a month. Paid plans start at about $7 a month and never sleep." },
      { label: "Supabase (database)", text: "500 MB of data, 1 GB of files (50 MB per file). A project with no activity for 7 days can be paused. No downloadable backups on the free plan." },
      { label: "Vercel (website)", text: "Free plan is enough for an internal team dashboard." },
      { label: "Google Cloud", text: "Gmail and Drive access is free." },
    ],
    tips: [
      "If the team grows or uploads lots of photos and videos to chat, Supabase Pro (about $25 a month) adds daily backups and removes the pause.",
      "If the database is ever paused, open Supabase and click Restore project. Nothing is lost.",
    ],
  },
  {
    id: "co-team", group: "People", title: "Adding and removing staff",
    intro: "Staff create their own login and you decide their role.",
    steps: [
      "Send them the link custom-holidays.vercel.app and ask them to click Sign up and confirm their email.",
      "Everyone starts as a Member. To make someone an Owner (who can see this Company guide), open Supabase → Table Editor → profiles, find their row and change role to owner.",
      "To remove someone who has left, open Supabase → Authentication → Users, find their email, click the three dots and choose Delete user. They are signed out everywhere.",
    ],
    tips: ["When someone leaves, also remove them from any shared Google, GitHub or Supabase account they had access to."],
  },
  {
    id: "co-access", group: "People", title: "Who can see what",
    intro: "Every signed-in member of staff can use every page. Only Owners see this Company guide.",
    tips: ["Nobody outside the team can see anything: every page needs a login, apart from the Privacy and Terms pages Google requires."],
  },
  {
    id: "co-connections", group: "Running it", title: "Connections",
    intro: "Connections are managed from Profile → Connections.",
    points: [
      { label: "Gmail", text: "Connect the company inbox so suppliers and rates are found automatically. If Google ever asks again, click Connect and sign in once more." },
      { label: "Google Drive", text: "Trip folders from the Voucher Generator are saved here." },
      { label: "PC folder", text: "Trip folders are also saved to a folder on the office PC. Chosen once per computer." },
      { label: "Google Analytics", text: "Website visitors on the Web Analytics page." },
    ],
  },
  {
    id: "co-updates", group: "Running it", title: "How changes are published",
    intro: "When the code changes, it is pushed to GitHub. Vercel and Render then publish it on their own within a few minutes.",
    steps: [
      "Open PowerShell on the office PC.",
      "Type: cd \"D:\\Desktop\\custom holiday main\" and press Enter.",
      "Type: git push and press Enter.",
      "Wait about 3 minutes. The website updates on Vercel and the server on Render.",
    ],
    tips: ["Staff who have the dashboard open pick up the new version the next time they refresh."],
  },
  {
    id: "co-keys", group: "Running it", title: "Settings and keys",
    intro: "The keys that connect the services live in two places. Never paste them into chat, email or the code.",
    points: [
      { label: "Vercel → Settings → Environment Variables", text: "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL, VITE_GOOGLE_CLIENT_ID." },
      { label: "Render → Environment", text: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI, OPENROUTER_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY, COMFY_URL, COMFY_KEY, FRONTEND_URL and the other AI keys." },
    ],
    tips: [
      "The Supabase service role key gives full access to the database. It belongs only in Render, never in Vercel.",
      "After changing a key on Vercel or Render, redeploy that service for it to take effect.",
    ],
  },
  {
    id: "co-trouble", group: "Running it", title: "When something stops working",
    intro: "Go through these in order. Most problems are one of the first three.",
    steps: [
      "Server asleep: wait a minute and refresh. Normal on the free plan.",
      "Database paused: open supabase.com, open the custom-holidays project, and click Restore if it says Paused.",
      "Gmail disconnected: Profile → Connections → Gmail → Connect, and sign in again.",
      "Server down: open Render → Custom-Holidays → Logs. A red error at the bottom says what failed. Manual Deploy → Deploy latest commit often fixes a one-off problem.",
      "Finance figures not updating: on the finance computer, check Tally is open with the company loaded. If it still doesn't update, open Finance KPIs, click Download again and run install.bat on that computer.",
      "Website not updating: open Vercel → Deployments. The newest one should say Ready. If it says Error, open it to see why.",
    ],
  },
  {
    id: "co-video", group: "Running it", title: "Video studio on the main PC",
    intro: "Videos on the Creatives page are made by ComfyUI on the office's main PC. A small gate on that PC lets only the dashboard in, and Tailscale gives it a permanent address that never changes.",
    steps: [
      "On the main PC, make sure ComfyUI makes a video on its own (the LTX video workflow).",
      "Copy the folder tools/video-studio from the dashboard folder to the main PC, e.g. C:\\CustomHolidays\\video-studio. Open start-video-studio.bat in Notepad and check COMFY_DIR points at ComfyUI.",
      "Install Tailscale (tailscale.com/download) and sign in with customh.automation@gmail.com.",
      "Double-click start-video-studio.bat. If Tailscale asks to allow Funnel, click Allow and run it again.",
      "In Command Prompt type: tailscale funnel status. Copy the https address it shows.",
      "Open dashboard-key.txt in the video-studio folder and copy the key.",
      "In Render → Environment add COMFY_URL (the address) and COMFY_KEY (the key), then save.",
      "Double-click install-autostart.bat so it starts whenever the PC is switched on.",
    ],
    tips: [
      "The main PC must be on, signed in and not asleep for videos. Set Windows → Power → Sleep to Never on that PC.",
      "ngrok also works (it was used before) but its free plan allows only 1 GB a month, roughly 50 to 100 videos. See README.txt in the folder.",
    ],
  },
  {
    id: "co-setup", group: "Running it", title: "One-time setup still to do",
    intro: "These need the owner's logins, so they are done by hand once. Until then, the features listed won't work fully.",
    points: [
      { label: "Team Chat, Vouchers, Desktop alerts", text: "Run three files in Supabase → SQL Editor: supabase/team_chat.sql, supabase/vouchers.sql and supabase/push_notifications.sql. Then deploy the push-notify function with JWT verification turned off." },
      { label: "Gmail and Drive for everyone", text: "In Google Cloud (project 'automation'): finish Branding, add the Gmail and Drive scopes, click Publish app, and put the client ID and secret into Render and Vercel." },
      { label: "Real photos and video clips in reels", text: "Create a free account at pexels.com/api, copy the API key and add it on Render as PEXELS_API_KEY. Without it, real photos come from Openverse (fewer and slower) and real video clips are off." },
      { label: "Videos on the Creatives page", text: "Connect the main PC that runs ComfyUI. See Video studio on the main PC above." },
      { label: "Finance figures from Tally", text: "Run supabase/finance_tally.sql in Supabase → SQL Editor. Then open Finance KPIs, click Download Tally Connector and follow the steps on the computer that has Tally." },
      { label: "Gmail checked every 5 minutes", text: "Run supabase/gmail_auto_check.sql in Supabase → SQL Editor. Until then, Gmail is only checked while someone has the Suppliers page open." },
      { label: "Branded sign-up emails", text: "Set up a sender in Supabase → Authentication → Emails → SMTP Settings (a Gmail app password needs the phone used for 2-step verification). Then paste the five designs from supabase/email_templates into Emails → Templates." },
    ],
  },
];
