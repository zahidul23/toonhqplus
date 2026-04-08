import './App.css';
import logo from '@/assets/logo-32.png';

function App() {
  return (
    <div className="popup-container">
      <div className="title-container">
        <img src={logo} alt="ToonHQ+ Logo" className="title-logo" />
        <h1>ToonHQ+</h1>
      </div>

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

      <div className="disclaimer">
        <div>
          ToonHQ+ is an extension that enhances the ToonHQ experience.
        </div>
        <div>
          This extension is independently created and is not affiliated with, maintained, or endorsed by the ToonHQ team.
        </div>
      </div>

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
