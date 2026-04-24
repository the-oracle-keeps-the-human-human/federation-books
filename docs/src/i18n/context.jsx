import { createContext, useContext, useState } from 'react';
import en from './en';
import th from './th';

const translations = { en, th };
const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('federation-docs-lang') || 'en';
    } catch {
      return 'en';
    }
  });

  const toggleLang = () => {
    const next = lang === 'en' ? 'th' : 'en';
    setLang(next);
    try {
      localStorage.setItem('federation-docs-lang', next);
    } catch {
      // localStorage unavailable (SSR, privacy mode)
    }
  };

  const t = (key) => {
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
