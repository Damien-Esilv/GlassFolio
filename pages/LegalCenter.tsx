import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import {
  FileText,
  ShieldCheck,
  Scale,
  Cookie,
  Accessibility,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  getConsent,
  setConsent,
  resetConsent,
  subscribeConsent,
  ConsentRecord,
} from '../src/services/consentService';
import { useAuth } from '../context/AuthContext';
import { LEGAL_TEXT_VARS, SUBPROCESSOR_IDS } from '../src/config/legal';
import { getAppUrl, buildAppDestinationUrl, getAppTarget } from '../src/config/deployment';

type LegalTab = 'legal' | 'privacy' | 'terms' | 'cookies' | 'accessibility';

const TAB_CONFIG: { id: LegalTab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'legal', icon: FileText, labelKey: 'legal:center.tabs.legal' },
  { id: 'privacy', icon: ShieldCheck, labelKey: 'legal:center.tabs.privacy' },
  { id: 'terms', icon: Scale, labelKey: 'legal:center.tabs.terms' },
  { id: 'cookies', icon: Cookie, labelKey: 'legal:center.tabs.cookies' },
  { id: 'accessibility', icon: Accessibility, labelKey: 'legal:center.tabs.accessibility' },
];

function resolveActiveTab(pathname: string): LegalTab {
  if (pathname.includes('/privacy')) return 'privacy';
  if (pathname.includes('/terms')) return 'terms';
  if (pathname.includes('/cookies')) return 'cookies';
  if (pathname.includes('/accessibility')) return 'accessibility';
  return 'legal';
}

const COOKIE_ROW_KEYS = [
  'vaultHeader',
  'vaultPayload',
  'themeLang',
  'consent',
  'supabaseSession',
  'oauthVerifier',
  'marketCaches',
  'uiState',
] as const;

type LegalDocKey = 'legalNotice' | 'privacy' | 'terms';

interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  callout?: { tone: 'positive' | 'warning'; text: string };
  table?: 'subprocessors';
}

const CALLOUT_CLASSES: Record<'positive' | 'warning', string> = {
  positive: 'bg-positive-subtle/40 border-positive/30 text-positive',
  warning: 'bg-warning-subtle/60 border-warning/30 text-primary',
};

