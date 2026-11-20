import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Smartphone, Apple, Copy, Check, Code2, Trophy, BatteryFull, Download, GitBranch as Github, ArrowRight } from 'lucide-react';
import { downloadMacro } from './macro';
import QRCode from 'qrcode';

// ── Helpers ─────────────────────────────────────────────────
const detectOS = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'android'; // iPhone is coming soon, so default to Android
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


// Wallpaper URL for given usernames. previewWidth gives a smaller copy for the on-page preview.
const wallUrl = (sub, size, previewWidth) => {
  const q = new URLSearchParams();
  if (sub.lc) q.set('lc', sub.lc);
  if (sub.gh) q.set('gh', sub.gh);
  if (sub.cf) q.set('cf', sub.cf);
  const w = previewWidth ? Math.min(previewWidth, size.width) : size.width;
  q.set('width', w);
  q.set('height', previewWidth ? Math.round((size.height / size.width) * w) : size.height);
  q.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  return `${window.location.origin}/api/wallpaper?${q}`;
};

const STORAGE = 'streakwall_users';
const isDesktop = () => !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
  const [desktop] = useState(isDesktop);
  const [qr, setQr] = useState('');
  const [formNotice, setFormNotice] = useState('');

  const wallpaperUrl = useMemo(() => (submitted ? wallUrl(submitted, size) : ''), [submitted, size]);
  // The page preview only needs a small image: half size renders and downloads ~4x faster.
  const previewUrl = useMemo(() => (submitted ? wallUrl(submitted, size, 540) : ''), [submitted, size]);

  // On a computer, the macro must end up on the phone: show a QR that opens this page there.
  useEffect(() => {
    if (!desktop || !submitted) return;
    const q = new URLSearchParams();
    if (submitted.lc) q.set('lc', submitted.lc);
    if (submitted.gh) q.set('gh', submitted.gh);
    if (submitted.cf) q.set('cf', submitted.cf);
    QRCode.toDataURL(`${window.location.origin}/?${q}`, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [desktop, submitted]);

  const [fieldErr, setFieldErr] = useState({});
  const previewRef = useRef(null);
  const scrollOnLoad = useRef(false);
  const loadedUrl = useRef('');
  const inFlight = useRef('');

  const submit = async (e, quiet = false) => {
    e?.preventDefault?.();
    const manual = !quiet && e != null;
    const next = { lc: clean(lc), gh: clean(gh), cf: clean(cf) };
    if (!next.lc && !next.gh && !next.cf) {
      if (manual) setFormNotice('Enter at least one username to make your wallpaper.');
      return;
    }
    const target = wallUrl(next, size, 540);
    // Same wallpaper already showing: nothing to rebuild (the <img> would never fire onLoad again).
    if (target === loadedUrl.current) {
      setFieldErr({});
      setStatus('ok');
      if (manual) {
        setFormNotice('Your wallpaper is ready. Preview and setup are beside the form.');
        if (window.innerWidth < 768) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (inFlight.current === target) return;
    inFlight.current = target;
    if (!quiet) setFieldErr({});
    if (manual) setFormNotice('Building your wallpaper…');
    setStatus('loading');
    // Check every username before building, so a typo never fails silently.
    const names = { lc: 'LeetCode', gh: 'GitHub', cf: 'Codeforces' };
    const keys = { lc: 'leetcode', gh: 'github', cf: 'codeforces' };
    try {
      const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
      // Start rendering the preview while the usernames are checked, so both happen at once.
      new Image().src = target;
      const res = await fetch(`/api/stats?${q}`);
      const data = res.ok ? await res.json() : null;
      const errs = {};
      for (const k of ['lc', 'gh', 'cf']) {
        if (next[k] && (!data || !data[keys[k]])) errs[k] = `No ${names[k]} profile called "${next[k]}". Check the spelling.`;
      }
      inFlight.current = '';
      if (Object.keys(errs).length) { if (quiet) { setStatus(submitted ? 'ok' : 'idle'); return; } setFieldErr(errs); setFormNotice('Check the highlighted username and try again.'); setStatus('error'); return; }
    } catch {
      inFlight.current = '';
      if (quiet) { setStatus(submitted ? 'ok' : 'idle'); return; }
      setFieldErr({ form: 'Could not reach the server. Check your internet and try again.' });
      setStatus('error');
      return;
    }
    localStorage.setItem(STORAGE, JSON.stringify(next));
    setFieldErr({});
    // The image may have finished while we were checking usernames.
    if (target === loadedUrl.current) { inFlight.current = ''; setStatus('ok'); return; }
    scrollOnLoad.current = !quiet && e != null;
    setSubmitted(next);
  };

  useEffect(() => { if (saved.lc || saved.gh || saved.cf || params.get('lc') || params.get('gh') || params.get('cf') || params.get('user')) submit(); }, []); // eslint-disable-line

  // Never spin forever: after 25 s, stop and say so.
  useEffect(() => {
    if (status !== 'loading') return;
    const t = setTimeout(() => { inFlight.current = ''; setStatus('error'); setFieldErr({ form: 'That took too long. Tap the button to try again.' }); setFormNotice(''); }, 25000);
    return () => clearTimeout(t);
  }, [status]);

  // Live preview: a moment after the user stops typing, build their wallpaper.
  useEffect(() => {
    const next = { lc: clean(lc), gh: clean(gh), cf: clean(cf) };
    if (![next.lc, next.gh, next.cf].some((v) => v.length >= 3)) return;
    if (submitted && next.lc === submitted.lc && next.gh === submitted.gh && next.cf === submitted.cf) return;
    const t = setTimeout(() => submit(null, true), 600);
    return () => clearTimeout(t);
  }, [lc, gh, cf]); // eslint-disable-line

  const copy = async () => {
    await navigator.clipboard.writeText(wallpaperUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="relative min-h-screen bg-black text-zinc-200 font-sans overflow-x-hidden">
      {/* Background: faint dot grid + green glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#1f1f1f_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] w-[640px] h-[640px] rounded-full bg-green-500/10 blur-[120px]" />

      <div className="relative max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-12 md:mb-16">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-black text-white tracking-tight">StreakWall</span>
          </div>
          <a href="https://github.com/Tempsai2325/leetcodestreak" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-full px-3.5 py-1.5 transition">
            <Github className="w-4 h-4" /> Open source
          </a>
        </header>

        <div className="grid md:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-start">
          {/* Left: pitch + form */}
          <div className="md:sticky md:top-10">
            <div className="sw-rise inline-flex items-center gap-2 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1">
              <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-green-400" /></span>
              Free · Android · updates itself
            </div>
            <h1 className="sw-rise [animation-delay:80ms] mt-5 text-[2.25rem] sm:text-[2.6rem] md:text-5xl lg:text-6xl font-black text-white leading-[1.03] tracking-tight">
              Your dev grind,<br /><span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent lg:whitespace-nowrap">on your lock screen.</span>
            </h1>
            <p className="sw-rise [animation-delay:160ms] mt-5 text-zinc-400 md:text-lg max-w-lg leading-relaxed">
              Every time you unlock your phone, you see your streak and a year of coding. It turns red before the daily reset, so you never break the chain.
            </p>

            <form onSubmit={submit} className="sw-rise [animation-delay:240ms] mt-8 max-w-lg p-2 rounded-2xl bg-zinc-950/80 border border-zinc-900 backdrop-blur space-y-2">
              <Field icon={<Trophy className="w-4 h-4 text-yellow-400" />} placeholder="LeetCode username" value={lc} onChange={(v) => { setLc(v); setFormNotice(''); setFieldErr((e) => ({ ...e, lc: undefined })); }} error={fieldErr.lc} />
              <Field icon={<Github className="w-4 h-4 text-zinc-300" />} placeholder="GitHub username" optional value={gh} onChange={(v) => { setGh(v); setFormNotice(''); setFieldErr((e) => ({ ...e, gh: undefined })); }} error={fieldErr.gh} />
              <Field icon={<Code2 className="w-4 h-4 text-blue-400" />} placeholder="Codeforces handle" optional value={cf} onChange={(v) => { setCf(v); setFormNotice(''); setFieldErr((e) => ({ ...e, cf: undefined })); }} error={fieldErr.cf} />
              <button disabled={status === 'loading'} className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-70 text-black font-bold py-3.5 rounded-xl transition shadow-[0_8px_30px_rgba(34,197,94,0.25)]">
                {status === 'loading' ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Building…</> : formNotice.startsWith('Your wallpaper is ready') ? <><Check className="w-4 h-4" /> Wallpaper ready</> : <>Make my wallpaper <ArrowRight className="w-4 h-4" /> </>}
              </button>
              {fieldErr.form && <p aria-live="polite" className="px-2 pt-1 text-sm text-red-400">{fieldErr.form}</p>}
              {formNotice && <p aria-live="polite" className={`px-2 pt-1 text-sm ${formNotice.startsWith('Your wallpaper is ready') ? 'text-green-400' : status === 'loading' ? 'text-zinc-400' : 'text-red-400'}`}>{formNotice}</p>}
            </form>

            <p className="mt-4 max-w-lg flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
              No login. No password. No tracking. Only public profile stats. Usernames stay on this device.
            </p>

            {/* How it works */}
            <div className="sw-rise [animation-delay:320ms] mt-10 grid grid-cols-3 gap-3 max-w-lg">
              {[
                ['1', 'Add usernames', 'LeetCode, GitHub, Codeforces'],
                ['2', 'Import macro', 'One file into MacroDroid'],
                ['3', 'Unlock phone', 'Wallpaper updates itself'],
              ].map(([n, t, d]) => (
                <div key={n} className="hover:-translate-y-0.5 hover:border-zinc-700 transition rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
                  <div className="text-green-400 text-xs font-black">0{n}</div>
                  <div className="mt-1 text-sm font-bold text-white leading-tight">{t}</div>
                  <div className="hidden sm:block mt-1 text-[11px] text-zinc-500 leading-snug">{d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: preview + setup */}
          <div>
            <p ref={previewRef} className="sw-rise [animation-delay:200ms] scroll-mt-4 mb-5 text-center text-xs font-semibold tracking-wide text-zinc-500">{submitted ? (status === 'loading' ? 'Building your wallpaper…' : 'Your live wallpaper') : 'Sample · type your username to see yours'}</p>
            <div className="sw-rise [animation-delay:200ms] relative mx-auto w-[250px] lg:w-[280px]"><div className="sw-float">
              <div aria-hidden className="sw-glow absolute -inset-10 rounded-full bg-green-500/15 blur-3xl" />
              <div className="relative rounded-[2.8rem] p-[7px] bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-2xl">
                <div className="relative rounded-[2.4rem] bg-black overflow-hidden aspect-[9/19.5]">
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-10 border border-zinc-900" />
                  {submitted ? (
                    <img
                      key={previewUrl}
                      src={previewUrl}
                      alt="Your wallpaper preview"
                      className={`sw-reveal w-full h-full object-cover transition-opacity duration-500 ${status === 'loading' ? 'opacity-40' : 'opacity-100'}`}
                      onLoad={() => { loadedUrl.current = previewUrl; inFlight.current = ''; setStatus('ok'); if (scrollOnLoad.current) { setFormNotice('Your wallpaper is ready. Preview and setup are beside the form.'); if (window.innerWidth < 768) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } scrollOnLoad.current = false; }}
                      onError={() => { loadedUrl.current = ''; inFlight.current = ''; setStatus('error'); if (scrollOnLoad.current) setFormNotice('Could not build the wallpaper. Check the username and try again.'); scrollOnLoad.current = false; }}
                    />
                  ) : (
                    <>
                      <img src="/sample-wallpaper.jpg" alt="Sample StreakWall wallpaper" className="w-full h-full object-cover" />
                    </>
                  )}
                  {status === 'loading' && <div className="sw-scan absolute inset-0 pointer-events-none" />}
                </div>
              </div>
            </div></div>
            {status === 'error' && submitted && !formNotice && !Object.values(fieldErr).some(Boolean) && <p className="text-center text-sm text-red-400 mt-4">Couldn't build the wallpaper. Try again in a minute.</p>}

            {status === 'ok' && (
              <div className="sw-rise mt-10 mx-auto max-w-md bg-zinc-950/90 border border-zinc-900 rounded-2xl p-5 backdrop-blur">
                <div className="flex gap-1 mb-5 p-1 rounded-xl bg-zinc-900/70">
                  <Tab active={os === 'android'} onClick={() => setOs('android')} icon={<Smartphone className="w-4 h-4" />}>Android</Tab>
                  <Tab active={os === 'ios'} onClick={() => setOs('ios')} icon={<Apple className="w-4 h-4" />}>iPhone <span className="ml-1 text-[10px] font-bold uppercase bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">Soon</span></Tab>
                </div>

                {os === 'android' && desktop && qr && (
                  <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                    <img src={qr} alt="QR code to open StreakWall on your phone" className="w-28 h-28 rounded-lg bg-white" />
                    <div className="text-sm">
                      <p className="font-bold text-white">Scan with your Android phone</p>
                      <p className="mt-1 text-zinc-400">It opens this page with your usernames filled in. Tap Download there.</p>
                    </div>
                  </div>
                )}
                {os === 'android' && !desktop && (
                  <button onClick={() => downloadMacro(wallpaperUrl)} className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl mb-3">
                    <Download className="w-4 h-4" /> Download for Android
                  </button>
                )}
                {os === 'ios' ? (
                  <div className="text-center py-6">
                    <Apple className="w-8 h-8 mx-auto text-zinc-500" />
                    <p className="mt-3 font-bold text-white">iPhone is coming soon</p>
                    <p className="mt-1 text-sm text-zinc-400">We're building a one-tap Shortcut. Android works today.</p>
                  </div>
                ) : (
                  <>
                    <Steps items={[
                      'Install MacroDroid (free) from the Play Store.',
                      desktop ? 'Scan the QR code, tap "Download for Android" on your phone, then import StreakWall.macro into MacroDroid.' : 'Tap "Download for Android", then open StreakWall.macro and import it into MacroDroid.',
                      'One time only: edit Set Wallpaper, choose Downloads, then tap Use this folder → Allow. MacroDroid can now save and set wallpapers automatically.',
                    ]} />
                    <button onClick={copy} className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 transition">
                      {copied ? <><Check className="w-4 h-4 text-green-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy wallpaper link (advanced)</>}
                    </button>
                  </>
                )}

                {os === 'android' && (
                  <details className="mt-4 text-xs text-zinc-500">
                    <summary className="cursor-pointer text-zinc-400">Wallpaper stopped updating?</summary>
                    <p className="mt-2">Some phones (OnePlus, Xiaomi, Samsung) put apps to sleep. Open Settings → Apps → MacroDroid → Battery and pick "Allow background activity". It still only wakes a few times a day.</p>
                  </details>
                )}

                {os === 'android' && <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                  <BatteryFull className="w-4 h-4 text-green-500" />
                  A few tiny image downloads a day. Unchanged wallpapers download zero bytes.
                </div>}
              </div>
            )}
          </div>
        </div>

        <footer className="mt-20 pt-6 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-600">
          <span>Made by students, for students.</span>
          <span>Not affiliated with LeetCode, GitHub or Codeforces.</span>
        </footer>
      </div>
    </div>
  );
}

function Field({ icon, placeholder, value, onChange, optional, error }) {
  return (
    <div>
    <label className={`flex items-center gap-3 bg-black/60 border ${error ? 'border-red-500/70' : 'border-zinc-800'} focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20 rounded-xl px-4 py-3 transition`}>
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
      {optional && <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">optional</span>}
    </label>
    {error && <p className="px-2 pt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Tab({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold ${active ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}>
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

// Brand mark: a tiny streak heatmap, filling up toward today.
function Logo() {
  const fills = ['#262626', '#262626', '#166534', '#262626', '#15803d', '#16a34a', '#16a34a', '#22c55e', '#4ade80'];
  return (
    <div className="grid grid-cols-3 gap-[3px] p-1.5 rounded-lg border border-zinc-800 bg-zinc-950">
      {fills.map((c, i) => <span key={i} className="w-[7px] h-[7px] rounded-[2px]" style={{ background: c }} />)}
    </div>
  );
}
