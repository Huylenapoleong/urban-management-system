import { createContext, useContext } from 'react';

export type Language = 'en' | 'vi';

export type TranslationValue = string | TranslationDictionary;

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }

  return context;
}
