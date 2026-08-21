import { useEffect, useState } from 'react';
import logo from '@/assets/logo-32.png';

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('Checking notification permission…');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    Promise.all([
      browser.permissions.contains({ permissions: ['notifications'] }),
      browser.storage.local.get('reward-notifications-enabled'),
    ]).then(([granted, stored]) => {
      const active = granted && stored['reward-notifications-enabled'] === true;
      setEnabled(active);
      setStatus(active ? 'Reward notifications are enabled.' : 'Click Enable to grant Firefox notification permission.');
    }).catch(error => {
      console.error(error);
      setStatus('Could not check notification permission.');
    }).finally(() => setBusy(false));
  }, []);

  const enableNotifications = async () => {
    setBusy(true);
    setStatus('Waiting for Firefox permission…');
    try {
      const granted = await browser.permissions.request({ permissions: ['notifications'] });
      await browser.storage.local.set({ 'reward-notifications-enabled': granted });
      setEnabled(granted);
      setStatus(granted ? 'Reward notifications are enabled. You can close this page.' : 'Notification permission was not granted.');
    } catch (error) {
      console.error('[ToonHQ+] Failed to request notification permission.', error);
      setStatus('Firefox could not grant notification permission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    await browser.storage.local.set({ 'reward-notifications-enabled': false });
    setEnabled(false);
    setStatus('Reward notifications are disabled. Firefox permission remains available.');
    setBusy(false);
  };

  return (
    <main className="page-shell">
      <section className="settings-card">
        <header><img src={logo} alt="" /><div><p className="eyebrow">ToonHQ+</p><h1>Reward notifications</h1></div></header>
        <p className="description">Allow ToonHQ+ to notify you when Toon Tracker detects a newly earned reward.</p>
        <div className={`status ${enabled ? 'enabled' : ''}`}>{status}</div>
        <button type="button" disabled={busy} onClick={enabled ? disableNotifications : enableNotifications}>
          {busy ? 'Please wait…' : enabled ? 'Disable reward notifications' : 'Enable reward notifications'}
        </button>
        <p className="footnote">Disabling this setting keeps Firefox permission available. You can revoke it from Firefox Add-ons Manager.</p>
      </section>
    </main>
  );
}
