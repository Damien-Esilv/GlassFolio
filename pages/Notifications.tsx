import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  Plus,
  SlidersHorizontal,
  Search,
  Filter,
  TrendingUp,
  Scale,
  Trophy,
  ShieldAlert,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Alert, AlertRule, AlertRuleMetric, NotificationCategory } from '../types';
import Button from '../components/Button';

function getCategoryIcon(category?: NotificationCategory, type?: string) {
  switch (category) {
    case 'portfolio':
      return <TrendingUp size={16} className={type === 'warning' ? 'text-warning' : 'text-positive'} />;
    case 'fiscal':
      return <Scale size={16} className="text-brand" />;
    case 'goals':
      return <Trophy size={16} className="text-warning" />;
    case 'security':
      return <ShieldAlert size={16} className={type === 'warning' ? 'text-warning' : 'text-negative'} />;
    default:
      return <Info size={16} className="text-secondary" />;
  }
}

export const Notifications: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'rules' ? 'rules' : 'inbox';

  const {
    alerts,
    unreadAlertsCount,
    alertRules,
    markAlertAsRead,
    markAllAlertsAsRead,
    deleteAlert,
    clearReadAlerts,
    saveAlertRule,
    toggleAlertRule,
    deleteAlertRule,
  } = useData();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'unread'>('all');

  // Rule Creator State
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    metric: AlertRuleMetric;
    threshold: number;
    symbol: string;
  }>({
    name: '',
    metric: 'price_above',
    threshold: 0,
    symbol: '',
  });

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesMsg = alert.message.toLowerCase().includes(query);
        if (!matchesTitle && !matchesMsg) return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && alert.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus === 'unread' && alert.read) {
        return false;
      }
      return true;
    });
  }, [alerts, searchQuery, selectedCategory, selectedStatus]);

  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name.trim()) return;

    await saveAlertRule({
      name: ruleForm.name,
      metric: ruleForm.metric,
      threshold: Number(ruleForm.threshold),
      symbol: ruleForm.symbol.trim() ? ruleForm.symbol.trim().toUpperCase() : undefined,
      enabled: true,
    });

    setIsCreatingRule(false);
    setRuleForm({
      name: '',
      metric: 'price_above',
      threshold: 0,
      symbol: '',
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary flex items-center gap-3">
            <Bell size={28} className="text-primary" />
            <span>{t('notifications:title')}</span>
          </h1>
          <p className="text-sm text-secondary mt-1">{t('notifications:subtitle')}</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-subtle border border-subtle rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'inbox' })}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'inbox'
                ? 'bg-card text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {t('notifications:tabs.inbox')} ({unreadAlertsCount})
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'rules' })}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'rules'
                ? 'bg-card text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {t('notifications:tabs.rules')} ({alertRules.length})
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-subtle">
          <p className="text-[11px] font-bold text-tertiary uppercase tracking-wider">
            {t('notifications:stats.total')}
          </p>
          <p className="text-2xl font-black text-primary mt-1">{alerts.length}</p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-subtle">
          <p className="text-[11px] font-bold text-tertiary uppercase tracking-wider">
            {t('notifications:stats.unread')}
          </p>
          <p className={`text-2xl font-black mt-1 ${unreadAlertsCount > 0 ? 'text-primary font-bold' : 'text-secondary'}`}>
            {unreadAlertsCount}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-subtle">
          <p className="text-[11px] font-bold text-tertiary uppercase tracking-wider">
            {t('notifications:stats.activeRules')}
          </p>
          <p className="text-2xl font-black text-primary mt-1">
            {alertRules.filter((r) => r.enabled).length}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-subtle">
          <p className="text-[11px] font-bold text-tertiary uppercase tracking-wider">
            {t('notifications:stats.categories')}
          </p>
          <p className="text-2xl font-black text-brand mt-1">4</p>
        </div>
      </div>

      {/* TAB 1: INBOX */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          {/* Action & Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-card border border-subtle flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
              <input
                type="text"
                placeholder={t('notifications:filters.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-subtle border border-subtle text-primary rounded-xl text-xs focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Category Select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-subtle border border-subtle text-primary text-xs rounded-xl px-3 py-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">{t('notifications:filters.allCategories')}</option>
              <option value="portfolio">{t('notifications:filters.portfolio')}</option>
              <option value="fiscal">{t('notifications:filters.fiscal')}</option>
              <option value="goals">{t('notifications:filters.goals')}</option>
              <option value="security">{t('notifications:filters.security')}</option>
            </select>

            {/* Status Select */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'unread')}
              className="bg-subtle border border-subtle text-primary text-xs rounded-xl px-3 py-2 focus:ring-primary focus:border-primary"
            >
              <option value="all">{t('notifications:filters.statusAll')}</option>
              <option value="unread">{t('notifications:filters.statusUnread')}</option>
            </select>

            {/* Bulk Actions */}
            <div className="flex items-center gap-2">
              {unreadAlertsCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAllAlertsAsRead()}
                  className="text-xs shrink-0"
                >
                  <CheckCheck size={14} className="mr-1" />
                  <span>{t('notifications:bell.markAllAsRead')}</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clearReadAlerts()}
                className="text-xs shrink-0 text-secondary hover:text-negative"
              >
                <Trash2 size={14} className="mr-1" />
                <span>{t('notifications:filters.clearRead')}</span>
              </Button>
            </div>
          </div>

          {/* Alerts Feed */}
          <div className="bg-card border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle">
            {filteredAlerts.length === 0 ? (
              <div className="py-16 text-center px-4">
                <Bell size={36} className="mx-auto text-tertiary mb-3 opacity-30" />
                <p className="text-sm font-bold text-primary">{t('notifications:bell.empty')}</p>
                <p className="text-xs text-tertiary mt-1 max-w-sm mx-auto">
                  {t('notifications:bell.emptyDesc')}
                </p>
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 sm:p-5 flex items-start gap-4 transition-colors hover:bg-subtle/40 ${
                    !alert.read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="p-2.5 rounded-xl bg-subtle shrink-0 mt-0.5">
                    {getCategoryIcon(alert.category, alert.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{alert.title}</span>
                      {!alert.read && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-primary/20 text-primary">
                          {t('notifications:bell.unreadTab')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-1">{alert.message}</p>

                    <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-tertiary">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(alert.date).toLocaleString()}
                      </span>

                      {alert.actionUrl && (
                        <Link
                          to={alert.actionUrl}
                          onClick={() => {
                            if (!alert.read) markAlertAsRead(alert.id);
                          }}
                          className="flex items-center gap-1 text-primary hover:underline font-semibold"
                        >
                          <span>{alert.actionLabelKey ? t(alert.actionLabelKey) : t('notifications:toast.viewAction')}</span>
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!alert.read && (
                      <button
                        type="button"
                        onClick={() => markAlertAsRead(alert.id)}
                        className="p-1.5 text-secondary hover:text-positive hover:bg-subtle rounded-lg transition-colors"
                        title={t('notifications:bell.markAsRead')}
                        aria-label={t('notifications:bell.markAsRead')}
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteAlert(alert.id)}
                      className="p-1.5 text-secondary hover:text-negative hover:bg-subtle rounded-lg transition-colors"
                      title={t('notifications:bell.deleteAlert')}
                      aria-label={t('notifications:bell.deleteAlert')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOM ALERT RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Rules Header & Create Button */}
          <div className="p-5 rounded-2xl bg-card border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-primary">{t('notifications:rules.title')}</h3>
              <p className="text-xs text-secondary mt-0.5">{t('notifications:rules.subtitle')}</p>
            </div>
            <Button
              onClick={() => setIsCreatingRule((prev) => !prev)}
              className="text-xs shrink-0 flex items-center gap-1.5"
            >
              <Plus size={16} />
              <span>{t('notifications:rules.addRule')}</span>
            </Button>
          </div>

          {/* Create Rule Form Modal / Expandable Card */}
          {isCreatingRule && (
            <form
              onSubmit={handleCreateRuleSubmit}
              className="p-5 rounded-2xl bg-card border border-primary/30 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2"
            >
              <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-primary" />
                <span>{t('notifications:rules.addRule')}</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">
                    {t('notifications:rules.name')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('notifications:rules.namePlaceholder')}
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-subtle border border-subtle text-primary text-xs focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">
                    {t('notifications:rules.metric')}
                  </label>
                  <select
                    value={ruleForm.metric}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, metric: e.target.value as AlertRuleMetric })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-subtle border border-subtle text-primary text-xs focus:ring-primary focus:border-primary"
                  >
                    <option value="price_above">{t('notifications:rules.metrics.price_above')}</option>
                    <option value="price_below">{t('notifications:rules.metrics.price_below')}</option>
                    <option value="pl_percent_above">{t('notifications:rules.metrics.pl_percent_above')}</option>
                    <option value="pl_percent_below">{t('notifications:rules.metrics.pl_percent_below')}</option>
                    <option value="cash_ratio_above">{t('notifications:rules.metrics.cash_ratio_above')}</option>
                  </select>
                </div>

                {ruleForm.metric !== 'cash_ratio_above' && (
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      {t('notifications:rules.symbol')}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={t('notifications:rules.symbolPlaceholder')}
                      value={ruleForm.symbol}
                      onChange={(e) => setRuleForm({ ...ruleForm, symbol: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-subtle border border-subtle text-primary text-xs uppercase focus:ring-primary focus:border-primary"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">
                    {t('notifications:rules.threshold')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder={t('notifications:rules.thresholdPlaceholder')}
                    value={ruleForm.threshold || ''}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, threshold: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-subtle border border-subtle text-primary text-xs focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingRule(false)}
                >
                  {t('notifications:bell.dismiss')}
                </Button>
                <Button type="submit" size="sm">
                  {t('notifications:rules.addRule')}
                </Button>
              </div>
            </form>
          )}

          {/* Rules List Table */}
          <div className="bg-card border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle">
            {alertRules.length === 0 ? (
              <div className="py-12 text-center px-4">
                <SlidersHorizontal size={36} className="mx-auto text-tertiary mb-3 opacity-30" />
                <p className="text-sm font-bold text-primary">{t('notifications:rules.noRules')}</p>
                <p className="text-xs text-tertiary mt-1 max-w-sm mx-auto">
                  {t('notifications:rules.noRulesDesc')}
                </p>
              </div>
            ) : (
              alertRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-subtle/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleAlertRule(rule.id)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        rule.enabled ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'
                      }`}
                      aria-label={rule.enabled ? t('notifications:rules.enabled') : t('notifications:rules.disabled')}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          rule.enabled ? 'left-5' : 'left-1'
                        }`}
                      />
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">{rule.name}</span>
                        {rule.symbol && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-subtle text-primary border border-subtle">
                            {rule.symbol}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-tertiary mt-0.5">
                        {t(`notifications:rules.metrics.${rule.metric}`)} :{' '}
                        <span className="font-semibold text-primary">{rule.threshold}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions & Timestamps */}
                  <div className="flex items-center gap-4 text-[11px] text-tertiary">
                    <span className="hidden sm:inline">
                      {rule.lastTriggeredAt
                        ? `${t('notifications:rules.lastTriggered')} : ${new Date(
                            rule.lastTriggeredAt
                          ).toLocaleDateString()}`
                        : t('notifications:rules.neverTriggered')}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t('notifications:rules.deleteConfirm'))) {
                          deleteAlertRule(rule.id);
                        }
                      }}
                      className="p-1.5 text-secondary hover:text-negative hover:bg-subtle rounded-lg transition-colors"
                      title={t('notifications:rules.deleteConfirm')}
                      aria-label={t('notifications:rules.deleteConfirm')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
