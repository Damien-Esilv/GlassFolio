import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  ShieldAlert,
  TrendingUp,
  Scale,
  Trophy,
  Info,
  Clock,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Alert, NotificationCategory } from '../../types';
import { alertText } from '../../utils/alertText';

interface NotificationBellDropdownProps {
  className?: string;
}

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

function formatRelativeTime(dateStr: string, t: (key: string, opts?: any) => string): string {
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) return dateStr;

  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return t('notifications:time.justNow');
  if (diffMin < 60) return t('notifications:time.minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('notifications:time.hoursAgo', { count: diffH });
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return t('notifications:time.yesterday');
  return new Date(ts).toLocaleDateString();
}

export const NotificationBellDropdown: React.FC<NotificationBellDropdownProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const { alerts, unreadAlertsCount, markAlertAsRead, markAllAlertsAsRead, deleteAlert } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const displayedAlerts = useMemo(() => {
    if (activeTab === 'unread') {
      return alerts.filter((a) => !a.read);
    }
    return alerts;
  }, [alerts, activeTab]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 text-secondary hover:bg-subtle hover:text-primary rounded-full transition-colors relative"
        aria-label={t('notifications:bell.ariaLabel')}
        aria-expanded={isOpen}
      >
        <Bell size={20} />
        {unreadAlertsCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-card shadow-sm animate-in zoom-in-50">
            {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="region"
          aria-label={t('notifications:bell.ariaLabel')}
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-subtle rounded-2xl shadow-2xl py-3 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 pb-3 border-b border-subtle flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-primary">{t('notifications:title')}</h4>
              <p className="text-[11px] text-tertiary">
                {unreadAlertsCount > 0
                  ? t('notifications:stats.unread', { count: unreadAlertsCount })
                  : t('notifications:bell.empty')}
              </p>
            </div>

            {unreadAlertsCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAlertsAsRead()}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold transition-colors"
                title={t('notifications:bell.markAllAsRead')}
              >
                <CheckCheck size={14} />
                <span>{t('notifications:bell.markAllAsRead')}</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 border-b border-subtle flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-primary text-white'
                  : 'text-secondary hover:bg-subtle hover:text-primary'
              }`}
            >
              {t('notifications:bell.allTab')} ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                activeTab === 'unread'
                  ? 'bg-primary text-white'
                  : 'text-secondary hover:bg-subtle hover:text-primary'
              }`}
            >
              {t('notifications:bell.unreadTab')} ({unreadAlertsCount})
            </button>
          </div>

          {/* Alerts List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-subtle">
            {displayedAlerts.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <Bell size={28} className="mx-auto text-tertiary mb-2 opacity-40" />
                <p className="text-xs font-semibold text-primary">{t('notifications:bell.empty')}</p>
                <p className="text-[11px] text-tertiary mt-0.5">{t('notifications:bell.emptyDesc')}</p>
              </div>
            ) : (
              displayedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3.5 hover:bg-subtle/50 transition-colors flex items-start gap-3 group relative ${
                    !alert.read ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Category / Urgency Icon */}
                  <div className="p-2 rounded-xl bg-subtle shrink-0 mt-0.5">
                    {getCategoryIcon(alert.category, alert.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5">
                      {alert.actionUrl ? (
                        <Link
                          to={alert.actionUrl}
                          onClick={() => {
                            if (!alert.read) markAlertAsRead(alert.id);
                            setIsOpen(false);
                          }}
                          className={`text-xs font-semibold truncate hover:underline ${!alert.read ? 'text-primary' : 'text-secondary'}`}
                        >
                          {alertText(alert, t).title}
                        </Link>
                      ) : (
                        <p className={`text-xs font-semibold truncate ${!alert.read ? 'text-primary' : 'text-secondary'}`}>
                          {alertText(alert, t).title}
                        </p>
                      )}
                      {!alert.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    <p className="text-[11px] text-tertiary mt-0.5 line-clamp-2">{alertText(alert, t).message}</p>

                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-tertiary">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatRelativeTime(alert.date, t)}
                      </span>

                      {alert.actionUrl && (
                        <Link
                          to={alert.actionUrl}
                          onClick={() => {
                            if (!alert.read) markAlertAsRead(alert.id);
                            setIsOpen(false);
                          }}
                          className="flex items-center gap-0.5 text-primary hover:underline font-semibold"
                        >
                          <span>{alert.actionLabelKey ? t(alert.actionLabelKey) : t('notifications:toast.viewAction')}</span>
                          <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card/90 rounded-lg p-0.5 shadow-sm">
                    {!alert.read && (
                      <button
                        type="button"
                        onClick={() => markAlertAsRead(alert.id)}
                        className="p-1 text-secondary hover:text-positive hover:bg-subtle rounded transition-colors"
                        title={t('notifications:bell.markAsRead')}
                        aria-label={t('notifications:bell.markAsRead')}
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteAlert(alert.id)}
                      className="p-1 text-secondary hover:text-negative hover:bg-subtle rounded transition-colors"
                      title={t('notifications:bell.deleteAlert')}
                      aria-label={t('notifications:bell.deleteAlert')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Link */}
          <div className="px-4 pt-2.5 border-t border-subtle text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1"
            >
              <span>{t('notifications:bell.viewAll')}</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBellDropdown;
