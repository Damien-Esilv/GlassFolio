import React from 'react';
import { reports } from '../mockData';
import Button from '../components/Button';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Reports: React.FC = () => {
   const { t } = useTranslation();
   const cardStyle = "group relative rounded-xl bg-white/50 dark:bg-black/20 overflow-hidden transition-all duration-300 shadow-lg hover:shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-lg h-64 flex flex-col justify-between";

   return (
      <div className="space-y-6">
         <div className="mb-8">
            <h1 className="text-3xl font-bold text-black dark:text-white mb-2">{t('reports:title')}</h1>
            <p className="text-black/60 dark:text-white/60">{t('reports:subtitle')}</p>

            <div className="flex gap-4 mt-6 border-b border-black/10 dark:border-white/10 pb-1">
               {['Daily', 'Weekly', 'Monthly'].map((period, idx) => (
                  <button key={period} className={`px-4 py-2 text-sm font-medium ${idx === 2 ? 'text-primary border-b-2 border-primary' : 'text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70'}`}>
                     {period}
                  </button>
               ))}
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reports.map((report) => (
               <div key={report.id} className={cardStyle}>

                  {/* Abstract Background Graphic */}
                  <div className="absolute inset-0 opacity-20">
                     {report.id === 'r1' && (
                        <div className="w-full h-full bg-gradient-to-r from-blue-500 to-transparent transform -skew-y-12 translate-y-1/2"></div>
                     )}
                     {report.id === 'r2' && (
                        <div className="flex items-end justify-around h-full pb-0 px-4">
                           <div className="w-8 bg-accent-green h-12 rounded-t-md"></div>
                           <div className="w-8 bg-accent-green h-24 rounded-t-md"></div>
                           <div className="w-8 bg-accent-green h-16 rounded-t-md"></div>
                           <div className="w-8 bg-accent-green h-32 rounded-t-md"></div>
                           <div className="w-8 bg-accent-green h-20 rounded-t-md"></div>
                        </div>
                     )}
                     {report.id === 'r3' && (
                        <div className="w-full h-full flex items-center justify-center">
                           <div className="w-48 h-48 rounded-full border-8 border-amber-500 border-t-transparent border-l-transparent opacity-50"></div>
                        </div>
                     )}
                     {report.id === 'r4' && (
                        <div className="w-full h-full flex flex-col items-end justify-end pr-8 pb-8">
                           <div className="w-full h-full bg-gradient-to-t from-purple-900 to-transparent"></div>
                        </div>
                     )}
                  </div>

                  <div className="relative z-10 p-8 flex flex-col h-full justify-between">
                     <div>
                        <h3 className="text-2xl font-bold text-black dark:text-white mb-3">{report.title}</h3>
                        <p className="text-black/60 dark:text-white/60 text-sm leading-relaxed">{report.description}</p>
                     </div>

                     <div>
                        <Button className="flex items-center gap-2 group-hover:translate-x-1 transition-transform bg-primary text-white hover:bg-primary/90">
                           {t('common:actions.viewReport')} <ArrowRight size={16} />
                        </Button>
                     </div>
                  </div>
               </div>
            ))}
         </div>

         <div className="flex justify-end mt-8">
            <Button variant="secondary">
               <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  {t('reports:export.pdf')}
               </span>
            </Button>
         </div>
      </div>
   );
};

export default Reports;