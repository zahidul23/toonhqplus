import { useEffect, useState } from 'react';

export function useSystemDisplayMode(): 'Light' | 'Dark' {
  const [mode, setMode] = useState<'Light' | 'Dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'
  );

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setMode(preference.matches ? 'Dark' : 'Light');
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  return mode;
}
