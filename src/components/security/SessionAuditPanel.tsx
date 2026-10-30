import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Trash2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { auditLogService, AuditLogEntry, AuditSeverity } from '../../services/security/auditLogService';

export const SessionAuditPanel: React.FC = () => {
    const { t } = useTranslation();
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [filterSeverity, setFilterSeverity] = useState<AuditSeverity | 'all'>('all');

    const loadEntries = async () => {
        try {
            const list = await auditLogService.getEntries(50);
            setEntries(list);
        } catch (err) {
            console.error('Failed to load audit entries', err);
        }
    };

    useEffect(() => {
        loadEntries();
    }, []);

    const handleClear = async () => {
        if (window.confirm(t('security:audit.clearConfirm'))) {
            try {
                await auditLogService.clear();
                await loadEntries();
            } catch (err) {
                console.error('Failed to clear audit entries', err);
            }
        }
    };

    const filtered = filterSeverity === 'all'
        ? entries
        : entries.filter(e => e.severity === filterSeverity);

    const getSeverityBadge = (severity: AuditSeverity) => {
        switch (severity) {
            case 'critical':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-error/15 text-error border border-error/30">
                        <AlertOctagon size={11} />
                        {t('security:audit.severities.critical')}
                    </span>
                );
            case 'warning':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30">
                        <AlertTriangle size={11} />
                        {t('security:audit.severities.warning')}
                    </span>
                );
            case 'info':
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand/10 text-brand border border-brand/20">
                        <Info size={11} />
                        {t('security:audit.severities.info')}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <History size={22} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-primary">
                            {t('security:audit.title')}
                        </h3>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('security:audit.subtitle')}
                        </p>
                    </div>
                </div>

                {entries.length > 0 && (
                    <div className="flex items-center gap-2">
                        <select
                            value={filterSeverity}
                            onChange={(e) => setFilterSeverity(e.target.value as AuditSeverity | 'all')}
                            className="bg-subtle border border-subtle text-primary text-xs rounded-lg px-2.5 py-1.5"
                        >
                            <option value="all">{t('security:audit.severities.all')}</option>
                            <option value="info">{t('security:audit.severities.info')}</option>
                            <option value="warning">{t('security:audit.severities.warning')}</option>
                            <option value="critical">{t('security:audit.severities.critical')}</option>
                        </select>
                        <button
                            type="button"
                            onClick={handleClear}
                            title={t('security:audit.clearButton')}
                            className="p-1.5 rounded-lg border border-subtle bg-subtle text-tertiary hover:text-error hover:bg-card transition-colors text-xs inline-flex items-center gap-1"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className="p-4 bg-subtle border border-subtle rounded-xl text-center text-xs text-secondary">
                    {t('security:audit.noEvents')}
                </div>
            ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 bg-subtle border border-subtle rounded-xl text-xs hover:border-border transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {getSeverityBadge(item.severity)}
                                <span className="font-mono text-xs font-semibold text-primary shrink-0">
                                    {item.event}
                                </span>
                                {item.details && (
                                    <span className="text-secondary truncate text-[11px]">
                                        {item.details}
                                    </span>
                                )}
                            </div>

                            <span className="text-[10px] text-tertiary shrink-0 font-mono">
                                {new Date(item.timestamp).toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
