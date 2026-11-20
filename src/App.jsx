import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Smartphone, Apple, Copy, Check, Code2, Trophy, BatteryFull, Zap, Download, GitBranch as Github } from 'lucide-react';
import { downloadMacro } from './macro';

// ── Helpers ─────────────────────────────────────────────────
const detectOS = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'ios';
};

// Real pixel size of this phone's screen (portrait). Desktop falls back to a common phone size.
const detectSize = () => {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(Math.min(screen.width, screen.height) * dpr);
  const h = Math.round(Math.max(screen.width, screen.height) * dpr);
  const isPhone = /iPhone|Android/i.test(navigator.userAgent);
  return isPhone ? { width: w, height: h } : { width: 1080, height: 2400 };
};

const clean = (v) => v.trim().replace(/^@/, '').replace(/.*(?:leetcode\.com\/(?:u\/)?|github\.com\/|codeforces\.com\/profile\/)/, '').replace(/\/.*/, '');

const STORAGE = 'streakwall_users';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'wallpaper' ? <LegacyWallpaper params={params} /> : <Setup params={params} />;
}

function LegacyWallpaper({ params }) {
  // Legacy links (?mode=wallpaper&user=...) keep working: show the PNG full screen.
  {
    const q = new URLSearchParams({ lc: params.get('user') || '', width: params.get('width') || 1080, height: params.get('height') || 2400 });
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <img src={`/api/wallpaper?${q}`} alt="wallpaper" className="max-h-screen max-w-full object-contain" />
      </div>
    );
  }
}

