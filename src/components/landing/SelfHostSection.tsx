import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import {
  BookOpen, Github, HardDrive, Globe, Laptop, Smartphone, Tablet, RefreshCw, CheckCircle2,
  ShieldCheck, Sparkles, Download, Code2, Check,
} from 'lucide-react';
import { InstallTerminal } from './InstallTerminal';
import { AppLink } from './LandingHeader';
import { GITHUB_REPO_URL, buildPublicPagePath } from '../../config/project';

const COMPARISON_ROWS = ['data', 'account', 'internet', 'twoFactor', 'ai', 'cost'] as const;
const MODE_POINTS = ['p1', 'p2', 'p3'] as const;

/** Promises that hold in both modes. */
const SHARED_GUARANTEES = [
  { key: 'encrypted', icon: ShieldCheck },
  { key: 'ai', icon: Sparkles },
  { key: 'export', icon: Download },
  { key: 'source', icon: Code2 },
] as const;

const DEVICES = [
  { key: 'laptop', icon: Laptop },
  { key: 'phone', icon: Smartphone },
  { key: 'tablet', icon: Tablet },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Cloud counterpart of the install terminal: the same vault reaching every device. */
const CloudSyncPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="landing-terminal rounded-2xl border border-strong shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-subtle bg-card">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-tertiary">
          <Globe size={13} />
          {t('landing:localCloud.cloud.panelTitle')}
        </span>
        <RefreshCw size={14} className="text-brand" aria-hidden="true" />
      </div>
      <ul className="px-4 sm:px-5 py-5 space-y-3 min-h-[15rem]">
        {DEVICES.map(({ key, icon: Icon }, index) => (
          <m.li
            key={key}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.3 + index * 0.35, duration: 0.4, ease: EASE_OUT }}
            className="flex items-center gap-3 rounded-xl border border-subtle bg-card px-4 py-3"
          >
            <Icon size={18} className="text-secondary shrink-0" />
            <span className="text-sm text-primary flex-1">{t(`landing:localCloud.cloud.devices.${key}`)}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive">
              <CheckCircle2 size={14} />
              {t('landing:localCloud.cloud.synced')}
            </span>
          </m.li>
        ))}
      </ul>
    </div>
  );
};

const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap bg-primary hover:bg-primary-hover text-white text-sm font-bold px-5 py-3 rounded-xl shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap bg-subtle hover:bg-card-hover border border-subtle text-primary text-sm font-bold px-5 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';

/** Local (Docker) and cloud side by side, with the same weight, then what each one implies. */
export const SelfHostSection: React.FC = () => {
  const { t } = useTranslation();

  const renderMode = (mode: 'local' | 'cloud', icon: React.ReactNode, visual: React.ReactNode, actions: React.ReactNode) => (
    <div className="flex flex-col rounded-2xl border border-subtle bg-canvas p-5 sm:p-7">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-primary leading-tight">{t(`landing:localCloud.${mode}.title`)}</h3>
          <p className="text-sm text-secondary">{t(`landing:localCloud.${mode}.tagline`)}</p>
        </div>
      </div>
      <ul className="space-y-2 mb-6">
        {MODE_POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-primary">
            <Check size={16} className="text-positive mt-0.5 shrink-0" />
            <span>{t(`landing:localCloud.${mode}.points.${point}`)}</span>
          </li>
        ))}
      </ul>
      <div className="mb-6">{visual}</div>
      <div className="mt-auto flex flex-col sm:flex-row sm:flex-wrap gap-3">{actions}</div>
    </div>
  );

  return (
    <section id="local-cloud" className="relative py-16 lg:py-24 border-t border-subtle bg-card overflow-hidden scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
            {t('landing:localCloud.title')}
          </h2>
          <p className="text-base text-secondary leading-relaxed">{t('landing:localCloud.subtitle')}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-16">
          {renderMode(
            'local',
            <HardDrive size={21} />,
            <InstallTerminal />,
            <>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={primaryButton}>
                <Github size={17} />
                <span>{t('landing:localCloud.local.ctaGithub')}</span>
              </a>
              <Link to={buildPublicPagePath('/self-host')} className={secondaryButton}>
                <BookOpen size={16} className="text-secondary" />
                <span>{t('landing:localCloud.local.ctaGuide')}</span>
              </Link>
            </>
          )}
          {renderMode(
            'cloud',
            <Globe size={21} />,
            <CloudSyncPanel />,
            <>
              <AppLink path="/signup" className={primaryButton}>
                <span>{t('landing:localCloud.cloud.ctaSignup')}</span>
              </AppLink>
              <AppLink path="/login" className={secondaryButton}>
                <span>{t('landing:localCloud.cloud.ctaLogin')}</span>
              </AppLink>
            </>
          )}
        </div>

        <div className="mb-16">
          <h3 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mb-6">
            {t('landing:localCloud.compare.title')}
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-subtle">
            <table className="w-full min-w-[40rem] text-sm text-left">
              <thead>
                <tr className="bg-subtle">
                  <th scope="col" className="px-4 py-3 font-semibold text-secondary w-1/4">
                    <span className="sr-only">{t('landing:localCloud.compare.criterion')}</span>
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold text-primary w-[37.5%]">
                    <span className="inline-flex items-center gap-2">
                      <HardDrive size={15} className="text-brand" />
                      {t('landing:localCloud.compare.local')}
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold text-primary w-[37.5%]">
                    <span className="inline-flex items-center gap-2">
                      <Globe size={15} className="text-brand" />
                      {t('landing:localCloud.compare.cloud')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <m.tr
                    key={row}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.8 }}
                    transition={{ delay: index * 0.06, duration: 0.35 }}
                    className="border-t border-subtle"
                  >
                    <th scope="row" className="px-4 py-3 font-semibold text-primary align-top">
                      {t(`landing:localCloud.compare.rows.${row}.label`)}
                    </th>
                    <td className="px-4 py-3 text-primary align-top">{t(`landing:localCloud.compare.rows.${row}.local`)}</td>
                    <td className="px-4 py-3 text-primary align-top">{t(`landing:localCloud.compare.rows.${row}.cloud`)}</td>
                  </m.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mb-6">
          {t('landing:localCloud.shared.title')}
        </h3>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8">
          {SHARED_GUARANTEES.map(({ key, icon: Icon }) => (
            <li key={key} className="border-t-2 border-brand/30 pt-4">
              <Icon size={20} className="text-brand mb-3" />
              <p className="text-sm font-bold text-primary mb-1.5">{t(`landing:localCloud.shared.${key}.title`)}</p>
              <p className="text-sm text-secondary leading-relaxed">{t(`landing:localCloud.shared.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
