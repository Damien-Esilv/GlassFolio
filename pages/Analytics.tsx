import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { ArrowRight, FileText, Coins, TrendingUp, Receipt, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STAGGER_DELAY_MS } from '../src/constants/animations';

interface AnalyticsCardItem {
   id: string;
   icon: React.FC<{ size?: number; className?: string }>;
   titleKey: string;
   descKey: string;
   route?: string;
}

const Analytics: React.FC = () => {
   const { t } = useTranslation();
   const navigate = useNavigate();

   const cards: AnalyticsCardItem[] = [
      {
         id: 'performance',
         icon: TrendingUp,
         titleKey: 'reports:cards.performance.title',
         descKey: 'reports:cards.performance.desc',
         route: '/analytics/performance'
      },
      {
         id: 'pl',
         icon: Receipt,
         titleKey: 'reports:cards.pl.title',
         descKey: 'reports:cards.pl.desc',
         route: '/analytics/pl'
      },
      {
         id: 'fees',
         icon: Coins,
         titleKey: 'reports:cards.fees.title',
         descKey: 'reports:cards.fees.desc',
         route: '/analytics/fees'
      },
      {
         id: 'tax',
         icon: ShieldCheck,
         titleKey: 'reports:cards.tax.title',
         descKey: 'reports:cards.tax.desc',
         route: '/analytics/tax'
      }
   ];

   return (
      <div className="space-y-8">
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
            <div>
               <h1 className="text-3xl font-bold text-primary mb-1">{t('reports:title')}</h1>
               <p className="text-secondary text-sm">{t('reports:subtitle')}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card, idx) => {
               const IconComponent = card.icon || FileText;

               return (
                  <div
                     key={card.id}
                     onClick={() => card.route && navigate(card.route)}
                     className="animate-slide-in-left group relative rounded-2xl bg-card border border-subtle hover:border-strong p-6 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer"
                     style={{ animationDelay: `${idx * STAGGER_DELAY_MS}ms` }}
                  >
                     {/* Decorative background glow */}
                     <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand/5 rounded-full blur-2xl group-hover:bg-brand/10 transition-colors pointer-events-none" />

                     <div>
                        <div className="flex items-center justify-between mb-4">
                           <div className="p-3 rounded-xl bg-brand/10 text-brand group-hover:scale-105 transition-transform">
                              <IconComponent size={24} />
                           </div>
                        </div>

                        <h3 className="text-xl font-bold text-primary mb-2">{t(card.titleKey)}</h3>
                        <p className="text-secondary text-sm leading-relaxed mb-6">{t(card.descKey)}</p>
                     </div>

                     <div className="pt-4 border-t border-subtle flex items-center justify-end">
                        <Button
                           size="sm"
                           className="flex items-center gap-2"
                           onClick={(e) => {
                              e.stopPropagation();
                              if (card.route) navigate(card.route);
                           }}
                        >
                           <span>{t('reports:explore')}</span>
                           <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </Button>
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
   );
};

export default Analytics;
