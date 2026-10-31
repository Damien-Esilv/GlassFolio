import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, AlertTriangle, CheckCircle, Info, ShieldAlert } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Alert, NotificationCategory } from '../../types';
import { alertText } from '../../utils/alertText';

function getToastIcon(type: string, category?: NotificationCategory) {
  if (category === 'security') {
    return <ShieldAlert size={18} className="text-negative shrink-0" />;
  }
  switch (type) {
    case 'warning':
      return <AlertTriangle size={18} className="text-warning shrink-0" />;
    case 'success':
      return <CheckCircle size={18} className="text-positive shrink-0" />;
    case 'error':
      return <ShieldAlert size={18} className="text-negative shrink-0" />;
    default:
      return <Info size={18} className="text-primary shrink-0" />;
  }
}

const ToastItem: React.FC<{ alert: Alert; onDismiss: () => void }> = ({ alert, onDismiss }) => {
  const { t } = useTranslation();

  // Auto-dismiss after 5 seconds, counted once: a re-render (new onDismiss) must not restart it
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismissRef.current();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      className="w-80 sm:w-96 bg-card border border-subtle shadow-2xl rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-5 fade-in duration-200 pointer-events-auto"
    >
      <div className="p-2 rounded-xl bg-subtle shrink-0">
        {getToastIcon(alert.type, alert.category)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-bold text-primary truncate">{alertText(alert, t).title}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-tertiary hover:text-primary rounded-lg transition-colors"
            aria-label={t('notifications:bell.dismiss')}
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-secondary mt-1 line-clamp-2">{alertText(alert, t).message}</p>

        {alert.actionUrl && (
          <div className="mt-2 flex items-center justify-end">
            <Link
              to={alert.actionUrl}
              onClick={onDismiss}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>{alert.actionLabelKey ? t(alert.actionLabelKey) : t('notifications:toast.viewAction')}</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export const NotificationToastContainer: React.FC = () => {
  const { activeToasts, dismissToast } = useData();

  if (!activeToasts || activeToasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {activeToasts.map((toast) => (
        <ToastItem key={toast.id} alert={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
};

export default NotificationToastContainer;
