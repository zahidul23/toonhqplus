import React from 'react';
import { changelog } from './changelog';
import { GITHUB_REPO_URL, GitHubMark } from '../lib/github';

// Same groups and order as the Features section of the README.
// Each inner array is one column; some columns stack two groups.
const FEATURE_COLUMNS: { title: string; items: string[] }[][] = [
  [
    {
      title: 'Groups',
      items: ['CEO/CJ Tier Info', 'Toon Notes', 'Stinky & Toony Lists', 'Group History', 'District Indicators', 'Quick Create', 'Toon Details'],
    },
  ],
  [
    {
      title: 'Shticker Book',
      items: ['Bosses & Facilities Info', 'Facilities Calculator', 'Boiler Calculator', 'Gag Calculator', 'Reference Sheets'],
    },
    { title: 'Events', items: ['Cavalcade Tracker'] },
  ],
  [
    { title: 'Toon Tracker', items: ['Reward Notifications', 'Rewards History and Stats'] },
    { title: 'Customization', items: ['Dark Mode', 'Customizable Navigation', 'Sync and Backup'] },
  ],
];

export function AboutTabContent() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-white pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Main Info Card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 shadow-xl overflow-hidden flex flex-col max-h-[calc(95vh-8rem)]">
          <div className="p-8 overflow-y-auto custom-scrollbar flex flex-col flex-1">
            <div className="mb-8 flex flex-col items-center gap-4 text-center">
              <div>
                <h4 className="text-3xl font-black uppercase tracking-tight">ToonHQ Plus</h4>
              </div>
            </div>

            <div className="space-y-4 text-green-100/70 leading-relaxed">
              <p>
                ToonHQ Plus is an independently developed browser extension designed to enhance your Toontown Rewritten experience by providing quick access to essential game information, calculators, and tools.
              </p>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.06]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0d1117] shadow-md">
                    <GitHubMark size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">Open Source on GitHub</span>
                    <span className="block truncate font-mono text-xs text-white/45">zahidul23/toonhqplus</span>
                  </span>
                </a>
                <div className="space-y-1 border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-white/50">
                  <p>
                    <span className="mr-1.5 text-[10px] font-black uppercase tracking-widest text-violet-300">AI Disclaimer</span>
                    Claude (Anthropic), Codex (OpenAI) and Gemini (Google) models were used to help write the code for this extension. They were only used during development and are not part of the extension.
                  </p>
                  <p>Your data still never leaves your device. Neither I nor any AI model has access to it.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 pt-4 border-t border-white/5 md:grid-cols-2">
                <div>
                  <h5 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-1">Feedback & Support</h5>
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
                <div>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-l from-white/20 to-transparent" />
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/65">My Toons</div>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
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

              <div className="pt-4 pb-6 border-t border-white/5">
                <h5 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-3">Key Features</h5>
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
                  {FEATURE_COLUMNS.map((column, i) => (
                    <div key={i} className="space-y-5">
                      {column.map(group => (
                        <div key={group.title}>
                          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{group.title}</div>
                          <ul className="space-y-1.5 text-sm font-medium">
                            {group.items.map(item => (
                              <li key={item} className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-white/5 text-center space-y-4">
              <div className="text-[10px] leading-relaxed text-white/30 italic max-w-md mx-auto">
                <p>This extension is not affiliated with, maintained, or endorsed by the ToonHQ team.</p>
              </div>
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
