import React, { useState } from 'react';
import { reports } from '../mockData';
import Button from '../components/Button';
import { ArrowRight, FileText, PieChart, TrendingUp, Receipt, ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const REPORT_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
   r1: TrendingUp,
   r2: PieChart,
   r3: Receipt,
   r4: ShieldCheck
};

const Reports: React.FC = () => {
   const { t } = useTranslation();
   const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
   const [generatingReportId, setGeneratingReportId] = useState<string | null>(null);

   const periods: Array<{ key: 'monthly' | 'quarterly' | 'yearly'; label: string }> = [
      { key: 'monthly', label: t('reports:periods.monthly') },
      { key: 'quarterly', label: t('reports:periods.quarterly') },
      { key: 'yearly', label: t('reports:periods.yearly') }
   ];

   const handleGenerateReport = (reportId: string) => {
      setGeneratingReportId(reportId);
      setTimeout(() => {
         setGeneratingReportId(null);
      }, 1200);
   };

   return (
      <div className="space-y-8">
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
            <div>
               <h1 className="text-3xl font-bold text-primary mb-1">{t('reports:title')}</h1>
               <p className="text-secondary text-sm">{t('reports:subtitle')}</p>
            </div>

            <div className="flex items-center gap-2 bg-subtle p-1 rounded-xl border border-subtle self-start sm:self-auto">
               {periods.map((period) => (
                  <button
                     key={period.key}
                     onClick={() => setSelectedPeriod(period.key)}
                     className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        selectedPeriod === period.key
                           ? 'bg-card text-brand shadow-sm border border-subtle'
                           : 'text-secondary hover:text-primary'
                     }`}
                  >
                     {period.label}
                  </button>
               ))}
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reports.map((report) => {
               const IconComponent = REPORT_ICONS[report.id] || FileText;
               const isGenerating = generatingReportId === report.id;

               return (
                  <div
                     key={report.id}
                     className="group relative rounded-2xl bg-card border border-subtle hover:border-strong p-6 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
                  >
                     {/* Decorative background glow */}
                     <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand/5 rounded-full blur-2xl group-hover:bg-brand/10 transition-colors pointer-events-none" />

                     <div>
                        <div className="flex items-center justify-between mb-4">
                           <div className="p-3 rounded-xl bg-brand/10 text-brand group-hover:scale-105 transition-transform">
                              <IconComponent size={24} />
                           </div>
                           <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-subtle text-tertiary border border-subtle">
                              {t(`reports:periods.${selectedPeriod}`)}
                           </span>
                        </div>

                        <h3 className="text-xl font-bold text-primary mb-2">{report.title}</h3>
                        <p className="text-secondary text-sm leading-relaxed mb-6">{report.description}</p>
                     </div>

                     <div className="pt-4 border-t border-subtle flex items-center justify-between">
                        <span className="text-xs text-tertiary font-mono">
                           {t('reports:generating') ? 'PDF • CSV' : ''}
                        </span>

                        <Button
                           onClick={() => handleGenerateReport(report.id)}
                           disabled={isGenerating}
                           size="sm"
                           className="flex items-center gap-2"
                        >
                           {isGenerating ? (
                              <>
                                 <Loader2 size={14} className="animate-spin" />
                                 <span>{t('reports:generating')}</span>
                              </>
                           ) : (
                              <>
                                 <span>{t('common:actions.viewReport')}</span>
                                 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                              </>
                           )}
                        </Button>
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
   );
};

export default Reports;