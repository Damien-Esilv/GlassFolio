import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hexagon, Sparkles, Lock, ArrowRight, ShieldCheck, Cookie, Github } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { openConsentPreferences } from '../../services/consentService';
import { getDeploymentMode, getAppUrl, buildAppDestinationUrl, getAppTarget } from '../../config/deployment';
import { usePublicThemeLang } from '../../hooks/usePublicThemeLang';
import { GITHUB_REPO_URL, GITHUB_LICENSE_URL, buildPublicPagePath } from '../../config/project';
import { useDemoOffered } from '../../hooks/useDemoOffered';

export const LandingFooter: React.FC = () => {
  const { t } = useTranslation();
  const { theme, language } = usePublicThemeLang();
  const { launchDemo, isLaunchingDemo } = useDemoAccess();
  const demoOffered = useDemoOffered();
  const currentYear = new Date().getFullYear();
  const deploymentMode = getDeploymentMode();
  const isExternalApp = Boolean(getAppUrl());
  const isShowcaseTarget = getAppTarget() === 'showcase';
  const showcaseHome = isShowcaseTarget ? '/' : '/welcome';
  const legalBasePath = isShowcaseTarget ? '' : '/welcome';
  const appTransition = { theme, lang: language };

  return (
    <footer className="border-t border-subtle bg-canvas transition-colors">
      {/* Pre-Footer CTA Band */}
      <div className="border-b border-subtle bg-card/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <ShieldCheck size={14} />
            <span>{t('landing:footer.zkBadge')}</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-3">
            {t('landing:footer.ctaTitle')}
          </h3>

          <p className="text-sm text-secondary max-w-2xl mx-auto mb-8">
            {t('landing:footer.ctaSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            {demoOffered && (
            <button
              type="button"
              onClick={() => launchDemo('/')}
              disabled={isLaunchingDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold px-6 py-3 rounded-xl shadow-md shadow-brand/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              <Sparkles size={16} />
              <span>{t('landing:common.tryLiveDemo')}</span>
            </button>
            )}

            {isExternalApp ? (
              <a
                href={buildAppDestinationUrl('/signup', appTransition)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-subtle hover:bg-card-hover border border-subtle text-primary text-xs sm:text-sm font-bold px-6 py-3 rounded-xl transition-all"
              >
                <Lock size={15} className="text-secondary" />
                <span>{t('landing:common.createEncryptedVault')}</span>
                <ArrowRight size={14} />
              </a>
            ) : (
              <Link
                to="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-subtle hover:bg-card-hover border border-subtle text-primary text-xs sm:text-sm font-bold px-6 py-3 rounded-xl transition-all"
              >
                <Lock size={15} className="text-secondary" />
                <span>{t('landing:common.createEncryptedVault')}</span>
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Footer Links & Legal Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
          {/* Brand Info */}
          <div className="max-w-sm">
            <Link to={showcaseHome} className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45">
                <div className="transform -rotate-45 text-white font-bold text-base">
                  <Hexagon size={16} fill="currentColor" />
                </div>
              </div>
              <span className="text-lg font-bold tracking-tight text-primary">
                {t('landing:header.brandName')}
              </span>
            </Link>
            <p className="text-xs text-secondary leading-relaxed mb-3">
              {t('landing:footer.brandDescription')}
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-subtle text-tertiary border border-subtle text-[11px] font-mono font-semibold">
              {t('landing:footer.deploymentBadge', { mode: t(`landing:footer.deploymentModes.${deploymentMode}`) })}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-10 sm:gap-16">
          {/* The Project Column (public pages) */}
          <div>
            <h4 className="text-xs font-bold text-primary mb-3">
              {t('landing:footer.projectHeading')}
            </h4>
            <ul className="space-y-1 text-xs text-secondary font-medium">
              <li>
                <Link to={buildPublicPagePath('/about')} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:header.pageAbout')}
                </Link>
              </li>
              <li>
                <Link to={buildPublicPagePath('/roadmap')} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:header.pageRoadmap')}
                </Link>
              </li>
              <li>
                <Link to={buildPublicPagePath('/changelog')} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:header.pageChangelog')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Source Code Column */}
          <div>
            <h4 className="text-xs font-bold text-primary mb-3">
              {t('landing:footer.sourceHeading')}
            </h4>
            <ul className="space-y-1 text-xs text-secondary font-medium">
              <li>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 py-1 hover:text-primary transition-colors">
                  <Github size={13} />
                  <span>{t('landing:footer.githubRepo')}</span>
                </a>
              </li>
              <li>
                <Link to={buildPublicPagePath('/self-host')} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.selfHostGuide')}
                </Link>
              </li>
              <li>
                <a href={GITHUB_LICENSE_URL} target="_blank" rel="noopener noreferrer" className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.license')}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Center Column */}
          <div>
            <h4 className="text-xs font-bold text-primary mb-3">
              {t('landing:footer.legalHeading')}
            </h4>
            <ul className="space-y-1 text-xs text-secondary font-medium">
              <li>
                <Link to={`${legalBasePath}/legal`} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.legalNotice')}
                </Link>
              </li>
              <li>
                <Link to={`${legalBasePath}/privacy`} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.privacyPolicy')}
                </Link>
              </li>
              <li>
                <Link to={`${legalBasePath}/terms`} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.termsOfUse')}
                </Link>
              </li>
              <li>
                <Link to={`${legalBasePath}/cookies`} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.cookiesStorage')}
                </Link>
              </li>
              <li>
                <Link to={`${legalBasePath}/accessibility`} className="inline-block py-1 hover:text-primary transition-colors">
                  {t('landing:footer.accessibility')}
                </Link>
              </li>
              <li className="pt-1">
                <button
                  type="button"
                  onClick={openConsentPreferences}
                  className="inline-flex items-center gap-1.5 text-brand hover:underline font-semibold focus:outline-none"
                >
                  <Cookie size={13} />
                  <span>{t('landing:footer.cookiePreferencesBtn')}</span>
                </button>
              </li>
            </ul>
          </div>
          </div>
        </div>

        {/* Regulatory Disclaimer, Trademark Notice & Copyright */}
        <div className="pt-6 border-t border-subtle text-[11px] text-tertiary space-y-2 leading-relaxed">
          <p>{t('landing:footer.regulatoryDisclaimer')}</p>
          <p>{t('landing:footer.trademarkNotice')}</p>
          <p>{t('landing:footer.copyright', { year: currentYear })}</p>
        </div>
      </div>
    </footer>
  );
};
