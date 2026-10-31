import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bug, Mail, ShieldAlert, UserRound } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { LEGAL_CONTACT_EMAIL } from '../config/legal';
import { GITHUB_REPO_URL, buildPublicPagePath } from '../config/project';

const linkClass = 'text-sm font-semibold text-brand hover:underline';
const cardClass = 'rounded-2xl border border-subtle bg-card p-6';
const iconClass = 'w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0';
const bodyClass = 'text-sm text-secondary leading-relaxed mb-4';

/** Where to write for what: privacy rights, bugs, security reports, and the project itself. */
const Contact: React.FC = () => {
  const { t } = useTranslation();
  const securitySubject = encodeURIComponent(t('contact:sections.security.subject'));

  return (
    <PublicPageShell title={t('contact:title')} intro={t('contact:intro')}>
      <div className="grid gap-6 sm:grid-cols-2 mb-12">
        <section aria-labelledby="contact-privacy" className={cardClass}>
          <div className="flex items-center gap-3 mb-3">
            <span className={iconClass}><Mail size={20} aria-hidden="true" /></span>
            <h2 id="contact-privacy" className="text-lg font-bold text-primary">{t('contact:sections.privacy.title')}</h2>
          </div>
          <p className={bodyClass}>{t('contact:sections.privacy.body')}</p>
          <ul className="space-y-1">
            <li><a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={linkClass}>{t('contact:sections.privacy.mail', { email: LEGAL_CONTACT_EMAIL })}</a></li>
            <li><Link to={buildPublicPagePath('/privacy')} className={linkClass}>{t('contact:sections.privacy.policy')}</Link></li>
          </ul>
        </section>

        <section aria-labelledby="contact-issues" className={cardClass}>
          <div className="flex items-center gap-3 mb-3">
            <span className={iconClass}><Bug size={20} aria-hidden="true" /></span>
            <h2 id="contact-issues" className="text-lg font-bold text-primary">{t('contact:sections.issues.title')}</h2>
          </div>
          <p className={bodyClass}>{t('contact:sections.issues.body')}</p>
          <a href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className={linkClass}>{t('contact:sections.issues.link')}</a>
        </section>

        <section aria-labelledby="contact-security" className={cardClass}>
          <div className="flex items-center gap-3 mb-3">
            <span className={iconClass}><ShieldAlert size={20} aria-hidden="true" /></span>
            <h2 id="contact-security" className="text-lg font-bold text-primary">{t('contact:sections.security.title')}</h2>
          </div>
          <p className={bodyClass}>{t('contact:sections.security.body')}</p>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${securitySubject}`} className={linkClass}>{t('contact:sections.security.mail')}</a>
        </section>

        <section aria-labelledby="contact-project" className={cardClass}>
          <div className="flex items-center gap-3 mb-3">
            <span className={iconClass}><UserRound size={20} aria-hidden="true" /></span>
            <h2 id="contact-project" className="text-lg font-bold text-primary">{t('contact:sections.project.title')}</h2>
          </div>
          <p className={bodyClass}>{t('contact:sections.project.body')}</p>
          <ul className="space-y-1">
            <li><Link to={buildPublicPagePath('/about')} className={linkClass}>{t('contact:sections.project.about')}</Link></li>
            <li><Link to={buildPublicPagePath('/roadmap')} className={linkClass}>{t('contact:sections.project.roadmap')}</Link></li>
            <li><Link to={buildPublicPagePath('/changelog')} className={linkClass}>{t('contact:sections.project.changelog')}</Link></li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="contact-limits">
        <h2 id="contact-limits" className="text-2xl font-bold tracking-tight text-primary mb-3">{t('contact:limits.title')}</h2>
        <p className="text-base text-secondary leading-relaxed">{t('contact:limits.body')}</p>
      </section>
    </PublicPageShell>
  );
};

export default Contact;
