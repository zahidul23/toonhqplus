import React from 'react';

type RemoteInventoryProps = {
  remotes: Record<string, Record<string, number>>;
  getImageUrl: (path: string) => string;
};

const REMOTE_TYPES = [
  { kind: 'damage', label: 'Damage Remotes', match: /damage/i },
  { kind: 'healing', label: 'Healing Remotes', match: /heal/i },
] as const;

export const RemoteInventory = React.memo(({ remotes, getImageUrl }: RemoteInventoryProps) => {
  return (
  <div className="remote-inventory">
    <div className="remote-panel">
      {REMOTE_TYPES.map(({ kind, label, match }) => (
        <section className="remote-category" key={kind} aria-label={label}>
          <h4 className="remote-category-heading reward-heading">{label}</h4>
          <ul className="remote-grid">
            {[1, 2, 3].map(level => {
              const count = Object.entries(remotes)
                .filter(([type]) => match.test(type))
                .reduce((total, [, levels]) => total + (levels[String(level)] || 0), 0);
              return (
                <li
                  className="remote-slot"
                  key={level}
                  data-empty={count === 0 || undefined}
                  aria-label={`${level}-star ${label}: ${count} of 100 held`}
                  title={`${level}-star ${label}: ${count} / 100 held`}
                >
                  <div className="remote-stars" aria-hidden="true">
                    {Array.from({ length: level }, (_, index) => (
                      <img src={getImageUrl('images/remotes/star.webp')} alt="" key={index} />
                    ))}
                  </div>
                  <img className="remote-device" src={getImageUrl(`images/remotes/${kind}-${level}.webp`)} alt="" />
                  <div className="remote-count" aria-hidden="true">{count}<span>/100</span></div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  </div>
  );
});
