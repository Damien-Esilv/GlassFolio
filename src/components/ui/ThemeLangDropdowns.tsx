import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon, Sparkles, ChevronDown, Check } from 'lucide-react';
import {
  usePublicThemeLang,
  SUPPORTED_LANGUAGES,
  SUPPORTED_THEMES,
  ShowcaseTheme,
} from '../../hooks/usePublicThemeLang';

export interface ThemeLangDropdownsProps {
  align?: 'left' | 'right';
  className?: string;
  showThemeLabel?: 'always' | 'responsive' | 'never';
}

export const ThemeLangDropdowns: React.FC<ThemeLangDropdownsProps> = ({
  align = 'right',
  className = '',
  showThemeLabel = 'responsive',
}) => {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = usePublicThemeLang();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);

  const langContainerRef = useRef<HTMLDivElement>(null);
  const themeContainerRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (langContainerRef.current && !langContainerRef.current.contains(target)) {
        setIsLangOpen(false);
      }
      if (themeContainerRef.current && !themeContainerRef.current.contains(target)) {
        setIsThemeOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLangOpen(false);
        setIsThemeOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getThemeIcon = (targetTheme: ShowcaseTheme) => {
    if (targetTheme === 'light') return <Sun size={15} className="text-warning shrink-0" />;
    if (targetTheme === 'dark') return <Moon size={15} className="text-secondary shrink-0" />;
    return <Sparkles size={15} className="text-brand shrink-0" />;
  };

  const getThemeLabel = (themeId: ShowcaseTheme) => {
    const found = SUPPORTED_THEMES.find((item) => item.id === themeId);
    return found ? t(found.labelKey) : themeId;
  };

  const themeLabelSpanClass =
    showThemeLabel === 'always'
      ? 'inline capitalize'
      : showThemeLabel === 'never'
      ? 'hidden'
      : 'hidden sm:inline lg:hidden xl:inline capitalize';

  const dropdownAlignClass = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 1. Language Dropdown */}
      <div className="relative" ref={langContainerRef}>
        <button
          type="button"
          onClick={() => {
            setIsLangOpen((prev) => !prev);
            setIsThemeOpen(false);
          }}
          aria-expanded={isLangOpen}
          aria-haspopup="listbox"
          aria-label={t('settings:preferences.language')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-xs font-bold text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <Globe size={14} className="text-secondary" />
          <span>{language.toUpperCase()}</span>
          <ChevronDown
            size={12}
            className={`text-secondary transition-transform duration-200 ${
              isLangOpen ? 'rotate-180 text-brand' : ''
            }`}
          />
        </button>

        {isLangOpen && (
          <div
            role="listbox"
            aria-label={t('settings:preferences.language')}
            className={`absolute top-full mt-1.5 ${dropdownAlignClass} z-50 min-w-[160px] bg-card border border-subtle rounded-xl shadow-2xl py-1.5 animate-row-in`}
          >
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
              {t('settings:preferences.language')}
            </div>
            {SUPPORTED_LANGUAGES.map((langOption) => {
              const isSelected = language === langOption.code;
              return (
                <button
                  key={langOption.code}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => {
                    setLanguage(langOption.code);
                    setIsLangOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left ${
                    isSelected
                      ? 'bg-subtle text-primary font-bold'
                      : 'text-secondary hover:text-primary hover:bg-card-hover'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-subtle border border-subtle text-secondary">
                      {langOption.shortLabel}
                    </span>
                    <span>{t(langOption.labelKey)}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Theme Dropdown */}
      <div className="relative" ref={themeContainerRef}>
        <button
          type="button"
          onClick={() => {
            setIsThemeOpen((prev) => !prev);
            setIsLangOpen(false);
          }}
          aria-expanded={isThemeOpen}
          aria-haspopup="listbox"
          aria-label={t('settings:preferences.appearance')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {getThemeIcon(theme)}
          <span className={themeLabelSpanClass}>{getThemeLabel(theme)}</span>
          <ChevronDown
            size={12}
            className={`text-secondary transition-transform duration-200 ${
              isThemeOpen ? 'rotate-180 text-brand' : ''
            }`}
          />
        </button>

        {isThemeOpen && (
          <div
            role="listbox"
            aria-label={t('settings:preferences.appearance')}
            className={`absolute top-full mt-1.5 ${dropdownAlignClass} z-50 min-w-[170px] bg-card border border-subtle rounded-xl shadow-2xl py-1.5 animate-row-in`}
          >
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
              {t('settings:preferences.appearance')}
            </div>
            {SUPPORTED_THEMES.map((themeOption) => {
              const isSelected = theme === themeOption.id;
              return (
                <button
                  key={themeOption.id}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => {
                    setTheme(themeOption.id);
                    setIsThemeOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left ${
                    isSelected
                      ? 'bg-subtle text-primary font-bold'
                      : 'text-secondary hover:text-primary hover:bg-card-hover'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {getThemeIcon(themeOption.id)}
                    <span>{getThemeLabel(themeOption.id)}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
