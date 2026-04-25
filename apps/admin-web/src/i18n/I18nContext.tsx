import React, { useEffect, useState } from 'react';
import en from './en.json';
import {
  I18nContext,
  type Language,
  type TranslationDictionary,
  type TranslationValue,
} from './i18n-context';
import vi from './vi.json';

const translations: Record<Language, TranslationDictionary> = { en, vi };

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguage] = useState<Language>('en');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language') as Language | null;
    const initialLanguage = savedLanguage || 'en';
    setLanguage(initialLanguage);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('language', language);
      document.documentElement.lang = language;
    }
  }, [language, isInitialized]);

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: TranslationValue | undefined = translations[language];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }

    return typeof value === 'string' ? value : key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};
