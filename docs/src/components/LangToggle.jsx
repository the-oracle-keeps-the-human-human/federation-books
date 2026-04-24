import { useLang } from '../i18n/context';

export default function LangToggle() {
  const { toggleLang, t } = useLang();

  return (
    <button
      onClick={toggleLang}
      className="lang-toggle"
      title="Switch language"
      style={{
        background: 'none',
        border: '1px solid currentColor',
        borderRadius: '999px',
        padding: '4px 12px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        color: 'inherit',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      {t('lang.current')} → {t('lang.switch')}
    </button>
  );
}
