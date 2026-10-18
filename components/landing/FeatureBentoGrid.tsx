import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Palette, Download, Server, Sparkles, Flame, Check } from 'lucide-react';

export const FeatureBentoGrid: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <Sparkles size={14} />
            <span>{t('landing:bento.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:bento.title')}
          </h2>

          <p className="text-sm sm:text-base text-secondary leading-relaxed">
            {t('landing:bento.subtitle')}
          </p>
        </div>

        {/* 4-Card Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Card 1 (Span 2 on lg): Goals, 21 Investor Ranks & DCA Streaks */}
          <div className="lg:col-span-2 bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col justify-between group hover:border-brand/40 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Trophy size={20} />
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-subtle text-secondary border border-subtle text-xs font-bold">
                  <Flame size={13} className="text-warning" />
                  <span>{t('landing:bento.gamification.badge')}</span>
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-primary mb-2">
                {t('landing:bento.gamification.title')}
              </h3>

              <p className="text-sm text-secondary leading-relaxed mb-6">
                {t('landing:bento.gamification.description')}
              </p>
            </div>

            {/* Visual mini-pill progression preview */}
            <div className="pt-4 border-t border-subtle flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-subtle text-[11px] font-semibold text-secondary">
                Novice Investor (Lvl 1)
              </span>
              <span className="text-tertiary">&rarr;</span>
              <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                DCA Disciplined (Lvl 5)
              </span>
              <span className="text-tertiary">&rarr;</span>
              <span className="px-2.5 py-1 rounded-lg bg-subtle text-[11px] font-semibold text-secondary">
                Market Titan (Lvl 21)
              </span>
              <span className="ml-auto text-xs font-bold text-positive flex items-center gap-1">
                <Check size={14} />
                <span>6-Month Streak</span>
              </span>
            </div>
          </div>

          {/* Card 2: 3 Curated Themes & Bilingual Parity */}
          <div className="bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col justify-between group hover:border-brand/40 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Palette size={20} />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-bold">
                  {t('landing:bento.theming.badge')}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-primary mb-2">
                {t('landing:bento.theming.title')}
              </h3>

              <p className="text-xs sm:text-sm text-secondary leading-relaxed">
                {t('landing:bento.theming.description')}
              </p>
            </div>

            <div className="pt-4 mt-6 border-t border-subtle flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-secondary font-medium">
                <span className="w-3 h-3 rounded-full bg-card border border-subtle" title="Light" />
                <span className="w-3 h-3 rounded-full bg-subtle border border-subtle" title="Dark" />
                <span className="w-3 h-3 rounded-full bg-primary/20 border border-primary/40" title="Midnight" />
              </div>
              <span className="text-xs font-bold text-primary ml-auto">FR / EN 100%</span>
            </div>
          </div>

          {/* Card 3: GDPR Article 20 Data Portability & Merge */}
          <div className="bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col justify-between group hover:border-brand/40 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Download size={20} />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-bold">
                  {t('landing:bento.portability.badge')}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-primary mb-2">
                {t('landing:bento.portability.title')}
              </h3>

              <p className="text-xs sm:text-sm text-secondary leading-relaxed">
                {t('landing:bento.portability.description')}
              </p>
            </div>

            <div className="pt-4 mt-6 border-t border-subtle flex items-center justify-between text-xs">
              <span className="font-mono text-secondary">BackupMergeWizard</span>
              <span className="font-bold text-positive">Zero Data Lock-In</span>
            </div>
          </div>

          {/* Card 4 (Span 2 on lg): 1-Command Local Docker Self-Hosting */}
          <div className="lg:col-span-2 bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col justify-between group hover:border-brand/40 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Server size={20} />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-bold">
                  {t('landing:bento.selfHost.badge')}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-primary mb-2">
                {t('landing:bento.selfHost.title')}
              </h3>

              <p className="text-sm text-secondary leading-relaxed mb-4">
                {t('landing:bento.selfHost.description')}
              </p>
            </div>

            {/* Terminal snippet */}
            <div className="p-3.5 rounded-xl bg-subtle/80 border border-subtle font-mono text-xs flex items-center justify-between">
              <code className="text-primary font-bold">
                $ docker compose up -d
              </code>
              <span className="text-[11px] text-positive font-sans font-semibold">
                Port 3000 &bull; 100% Offline
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
