import React from 'react';
import { changelog } from './changelog';

export function AboutTabContent() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-white pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Main Info Card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-8 shadow-xl h-full flex flex-col">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <div>
              <h4 className="text-3xl font-black uppercase tracking-tight">ToonHQ Plus</h4>
            </div>
          </div>

          <div className="space-y-4 text-green-100/70 leading-relaxed">
            <p>
              ToonHQ Plus is an independently developed browser extension designed to enhance your Toontown Rewritten experience by providing quick access to essential game information, calculators, and tools.
            </p>

            <div className="pt-4 border-t border-white/5">
              <h5 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-3">Key Features</h5>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-medium">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Real-time CEO and CJ Tier Information
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Comprehensive Bosses & Facilities Information
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Calculators for Cogs, Facilities and The Boiler
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Customizable Navigation Bar
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Notes for Toony and Stinky Toons
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  History of Recently Joined Groups
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Companion App Support
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Notifications for New Rewards
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h5 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-1">Feedback & Support</h5>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-white/60 py-2">
                    Have any questions, suggestions, complaints, or other feedback? Feel free to reach out!
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 font-bold w-16">Discord:</span>
                      <a href="https://discord.com/users/140381706992484352" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">@hoque</a>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 font-bold w-16">Email:</span>
                      <a href="mailto:feedback@toontown.help" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">feedback@toontown.help</a>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3">
                  <div className="h-px flex-1 bg-gradient-to-l from-white/20 to-transparent" />
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/65">My Toons</div>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-w-0 flex-col items-center">
                    <div className="toon-name-tag">Toony Hoque</div>
                    <img
                      src="https://rendition.toontownrewritten.com/render/7414000001501b451bba1b25002525010400010000000000000000010000032c00/waving/128x128.png"
                      alt="Toony Hoque waving"
                      className="mt-1 h-28 w-full object-contain"
                      style={{ transform: 'translate(8px, 5px)' }}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col items-center">
                    <div className="toon-name-tag">Braveheart</div>
                    <img
                      src="https://rendition.toontownrewritten.com/render/7405010101401b351bbc1b13001313010400034c00012e00031a001f0000031000/waving/128x128.webp"
                      alt="Braveheart waving"
                      className="mt-1 h-28 w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 text-center space-y-4">
            <div className="text-[10px] leading-relaxed text-white/30 italic max-w-md mx-auto">
              <p>This extension is not affiliated with, maintained, or endorsed by the ToonHQ team.</p>
            </div>
          </div>
        </div>

        {/* Changelog Card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 shadow-xl overflow-hidden flex flex-col max-h-[calc(95vh-8rem)]">
          <div className="bg-white/5 px-6 py-4 border-b border-white/10">
            <h5 className="text-sm font-black uppercase tracking-widest text-emerald-400">Changelog</h5>
          </div>
          <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
            {changelog.map((entry) => (
              <div key={entry.version} className="relative pl-6 border-l border-white/10">
                <div className="absolute left-[-5px] top-0 h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,184,129,0.5)]" />
                <div className="mb-3">
                  <span className="text-sm font-black text-white mr-2">v{entry.version}</span>
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">{entry.date}</span>
                </div>
                <ul className="space-y-3">
                  {entry.changes.map((change, i) => {
                    const match = change.match(/^\[(.*?)\]\s*(.*)$/);
                    if (match) {
                      const [, , text] = match;

                      return (
                        <li key={i} className="text-xs text-white/70 leading-relaxed flex items-baseline gap-2.5 group">
                          <span className="text-emerald-500/40 shrink-0">•</span>
                          <span className="group-hover:text-white transition-colors">{text}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="text-xs text-white/70 leading-relaxed flex gap-2.5 items-baseline">
                        <span className="text-emerald-500/40 shrink-0">•</span>
                        <span>{change}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
