import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { ROADMAP_ITEMS, RoadmapStatus } from '../constants/roadmap';
import { buildPublicPagePath } from '../config/project';

const STATUS_STYLE: Record<RoadmapStatus, string> = {
  inProgress: 'bg-brand/10 text-brand border-brand/30',
  planned: 'bg-subtle text-primary border-subtle',
  exploring: 'bg-subtle text-secondary border-subtle',
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** What is coming next, as an animated timeline. Indicative horizons, never firm dates. */
const Roadmap: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PublicPageShell title={t('roadmap:title')} intro={t('roadmap:intro')}>
      <ol className="relative border-l border-subtle ml-2 space-y-10">
        {ROADMAP_ITEMS.map((item, index) => (
          <m.li
            key={item.key}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 0.05 * index, duration: 0.5, ease: EASE_OUT }}
            className="relative pl-8"
          >
            <span
              aria-hidden="true"
              className={`absolute -left-[7px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                item.status === 'inProgress' ? 'bg-brand border-brand' : 'bg-card border-strong'
              }`}
            />
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLE[item.status]}`}>
                {t(`roadmap:status.${item.status}`)}
              </span>
              <span className="text-xs font-semibold text-tertiary">{t(`roadmap:horizon.${item.horizon}`)}</span>
            </div>
            <h2 className="text-lg font-bold text-primary mb-1.5">{t(`roadmap:items.${item.key}.title`)}</h2>
            <p className="text-[15px] text-secondary leading-relaxed max-w-prose">{t(`roadmap:items.${item.key}.body`)}</p>
          </m.li>
        ))}
      </ol>

      <p className="mt-12 text-sm text-secondary">
        {t('roadmap:disclaimer')}{' '}
        <Link to={buildPublicPagePath('/changelog')} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          {t('roadmap:changelogLink')}
          <ArrowRight size={14} />
        </Link>
      </p>
    </PublicPageShell>
  );
};

export default Roadmap;
