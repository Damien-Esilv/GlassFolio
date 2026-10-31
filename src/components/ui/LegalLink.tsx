import React from 'react';
import { Link } from 'react-router-dom';
import { buildShowcaseDestinationUrl, getAppTarget, getShowcaseUrl } from '../../config/deployment';

type ShowcasePath = '/' | '/legal' | '/privacy' | '/terms' | '/cookies' | '/accessibility';

interface LegalLinkProps {
    path: ShowcasePath;
    className?: string;
    /** Opens in a new tab (forms: the user keeps what was typed) */
    newTab?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
}

/**
 * Link to a public page (legal documents, home). The app-only build has no such routes (they
 * redirect to /login): there they live on the showcase site, or are not served at all (self-hosted
 * Docker), in which case the text is shown without a dead link.
 */
export const LegalLink: React.FC<LegalLinkProps> = ({ path, className, newTab = false, onClick, children }) => {
    const targetProps = { ...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}), ...(onClick ? { onClick } : {}) };
    if (getAppTarget() === 'app') {
        if (!getShowcaseUrl()) return <span className={className}>{children}</span>;
        return <a href={buildShowcaseDestinationUrl(path)} className={className} {...targetProps}>{children}</a>;
    }
    const to = path === '/' ? '/welcome' : path;
    return <Link to={to} className={className} {...targetProps}>{children}</Link>;
};
