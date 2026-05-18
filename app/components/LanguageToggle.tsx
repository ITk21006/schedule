import { Form } from 'react-router';
import { useLang } from '~/lib/i18n';

// EN / LV pill toggle that POSTs to /set-language.
// Renders inline; place it in the top-left of the page header.
export function LanguageToggle() {
  const lang = useLang();

  const baseStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.6)',
    cursor: 'pointer',
    background: 'transparent',
    color: '#fff',
  };

  const activeStyle: React.CSSProperties = {
    ...baseStyle,
    background: '#fff',
    color: 'var(--primary-color)',
    cursor: 'default',
  };

  return (
    <Form method="post" action="/set-language" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        type="submit"
        name="lang"
        value="en"
        disabled={lang === 'en'}
        aria-pressed={lang === 'en'}
        style={lang === 'en' ? activeStyle : baseStyle}
        title="English"
      >
        EN
      </button>
      <button
        type="submit"
        name="lang"
        value="lv"
        disabled={lang === 'lv'}
        aria-pressed={lang === 'lv'}
        style={lang === 'lv' ? activeStyle : baseStyle}
        title="Latviešu"
      >
        LV
      </button>
    </Form>
  );
}
