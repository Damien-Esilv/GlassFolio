import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import AnimatedCounter from '../components/AnimatedCounter';
import { PieChart, LayoutDashboard, ArrowRightLeft, ArrowRight, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../src/services/currencyService';
import { STAGGER_DELAY_MS } from '../src/constants/animations';

interface PortfolioHubCard {
    id: string;
    icon: React.FC<{ size?: number; className?: string }>;
    titleKey: string;
    descKey: string;
    route: string;
    badgeValue?: string | number;
    badgeLabelKey?: string;
    isCurrencyBadge?: boolean;
}

const PortfolioHub: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { positions, transactions } = useData();

    const currency = user?.preferences?.currency || 'EUR';
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';

    // Calculate total portfolio value
    const totalPortfolioValue = positions.reduce((sum, p) => {
        const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', currency);
        return sum + valInBase;
    }, 0);

    const nonCashPositionsCount = positions.filter(p => p.type !== 'Cash' && p.quantity > 0).length;
    const totalTransactionsCount = transactions.length;

    const cards: PortfolioHubCard[] = [
        {
            id: 'summary',
            icon: PieChart,
            titleKey: 'portfolio:hub.cards.summary.title',
            descKey: 'portfolio:hub.cards.summary.desc',
            route: '/portfolio/summary',
            badgeValue: totalPortfolioValue,
            badgeLabelKey: 'portfolio:totalValue',
            isCurrencyBadge: true
        },
        {
            id: 'positions',
            icon: LayoutDashboard,
            titleKey: 'portfolio:hub.cards.positions.title',
            descKey: 'portfolio:hub.cards.positions.desc',
            route: '/positions',
            badgeValue: nonCashPositionsCount,
            badgeLabelKey: 'portfolio:summary.assets'
        },
        {
            id: 'transactions',
            icon: ArrowRightLeft,
            titleKey: 'portfolio:hub.cards.transactions.title',
            descKey: 'portfolio:hub.cards.transactions.desc',
            route: '/transactions',
            badgeValue: totalTransactionsCount,
            badgeLabelKey: 'navigation:menu.transactions'
        }
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
                <div>
                    <h1 className="text-3xl font-bold text-primary mb-1">{t('portfolio:hub.title')}</h1>
                    <p className="text-secondary text-sm">{t('portfolio:hub.subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card, idx) => {
                    const IconComponent = card.icon || Wallet;

                    return (
                        <div
                            key={card.id}
                            onClick={() => navigate(card.route)}
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
                                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-subtle text-secondary border border-subtle">
                                        {card.isCurrencyBadge && typeof card.badgeValue === 'number' ? (
                                            <AnimatedCounter value={card.badgeValue} currency={currency} locale={locale} options={{ maximumFractionDigits: 0 }} />
                                        ) : (
                                            `${card.badgeValue} ${card.badgeLabelKey ? t(card.badgeLabelKey) : ''}`
                                        )}
                                    </span>
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
                                        navigate(card.route);
                                    }}
                                >
                                    <span>{t('portfolio:hub.explore')}</span>
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

export default PortfolioHub;
