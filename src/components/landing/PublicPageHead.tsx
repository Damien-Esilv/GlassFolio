import React, { useEffect } from 'react';
import { useHref, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SITE_ORIGIN, alternateUrls, findPublicRoute } from '../../config/publicRoutes';

const setHeadAttribute = (selector: string, tag: string, attributes: Record<string, string>, name: string, value: string): void => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, attribute]) => element?.setAttribute(key, attribute));
    document.head.appendChild(element);
  }
  element.setAttribute(name, value);
};

/** Keeps title, description and canonical right after client navigation and language changes. */
export const PublicPageHead: React.FC = () => {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  // Includes the router basename, so a page declares the address of its own language
  const href = useHref(findPublicRoute(pathname)?.path ?? '/');

  useEffect(() => {
    const route = findPublicRoute(pathname);
    const key = route?.seoKey ?? 'notFound';
    const title = t(`seo:${key}.title`);
    const description = t(`seo:${key}.description`);
    document.title = title;
    setHeadAttribute('meta[name="description"]', 'meta', { name: 'description' }, 'content', description);
    setHeadAttribute('meta[property="og:title"]', 'meta', { property: 'og:title' }, 'content', title);
    setHeadAttribute('meta[property="og:description"]', 'meta', { property: 'og:description' }, 'content', description);
    setHeadAttribute('meta[name="twitter:title"]', 'meta', { name: 'twitter:title' }, 'content', title);
    setHeadAttribute('meta[name="twitter:description"]', 'meta', { name: 'twitter:description' }, 'content', description);
    if (route) {
      const url = `${SITE_ORIGIN}${href}`;
      alternateUrls(route.path).forEach(({ lang, href: alternate }) => {
        setHeadAttribute(`link[rel="alternate"][hreflang="${lang}"]`, 'link', { rel: 'alternate', hreflang: lang }, 'href', alternate);
      });
      setHeadAttribute('link[rel="canonical"]', 'link', { rel: 'canonical' }, 'href', url);
      setHeadAttribute('meta[property="og:url"]', 'meta', { property: 'og:url' }, 'content', url);
    } else {
      document.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]').forEach((link) => link.remove());
    }
  }, [pathname, href, t, i18n.language]);

  return null;
};
