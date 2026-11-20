import template from './macroTemplate.json';

// Builds a personal MacroDroid macro with the user's wallpaper link baked in.
// Triggers: 6:00, 13:00, 19:00, 23:45 (exact alarms), device unlock (max once per 30 min),
// boot, and widget tap. Retries 3x, 10 min apart; only sets the wallpaper on HTTP 200.
export function buildMacro(wallpaperUrl) {
  const macro = JSON.parse(JSON.stringify(template).replace('__STREAKWALL_URL__', wallpaperUrl.replace(/"/g, '')));
  macro.macro.m_GUID = -Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  macro.macro.lastEditedTimestamp = Date.now();
  return macro;
}

export function downloadMacro(wallpaperUrl) {
  const blob = new Blob([JSON.stringify(buildMacro(wallpaperUrl))], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'StreakWall.macro';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
