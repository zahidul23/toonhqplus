import { useState, useEffect } from 'react';
import { getSetting, setSetting } from '../sidebar.content/db';
import './App.css';
import logo from '@/assets/logo-32.png';

function App() {
  const [trackerEnabled, setTrackerEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    getSetting<boolean>('tracker-enabled').then((val) => {
      setTrackerEnabled(val === true);
      setLoading(false);
    });

    const listener = (message: any) => {
      if (message.type === 'TRACKER_PREF_CHANGED') {
        setTrackerEnabled(message.enabled);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setTrackerEnabled(newValue);
    await setSetting('tracker-enabled', newValue);
    // Send state change to the background script
    browser.runtime.sendMessage({
      type: 'TRACKER_PREF_CHANGED',
      enabled: newValue
    }).catch(console.error);
  };

  return (
    <div className="popup-container">
      <div className="title-container">
        <img src={logo} alt="ToonHQ+ Logo" className="title-logo" />
        <h1>ToonHQ+</h1>
        <span className="version-tag">v{browser.runtime.getManifest().version}</span>
      </div>

      <div className="actions-container">
        <div className="card">
          <a href="https://toonhq.org/groups" target="_blank" rel="noreferrer">
            <button className="cta-button">
              Go to ToonHQ.com
            </button>
          </a>
        </div>

        <div className="card">
          <a href="https://chromewebstore.google.com/detail/toonhq+/npoiljoenaihnleoogcmcpfgdikdjmfg" target="_blank" rel="noreferrer">
            <button className="webstore-button">
              Go to Chrome Web Store Page
            </button>
          </a>
        </div>
      </div>

      <div className="disclaimer">
        <div>
          ToonHQ+ is an extension that enhances the ToonHQ experience.
        </div>
        <div>
          This extension is independently created and is not affiliated with, maintained, or endorsed by the ToonHQ team.
        </div>
      </div>

      {!loading && (
        <div className="settings-section">
          <h2 className="settings-title">Settings</h2>
          <div className="settings-card">
            <div className="settings-header">
              <span>Toon Tracker (Companion App)</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={trackerEnabled}
                  onChange={handleToggle}
                />
                <span className="slider round"></span>
              </label>
            </div>
            <p className="settings-desc">
              Allow ToonHQ+ to connect to your Toontown Rewritten game client to automatically track toon rewards, tasks and suit progressions.
            </p>
            <p className="settings-warning">
              If enabled, this extension will periodically check for running TTR instances while your browser is open.
            </p>
            <p className="settings-warning">
              All data is passed locally between the game client and your browser. No data ever leaves your computer.
            </p>
          </div>
        </div>
      )}


      <h2 className="settings-title">Contact</h2>
      <div className="bottom-section">
        <div className="image-side">
          <img
            src="https://rendition.toontownrewritten.com/render/7414000001501b451bba1b25002525010400010000000000000000010000032c00/waving/128x128.png"
            alt="Waving Toon"
          />
        </div>

        <div className="feedback">
          <div>
            <div>
              Have any questions, suggestions or other feedback?
            </div>
            <div>
              Feel free to reach out!
            </div>
          </div>
          <div className="contact-info">
            <div>
              Discord: <a href="https://discord.com/users/140381706992484352" target="_blank" rel="noreferrer"><strong>@hoque</strong></a>
            </div>
            <div>
              Email: <a href="mailto:toonyhoque@gmail.com"><strong>toonyhoque@gmail.com</strong></a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
