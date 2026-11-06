import { ArrowLeftRight, ChevronRight, FileWarning, FolderSync, MapPin } from 'lucide-react';
import { useAttention, type AttentionItem } from '../attention';

const ICONS: Record<AttentionItem['id'], typeof FileWarning> = {
  revisar: FileWarning,
  'de-para': ArrowLeftRight,
  pasta: FolderSync,
  reler: MapPin,
};

/** Tudo o que pede ação, num lugar só, com o próximo passo de cada item. */
export function AttentionPanel() {
  const { items } = useAttention();
  if (items.length === 0) return null;
  return (
    <section className="panel attention" aria-labelledby="atencao-titulo">
      <div className="panel__head" style={{ marginBottom: 8 }}>
        <h2 id="atencao-titulo">Precisa da sua atenção</h2>
      </div>
      <ul className="plain attention__list">
        {items.map((it) => {
          const Icon = ICONS[it.id];
          return (
            <li key={it.id}>
              <a className="attention__item" href={`#${it.action.route}`}>
                <span className="cat-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="attention__text">
                  <strong>{it.title}</strong>
                  <small>{it.detail}</small>
                </span>
                <span className="attention__cta">
                  {it.action.label} <ChevronRight size={16} aria-hidden="true" />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
