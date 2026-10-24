import type { Environment } from '@lumora/shared';

export function captureEnvironment(): Environment {
  const ua = navigator.userAgent;
  return {
    url: location.href,
    title: document.title,
    referrer: document.referrer,
    userAgent: ua,
    browser: detectBrowser(ua),
    os: detectOs(ua),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${screen.width}×${screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    timestamp: new Date().toISOString(),
  };
}

export function detectBrowser(ua: string): string {
  const rules: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1].split('.')[0]}`;
  }
  return 'Unknown browser';
}

export function detectOs(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  const ios = ua.match(/(iPhone|iPad).*OS (\d+)[_\d]*/);
  if (ios) return `iOS ${ios[2]}`;
  const mac = ua.match(/Mac OS X (\d+)[_.](\d+)/);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}
