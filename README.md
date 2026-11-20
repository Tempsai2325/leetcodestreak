# StreakWall ⚡

**Your dev grind, on your lock screen.**

StreakWall turns your coding activity into a live phone wallpaper: your streak, your year heatmap, and today's stats from **LeetCode, GitHub and Codeforces**. If you haven't coded yet and the daily reset is close, it turns red.

- ✅ **No login, no password.** It only reads public profile stats.
- 🔋 **Battery friendly.** It makes a few tiny image downloads a day, and if nothing changed the phone downloads nothing.
- 🔓 **Open source.** Read every line of what runs.

## Setup (1 minute)

1. Open the site and enter your usernames.
2. **Android:** install MacroDroid (free), tap **Download for Android**, and import `StreakWall.macro`. It updates when you unlock your phone (at most every 30 min), 4 times a day, and after a reboot.
3. **iPhone:** coming soon.

## API

| Endpoint | What it returns |
| --- | --- |
| `/api/wallpaper?lc=&gh=&cf=&width=&height=&tz=` | PNG wallpaper. Supports `ETag`, so you get a `304` when nothing has changed. |
| `/api/stats?lc=&gh=&cf=` | JSON stats (streak, today, at-risk, per-platform). |

`user=` still works as an alias for `lc=`, so old links keep working.

**How the streak works:** a day counts if you were active on *any* connected platform. Days run on UTC, which matches LeetCode's reset (5:30 AM IST).

## Run locally

```bash
npm install
npx netlify dev     # site plus functions on http://localhost:8888
```

Optionally, set `GITHUB_TOKEN` (any read-only token) in Netlify so GitHub data comes from the official API instead of the public contributions API.

## Roadmap

- [ ] GitHub README stats card
- [ ] Squads and college leaderboards
- [ ] Themes, including a pixel pet mode
- [ ] Android app with push updates, and an iOS lock-screen widget
- [ ] Dev Wrapped (December)

---
Not affiliated with LeetCode, GitHub or Codeforces.