const LegalDocument: React.FC<{ docKey: LegalDocKey }> = ({ docKey }) => {
  const { t } = useTranslation();
  const sections = t(`legal:${docKey}.sections`, { returnObjects: true, ...LEGAL_TEXT_VARS }) as unknown as LegalSection[];

  return (
    <article className="space-y-6">
      <div className="border-b border-subtle pb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-primary">{t(`legal:${docKey}.title`)}</h2>
        <p className="text-xs text-tertiary mt-1">{t(`legal:${docKey}.lastUpdated`, LEGAL_TEXT_VARS)}</p>
      </div>

      {Array.isArray(sections) && sections.map((section, index) => (
        <section key={section.id} className={`space-y-2.5 ${index > 0 ? 'pt-4 border-t border-subtle' : ''}`}>
          <h3 className="text-base font-bold text-primary">{section.title}</h3>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-secondary">{paragraph}</p>
          ))}
          {section.callout && (
            <div className={`p-4 rounded-xl border text-xs font-semibold leading-relaxed ${CALLOUT_CLASSES[section.callout.tone]}`}>
              {section.callout.text}
            </div>
          )}
          {section.items && (
            <ul className="space-y-2 text-secondary pl-1">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {section.table === 'subprocessors' && (
            <div className="overflow-x-auto rounded-xl border border-subtle">
              <table className="w-full text-xs text-left">
                <thead className="bg-subtle text-secondary font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">{t('legal:privacy.subprocessors.headerName')}</th>
                    <th className="py-3 px-4">{t('legal:privacy.subprocessors.headerPurpose')}</th>
                    <th className="py-3 px-4">{t('legal:privacy.subprocessors.headerLocation')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {SUBPROCESSOR_IDS.map((id) => (
                    <tr key={id}>
                      <td className="py-3 px-4 font-bold text-primary">{t(`legal:privacy.subprocessors.${id}.name`)}</td>
                      <td className="py-3 px-4 text-secondary">{t(`legal:privacy.subprocessors.${id}.purpose`)}</td>
                      <td className="py-3 px-4 text-tertiary">{t(`legal:privacy.subprocessors.${id}.location`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  );
};

const LegalCenter: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isExternalApp = Boolean(getAppUrl());
  const isShowcaseTarget = getAppTarget() === 'showcase';
  const isWelcomeBase = location.pathname.startsWith('/welcome');
  const homeTarget = isWelcomeBase ? '/welcome' : (isShowcaseTarget ? '/' : '/welcome');

  const [activeTab, setActiveTab] = useState<LegalTab>(() => resolveActiveTab(location.pathname));
  const [consentState, setConsentState] = useState<ConsentRecord | null>(() => getConsent());

  useEffect(() => {
    setActiveTab(resolveActiveTab(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    const unsub = subscribeConsent((record) => {
      setConsentState(record);
    });
    return unsub;
  }, []);

  const getTabPath = (tabId: LegalTab): string => {
    return isWelcomeBase ? `/welcome/${tabId}` : `/${tabId}`;
  };

  const handleTabChange = (tabId: LegalTab) => {
    setActiveTab(tabId);
    navigate(getTabPath(tabId));
  };

  return (
    <div className="min-h-screen bg-canvas text-primary font-display flex flex-col">
      <LandingHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        {/* Navigation Breadcrumb / Back Link */}
        <div className="flex items-center justify-between mb-8">
          {user ? (
            isExternalApp ? (
              <a
                href={buildAppDestinationUrl('/')}
                className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                <span>{t('legal:center.backToApp')}</span>
              </a>
            ) : (
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                <span>{t('legal:center.backToApp')}</span>
              </Link>
            )
          ) : (
            <Link
              to={homeTarget}
              className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors"
            >
              <ArrowLeft size={14} />
              <span>{t('legal:center.backToHome')}</span>
            </Link>
          )}
        </div>

        {/* Page Heading */}
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-2">
            {t('legal:center.pageTitle')}
          </h1>
          <p className="text-sm sm:text-base text-secondary">
            {t('legal:center.pageSubtitle')}
          </p>
        </div>

        {/* Tab Navigation Bar */}
        <div className="flex overflow-x-auto gap-2 border-b border-subtle pb-3 mb-8 no-scrollbar" role="tablist">
          {TAB_CONFIG.map(({ id, icon: Icon, labelKey }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => handleTabChange(id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-brand/20'
                    : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                }`}
              >
                <Icon size={16} />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="bg-card border border-subtle rounded-2xl p-6 sm:p-10 shadow-xl leading-relaxed text-sm">
          {/* TAB 1-3: Mentions légales, Privacy Policy (RGPD), Terms of Use (CGU) */}
          {activeTab === 'legal' && <LegalDocument docKey="legalNotice" />}
          {activeTab === 'privacy' && <LegalDocument docKey="privacy" />}
          {activeTab === 'terms' && <LegalDocument docKey="terms" />}

          {/* TAB 4: COOKIES & LOCAL STORAGE */}
          {activeTab === 'cookies' && (
            <article className="space-y-6">
              <div className="border-b border-subtle pb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-primary">
                  {t('legal:cookies.title')}
                </h2>
                <p className="text-xs text-tertiary mt-1">{t('legal:cookies.lastUpdated')}</p>
              </div>

              <p className="text-secondary">{t('legal:cookies.overviewText')}</p>

              {/* Inventory Table */}
              <div className="pt-2">
                <h3 className="text-base font-bold text-primary mb-3">
                  {t('legal:cookies.tableTitle')}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-subtle">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-subtle text-secondary font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">{t('legal:cookies.tableKey')}</th>
                        <th className="py-3 px-4">{t('legal:cookies.tableCategory')}</th>
                        <th className="py-3 px-4">{t('legal:cookies.tablePurpose')}</th>
                        <th className="py-3 px-4">{t('legal:cookies.tableLifespan')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {COOKIE_ROW_KEYS.map((rowKey) => (
                        <tr key={rowKey} className="hover:bg-subtle/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-brand">
                            {t(`legal:cookies.rows.${rowKey}.key`)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-primary">
                            {t(`legal:cookies.rows.${rowKey}.category`)}
                          </td>
                          <td className="py-3 px-4 text-secondary">
                            {t(`legal:cookies.rows.${rowKey}.purpose`)}
                          </td>
                          <td className="py-3 px-4 text-tertiary">
                            {t(`legal:cookies.rows.${rowKey}.lifespan`)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interactive Consent Management Card */}
              <div className="p-6 rounded-2xl bg-subtle/60 border border-subtle">
                <h3 className="text-base font-bold text-primary mb-3">
                  {t('legal:cookies.managerTitle')}
                </h3>

                <div className="flex items-center gap-2 mb-4 text-xs font-semibold">
                  <span className="text-secondary">{t('legal:cookies.currentStatusLabel')}</span>
                  {consentState === null ? (
                    <span className="inline-flex items-center gap-1 text-tertiary">
                      <HelpCircle size={14} />
                      <span>{t('legal:cookies.statusUnset')}</span>
                    </span>
                  ) : consentState.analytics ? (
                    <span className="inline-flex items-center gap-1 text-positive">
                      <CheckCircle2 size={14} />
                      <span>{t('legal:cookies.statusAccepted')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <XCircle size={14} />
                      <span>{t('legal:cookies.statusRefused')}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConsent(true)}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-sm"
                  >
                    {t('legal:cookies.grantAnalyticsBtn')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsent(false)}
                    className="px-4 py-2 rounded-xl bg-card hover:bg-card-hover text-secondary hover:text-primary border border-subtle text-xs font-bold transition-all"
                  >
                    {t('legal:cookies.revokeAnalyticsBtn')}
                  </button>

                  <button
                    type="button"
                    onClick={resetConsent}
                    className="px-4 py-2 rounded-xl bg-subtle hover:bg-card-hover text-tertiary hover:text-secondary border border-subtle text-xs font-medium transition-all"
                  >
                    {t('legal:cookies.resetConsentBtn')}
                  </button>
                </div>
              </div>
            </article>
          )}

          {/* TAB 5: ACCESSIBILITY (RGAA 4.1) */}
          {activeTab === 'accessibility' && (
            <article className="space-y-6">
              <div className="border-b border-subtle pb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-primary">
                  {t('legal:accessibility.title')}
                </h2>
                <p className="text-xs text-tertiary mt-1">{t('legal:accessibility.lastUpdated')}</p>
              </div>

              <section className="space-y-2.5">
                <h3 className="text-base font-bold text-primary">
                  {t('legal:accessibility.statusTitle')}
                </h3>
                <p className="text-secondary">{t('legal:accessibility.statusText')}</p>
              </section>

              <section className="space-y-2.5 pt-4 border-t border-subtle">
                <h3 className="text-base font-bold text-primary">
                  {t('legal:accessibility.standardsTitle')}
                </h3>
                <ul className="space-y-2 text-secondary pl-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-positive mt-0.5 shrink-0" />
                    <span>{t('legal:accessibility.featAria')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-positive mt-0.5 shrink-0" />
                    <span>{t('legal:accessibility.featContrast')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-positive mt-0.5 shrink-0" />
                    <span>{t('legal:accessibility.featKeyboard')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-positive mt-0.5 shrink-0" />
                    <span>{t('legal:accessibility.featMotion')}</span>
                  </li>
                </ul>
              </section>

              <section className="space-y-2.5 pt-4 border-t border-subtle">
                <h3 className="text-base font-bold text-primary">
                  {t('legal:accessibility.feedbackTitle')}
                </h3>
                <p className="text-secondary">{t('legal:accessibility.feedbackText', LEGAL_TEXT_VARS)}</p>
              </section>
            </article>
          )}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};

export default LegalCenter;
