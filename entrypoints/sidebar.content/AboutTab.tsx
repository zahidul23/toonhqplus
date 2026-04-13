import React from 'react';
import { BookIcon } from './ShtickerBook';
import { changelog } from './changelog';

const contributors: { name: string; image: string; color: string }[] = [
  // {
  //   name: "Toony Hoque",
  //   image: "https://rendition.toontownrewritten.com/render/7414000001501b451bba1b25002525010400010000000000000000010000032c00/waving/256x256.webp",
  //   color: "from-purple-500/20"
  // },
  {
    name: "Holland",
    image: "https://rendition.toontownrewritten.com/render/7405010101b31ba51bbc1b10001f10010400123f00000000000000000000000000/portrait-grin/256x256.webp",
    color: "from-purple-500/20"
  },
];

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
                  Comprehensive Bosses & Facilities Data
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Calculators for Boiler and Cog Battles
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
                  Customizable Navigation Bar
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h5 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-1">Feedback & Support</h5>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-white/60">
                    Have any questions, suggestions or other feedback? Feel free to reach out!
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 font-bold w-16">Discord:</span>
                      <a href="https://discord.com/users/140381706992484352" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">@hoque</a>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 font-bold w-16">Email:</span>
                      <a href="mailto:toonyhoque@gmail.com" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">toonyhoque@gmail.com</a>
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  <img
                    src="https://rendition.toontownrewritten.com/render/7414000001501b451bba1b25002525010400010000000000000000010000032c00/waving/128x128.png"
                    alt="Waving Toon"
                    className="w-32 h-32 object-contain"
                  />
                </div>
              </div>
            </div>

            {contributors.length > 0 && <div className="pt-4 border-t border-white/5">
              <h5 className="text-sm font-black uppercase tracking-widest text-purple-400 mb-2">Developers</h5>
              <div className="flex flex-wrap gap-10">
                {contributors.map((contributor, i) => (
                  <div key={i} className="flex flex-col items-center gap-0 group cursor-default">
                    <div className="relative">
                      <div className={`absolute inset-0 bg-gradient-to-b ${contributor.color} to-transparent blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                      <img
                        src={contributor.image}
                        alt={contributor.name}
                        className="w-24 h-24 object-contain relative z-10 filter brightness-75 group-hover:brightness-110 group-hover:scale-105 transition-all duration-500"
                      />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-purple-400 transition-colors duration-300">
                      {contributor.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>}
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
                      const [, tag, text] = match;
                      const getTagStyles = (t: string) => {
                        const low = t.toLowerCase();
                        if (low.includes('feature')) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
                        if (low.includes('ui')) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                        if (low.includes('bug')) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
                        if (low.includes('performance')) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                        if (low.includes('major') || low.includes('update')) return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
                        if (low.includes('privacy')) return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
                        return 'text-white/50 bg-white/5 border-white/10';
                      };

                      return (
                        <li key={i} className="text-xs text-white/70 leading-relaxed flex items-start gap-2.5 group">

                          <div className="flex-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider transition-all duration-300 mr-2 mb-1.5 ${getTagStyles(tag)}`}>
                              {tag}
                            </span>
                            <span className="group-hover:text-white transition-colors">{text}</span>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="text-xs text-white/70 leading-relaxed flex gap-2.5 items-start">
                        <span className="text-emerald-500/40 mt-1.5 shrink-0">•</span>
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
