import React from 'react';
import { useTranslation } from 'react-i18next';
import { PublicPageShell } from '../components/landing/PublicPageShell';

const NotFound: React.FC = () => {
  const { t } = useTranslation();
  return <PublicPageShell title={t('landing:notFound.title')} intro={t('landing:notFound.intro')}>{null}</PublicPageShell>;
};

export default NotFound;