function Setup({ params }) {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
  const [lc, setLc] = useState(saved.lc || params.get('lc') || params.get('user') || '');
  const [gh, setGh] = useState(saved.gh || params.get('gh') || '');
  const [cf, setCf] = useState(saved.cf || params.get('cf') || '');
  const [size] = useState(detectSize);
  const [os, setOs] = useState(detectOS);
  const [submitted, setSubmitted] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [copied, setCopied] = useState(false);

  const wallpaperUrl = useMemo(() => {
    if (!submitted) return '';
    const q = new URLSearchParams();
    if (submitted.lc) q.set('lc', submitted.lc);
    if (submitted.gh) q.set('gh', submitted.gh);
    if (submitted.cf) q.set('cf', submitted.cf);
    q.set('width', size.width);
    q.set('height', size.height);
    q.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
    return `${window.location.origin}/api/wallpaper?${q}`;
  }, [submitted, size]);

  const submit = (e) => {
    e?.preventDefault();
    const next = { lc: clean(lc), gh: clean(gh), cf: clean(cf) };
    if (!next.lc && !next.gh && !next.cf) return;
    localStorage.setItem(STORAGE, JSON.stringify(next));
    setStatus('loading');
    setSubmitted(next);
  };

  useEffect(() => { if (saved.lc || saved.gh || saved.cf) submit(); }, []); // eslint-disable-line

  const copy = async () => {
    await navigator.clipboard.writeText(wallpaperUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-200 font-sans">
      <div className="max-w-5xl mx-auto px-5 py-10 md:py-16">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center"><Zap className="w-5 h-5 text-black" /></div>
            <span className="text-xl font-black text-white tracking-tight">StreakWall</span>
          </div>
          <a href="https://github.com/Tempsai2325/leetcodestreak" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <Github className="w-4 h-4" /> Open source
          </a>
        </header>

        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Left: pitch + form */}
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tight">
              Your dev grind,<br /><span className="text-green-500">on your lock screen.</span>
            </h1>
            <p className="mt-4 text-zinc-400">
              A live wallpaper with your coding streak across LeetCode, GitHub and Codeforces. It turns red before the daily reset so you never break the chain.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-3">
              <Field icon={<Trophy className="w-4 h-4 text-yellow-400" />} placeholder="LeetCode username" value={lc} onChange={setLc} />
              <Field icon={<Github className="w-4 h-4 text-zinc-300" />} placeholder="GitHub username (optional)" value={gh} onChange={setGh} />
              <Field icon={<Code2 className="w-4 h-4 text-blue-400" />} placeholder="Codeforces handle (optional)" value={cf} onChange={setCf} />
              <button className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition">
                Make my wallpaper
              </button>
            </form>

            {/* Trust line */}
            <div className="mt-6 flex items-start gap-3 text-sm text-zinc-400 bg-zinc-950 border border-zinc-900 rounded-xl p-4">
              <ShieldCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span><b className="text-zinc-200">No login. No password. No tracking.</b> We only read your public profile stats. Your usernames stay on this device.</span>
            </div>
          </div>

          {/* Right: preview + setup */}
          <div>
            <div className="mx-auto w-[260px] rounded-[2.6rem] border-[6px] border-zinc-800 bg-black overflow-hidden aspect-[9/19.5] flex items-center justify-center">
              {submitted ? (
                <img
                  key={wallpaperUrl}
                  src={wallpaperUrl}
                  alt="Your wallpaper preview"
                  className={`w-full h-full object-cover transition-opacity ${status === 'loading' ? 'opacity-30' : 'opacity-100'}`}
                  onLoad={() => setStatus('ok')}
                  onError={() => setStatus('error')}
                />
              ) : (
                <span className="text-zinc-600 text-sm px-8 text-center">Your preview shows up here</span>
              )}
            </div>
            {status === 'loading' && <p className="text-center text-sm text-zinc-500 mt-3">Building your wallpaper…</p>}
            {status === 'error' && <p className="text-center text-sm text-red-400 mt-3">Couldn't find that profile. Check the username.</p>}

            {status === 'ok' && (
              <div className="mt-8 bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex gap-2 mb-5">
                  <Tab active={os === 'ios'} onClick={() => setOs('ios')} icon={<Apple className="w-4 h-4" />}>iPhone</Tab>
                  <Tab active={os === 'android'} onClick={() => setOs('android')} icon={<Smartphone className="w-4 h-4" />}>Android</Tab>
                </div>

                {os === 'android' && (
                  <button onClick={() => downloadMacro(wallpaperUrl)} className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl mb-3">
                    <Download className="w-4 h-4" /> Download for Android
                  </button>
                )}
                <button onClick={copy} className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl mb-5 ${os === 'android' ? 'bg-zinc-900 text-zinc-200 border border-zinc-800' : 'bg-white text-black'}`}>
                  {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy my wallpaper link</>}
                </button>

                {os === 'ios' ? (
                  <Steps items={[
                    'Open Shortcuts → Automation → + → Time of Day (e.g. 8 AM). Choose "Run Immediately".',
                    'Add action "Get Contents of URL" and paste your link.',
                    'Add action "Set Wallpaper" → Lock Screen. Turn off "Show Preview".',
                    'Repeat for 6 PM and 11 PM. That\u2019s it.',
                  ]} />
                ) : (
                  <Steps items={[
                    'Install MacroDroid (free) from the Play Store.',
                    'Tap "Download for Android", then open StreakWall.macro and import it into MacroDroid.',
                    'If MacroDroid asks, allow access to your Download folder. It updates on unlock, 4 times a day and after reboot.',
                    'Settings → Battery → MacroDroid → Unrestricted, so your phone never pauses it.',
                  ]} />
                )}

                <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                  <BatteryFull className="w-4 h-4 text-green-500" />
                  A few tiny image downloads a day. Unchanged wallpapers download zero bytes.
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-20 text-center text-xs text-zinc-600">
          Made by students, for students. Not affiliated with LeetCode, GitHub or Codeforces.
        </footer>
      </div>
    </div>
  );
}

function Field({ icon, placeholder, value, onChange }) {
  return (
    <label className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 focus-within:border-green-500 rounded-xl px-4 py-3">
      {icon}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
        className="bg-transparent outline-none w-full text-white placeholder:text-zinc-600"
      />
    </label>
  );
}

function Tab({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold ${active ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
      {icon}{children}
    </button>
  );
}

function Steps({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-sm text-zinc-300">
          <span className="w-6 h-6 shrink-0 rounded-full bg-zinc-800 text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}
