import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { CHANGELOG, ChangeKind } from '../constants/changelog';
import { buildPublicPagePath } from '../config/project';

const KIND_STYLE: Record<ChangeKind, string> = {
  new: 'bg-positive/10 text-positive border-positive/30',
  improved: 'bg-brand/10 text-brand border-brand/30',
};

/** Release notes, newest first; each version has its own anchor (#v5-1). */
const Changelog: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US', { dateStyle: 'long' });

  return (
    <PublicPageShell title={t('changelog:title')} intro={t('changelog:intro')}>
      <div className="space-y-14">
        {CHANGELOG.map((entry, index) => (
          <m.article
            key={entry.id}
            id={entry.id}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ delay: index === 0 ? 0.1 : 0, duration: 0.5 }}
            className="scroll-mt-24 grid md:grid-cols-[9rem_1fr] gap-3 md:gap-8"
            aria-labelledby={`${entry.id}-title`}
          >
            <div>
              <a href={`#${entry.id}`} className="text-sm font-bold text-primary hover:text-brand">
                {t('changelog:versionLabel', { version: entry.version })}
              </a>
              <p className="text-xs text-tertiary mt-1">
                <time dateTime={entry.date}>{dateFormat.format(new Date(`${entry.date}T00:00:00`))}</time>
              </p>
            </div>
            <div>
              <h2 id={`${entry.id}-title`} className="text-xl font-bold tracking-tight text-primary mb-4">
                {t(`changelog:entries.${entry.id}.title`)}
              </h2>
              <ul className="space-y-3">
                {entry.highlights.map((highlight) => (
                  <li key={highlight.key} className="flex items-start gap-3 text-[15px] text-secondary leading-relaxed">
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${KIND_STYLE[highlight.kind]}`}>
                      {t(`changelog:kind.${highlight.kind}`)}
                    </span>
                    <span>{t(`changelog:entries.${entry.id}.highlights.${highlight.key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </m.article>
        ))}
      </div>

      <p className="mt-14 text-sm text-secondary">
        <Link to={buildPublicPagePath('/roadmap')} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          {t('changelog:roadmapLink')}
          <ArrowRight size={14} />
        </Link>
      </p>
    </PublicPageShell>
  );
};

export default Changelog;
