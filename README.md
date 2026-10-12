# Fairway Buddy website

The Fairway Buddy app as a website. It has the same screens, drills, badges and text, and stores data the same way: progress in the browser's `localStorage` (key `fb4`) and videos in IndexedDB (`fairway`). Anyone who used the original page keeps their data.

```
public/index.html   the whole app: design, MediaPipe body tracking, and the Claude tool loop
api/claude.js       server function that holds your API key, the coach prompts and the tool list
server.js           runs the site on your computer for testing
```

**Why there's a server part:** an API key placed in a web page can be read by anyone who visits. So the page sends each turn to `/api/claude`, and that function adds the key and calls Claude. The prompts and tools also live there, so other people can't use your site as a free general-purpose Claude.

---

## Publish it (free, about 10 minutes)

You need:
- an **Anthropic API key** from <https://console.anthropic.com> → API Keys
- a free **GitHub** account (<https://github.com>)
- a free **Vercel** account (<https://vercel.com>, sign up with GitHub)

### 1. Put the code on GitHub
1. On GitHub, click **New repository**. Name it `fairway-buddy`, then **Create repository**.
2. On the new repo page, click **uploading an existing file**.
3. Open the `web` folder on your Mac. Drag everything *inside* it (`public`, `api`, `package.json`, `vercel.json`, `server.js`, `README.md`, `.gitignore`, `.env.example`) into the browser, then click **Commit changes**.
   - Upload the folder's contents, not the `web` folder itself.
   - Finder hides `.gitignore` and `.env.example`. Press **Cmd+Shift+.** to show them. They're optional.
   - Never upload a `.env` file. It contains your key.

### 2. Deploy on Vercel
1. In Vercel, click **Add New… → Project**, then **Import** next to your `fairway-buddy` repo.
2. Leave **Framework Preset** as **Other**.
3. Open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your key
   - (optional) `ACCESS_CODE` = any password. Visitors must enter it once before AI feedback works. Recommended, so strangers can't spend your credit.
4. Click **Deploy**. After about a minute you get a link like `https://fairway-buddy.vercel.app`. That's your website.

To change the site later, upload new files to the GitHub repo. Vercel republishes automatically.

### 3. (Optional) Use your own domain
In Vercel: **Project → Settings → Domains → Add**, type your domain (for example `fairwaybuddy.com`), and follow the DNS instructions it shows at your domain registrar.

### 4. Protect your API bill
- In the Anthropic Console, go to **Settings → Limits** and set a monthly spend limit.
- Set `ACCESS_CODE` (step 2.3) and give the code only to the golfers you want to use the site.
- After changing an environment variable in Vercel, redeploy: **Deployments → ⋯ → Redeploy**.

---

## Try it on your computer first (optional)

Requires Node.js 20 or newer (<https://nodejs.org>).

```bash
cd web
cp .env.example .env      # then open .env and paste your key
npm install
npm run dev
```

Open <http://localhost:3000>. To record from a phone, use the published HTTPS site, since phone browsers only allow the camera on secure sites.

## How the coach works

Same as the Android app. MediaPipe runs in the visitor's browser. Claude (`claude-opus-5-5`) gets 4 frames with the tracked skeleton drawn on, then calls tools that run MediaPipe in the browser: swing metrics, landmarks, joint angles, landmark tracking and extra frames, plus the player's history. It also keeps its own **coach notes**. When a golfer taps **Not quite** and types a correction, Claude reflects on it and rewrites its notes, so later checks fit that golfer. Notes appear under Profile → Coach memory.
