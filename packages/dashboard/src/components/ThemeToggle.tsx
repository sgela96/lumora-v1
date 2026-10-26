import { useState } from 'react';
import { Icons } from './icons';

type Theme = 'light' | 'dark';

const read = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Sun / moon switch for the back office theme. Light by default, remembered in this browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const flip = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('lumora-theme', next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    setTheme(next);
  };
  return (
    <button className="icon-btn theme-toggle" onClick={flip} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <Icons.sun size={17} /> : <Icons.moon size={17} />}
    </button>
  );
}
