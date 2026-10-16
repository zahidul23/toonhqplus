import React from 'react';

type UniteCategory = 'Toon-Up' | 'Jellybeans' | 'Gag-Up' | 'Promotions' | 'Cartoonival';
type UniteInventoryProps = {
  unites: Record<string, Record<string, number>>;
  getImageUrl: (path: string) => string;
};
type UniteItem = { name: string; count: number };

const GAG_ORDER = ['Toon-Up', 'Trap', 'Lure', 'Sound', 'Throw', 'Squirt', 'Drop', 'All'];
const CORE_UNITE_TYPES: Partial<Record<UniteCategory, string[]>> = {
  'Toon-Up': [20, 35, 50, 65, 80].map(amount => `${amount} Toon-Up`),
  Jellybeans: [100, 200, 350, 600].map(amount => `${amount} Jellybeans`),
  'Gag-Up': GAG_ORDER.map(track => `Gag-Up ${track}`),
};
const CATEGORY_DETAILS: Record<UniteCategory, { image: string; capacity?: number }> = {
  'Toon-Up': { image: 'unites/pixie-dust.webp', capacity: 500 },
  'Jellybeans': { image: 'unites/jellybean-jar.webp', capacity: 400 },
  'Gag-Up': { image: 'unites/gag-up-all.webp', capacity: 800 },
  'Promotions': { image: 'suits/Cashbot.png' },
  'Cartoonival': { image: 'unites/cartoonival-token-jar.webp' },
};

function cleanName(name: string) {
  return name.replace(/[\u0000-\u001f]/g, '').trim();
}

function gagIndex(name: string) {
  const index = GAG_ORDER.findIndex(track => name.toLowerCase().endsWith(track.toLowerCase()));
  return index === -1 ? GAG_ORDER.length : index;
}

function getUniteImage(category: UniteCategory, name: string) {
  const amount = Number(name.match(/\d+/)?.[0]);
  if (category === 'Toon-Up' && [20, 35, 50, 65, 80].includes(amount)) {
    return `unites/toon-up-${amount}.webp`;
  }
  if (category === 'Jellybeans' && [100, 200, 350, 600].includes(amount)) {
    return `unites/jellybeans-${amount}.webp`;
  }
  if (category === 'Cartoonival' && amount === 25) {
    return 'unites/cartoonival-25.webp';
  }
  if (category === 'Gag-Up') {
    const track = GAG_ORDER[gagIndex(name)];
    if (track) return `unites/gag-up-${track.toLowerCase()}.webp`;
  }
  return CATEGORY_DETAILS[category].image;
}

function getUniteLabel(category: UniteCategory, name: string) {
  const amount = name.match(/\d+/)?.[0];
  if (category === 'Toon-Up' && amount) return `${amount} Laff`;
  if (category === 'Jellybeans' && amount) return `${amount} beans`;
  if (category === 'Gag-Up') return name.replace(/^Gag-Up\s*/i, '') || name;
  return name;
}

function getUniteItems(category: UniteCategory, types: Record<string, number>): UniteItem[] {
  const canonicalize = (rawName: string) => {
    const name = cleanName(rawName);
    const amount = name.match(/\d+/)?.[0];
    if (category === 'Jellybeans' && amount) return `${amount} Jellybeans`;
    if (category === 'Toon-Up' && amount) return `${amount} Toon-Up`;
    if (category === 'Gag-Up') {
      const track = GAG_ORDER.find(value => name.toLowerCase().endsWith(value.toLowerCase()));
      if (track) return `Gag-Up ${track}`;
    }
    return name;
  };
  const itemCounts = new Map<string, number>();
  Object.entries(types).forEach(([rawName, count]) => {
    const name = canonicalize(rawName);
    itemCounts.set(name, Math.max(itemCounts.get(name) || 0, count));
  });
  const items = [...new Set([...(CORE_UNITE_TYPES[category] || []), ...itemCounts.keys()])]
    .map(name => ({ name, count: itemCounts.get(name) || 0 }))
    .filter(({ name }) => category !== 'Promotions' || /^(100|200|350|600|900)\s+Cogbucks$/i.test(name));
  items.sort((a, b) => category === 'Gag-Up'
    ? gagIndex(a.name) - gagIndex(b.name) || a.name.localeCompare(b.name)
    : a.name.localeCompare(b.name, undefined, { numeric: true }));
  return items;
}

const UniteSection = React.memo(({ category, items, getImageUrl, fullWidth = false }: {
  category: UniteCategory;
  items: UniteItem[];
  getImageUrl: UniteInventoryProps['getImageUrl'];
  fullWidth?: boolean;
}) => {
  const details = CATEGORY_DETAILS[category];
  const max = category === 'Cartoonival' ? 5 : 100;
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className={`unite-section ${fullWidth ? 'unite-section-full-width' : ''}`} aria-label={`${category} Unites`}>
      <header className="unite-section-heading" data-empty={total === 0 || undefined}>
        <img src={getImageUrl(`images/${details.image}`)} alt="" className="unite-category-icon" />
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-black text-emerald-50">{category}</h4>
        </div>
        <span className="unite-section-total" aria-label={`${total}${details.capacity ? ` of ${details.capacity}` : ''} ${category} Unites total`}>
          {total}{details.capacity && <span className="text-[11px] font-bold text-emerald-100/50">/{details.capacity}</span>}
        </span>
      </header>
      {items.length > 0 ? <ul className="unite-items">
        {items.map(({ name, count }) => (
          <li
            key={name}
            className="unite-item"
            data-empty={count === 0 || undefined}
            title={`${name}: ${count} / ${max} held`}
          >
            <img src={getImageUrl(`images/${getUniteImage(category, name)}`)} alt="" className="unite-item-icon" />
            <div className="min-w-0">
              <div className="unite-item-label">{getUniteLabel(category, name)}</div>
              <div className="unite-item-count" aria-label={`${count} of ${max} held`}>
                {count}<span>/{max}</span>
              </div>
            </div>
          </li>
        ))}
      </ul> : <p className="unite-empty">No {category} Unites held</p>}
    </section>
  );
});

export const UniteInventory = React.memo(({ unites, getImageUrl }: UniteInventoryProps) => {
  const section = (category: UniteCategory) => ({
    category,
    items: getUniteItems(category, unites[category] || {}),
  });
  const toonUp = section('Toon-Up');
  const jellybeans = section('Jellybeans');
  const gagUp = section('Gag-Up');
  const cartoonival = section('Cartoonival');
  const promotions = section('Promotions');
  const showCartoonival = cartoonival.items.some(item => item.count > 0);
  const showPromotions = promotions.items.some(item => item.count > 0);

  return (
    <div className="unite-inventory">
      <div className="unite-layout">
        <div className="unite-columns" data-align-promotions={showPromotions && !showCartoonival || undefined}>
          <div className="unite-column">
            <UniteSection {...toonUp} getImageUrl={getImageUrl} />
            <UniteSection {...jellybeans} getImageUrl={getImageUrl} />
          </div>
          <div className="unite-column">
            <UniteSection {...gagUp} getImageUrl={getImageUrl} />
            {showCartoonival && <UniteSection {...cartoonival} getImageUrl={getImageUrl} />}
            {showPromotions && !showCartoonival && <UniteSection {...promotions} getImageUrl={getImageUrl} />}
          </div>
        </div>
        {showPromotions && showCartoonival && (
          <UniteSection {...promotions} getImageUrl={getImageUrl} fullWidth />
        )}
      </div>
    </div>
  );
});
