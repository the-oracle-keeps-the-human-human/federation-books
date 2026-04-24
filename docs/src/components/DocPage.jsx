import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Breadcrumb from './Breadcrumb';
import { sections } from '../data/nav';

const mdModules = import.meta.glob('../content/**/*.md', {
  query: '?raw',
  import: 'default',
});

function CodeBlock({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';

  return (
    <pre
      style={{
        background: '#1d2d6b',
        border: 'none',
        borderRadius: 12,
        padding: '1.25rem',
        overflowX: 'auto',
        position: 'relative',
      }}
    >
      {lang && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            fontSize: '0.7rem',
            color: 'rgba(237,231,211,.5)',
            textTransform: 'uppercase',
          }}
        >
          {lang}
        </span>
      )}
      <code className={className} {...props}>
        {children}
      </code>
    </pre>
  );
}

const components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children, ...props }) {
    const isBlock = /language-/.test(className || '');
    if (isBlock) {
      return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
    }
    return (
      <code
        style={{
          background: 'rgba(29,45,107,.08)',
          padding: '0.15em 0.4em',
          borderRadius: 4,
          fontSize: '0.9em',
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            margin: '1rem 0',
          }}
        >
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th
        style={{
          border: '1px solid rgba(29,45,107,.15)',
          padding: '0.5rem 1rem',
          background: '#1d2d6b',
          color: '#ede7d3',
          textAlign: 'left',
          fontSize: '0.85em',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td style={{ border: '1px solid rgba(29,45,107,.15)', padding: '0.5rem 1rem', background: '#fff' }}>
        {children}
      </td>
    );
  },
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        style={{ color: '#1d2d6b', textDecoration: 'underline', textDecorationColor: '#f89b3f' }}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
};

function findDocTitle(section, slug) {
  const sec = sections.find((s) => s.id === section);
  if (!sec) return slug;
  const doc = sec.docs.find((d) => d.slug === slug);
  return doc ? doc.title.en : slug;
}

export default function DocPage({ section }) {
  const { slug } = useParams();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const key = `../content/${section}/${slug}.md`;
    const loader = mdModules[key];

    if (!loader) {
      setError(`Document not found: ${section}/${slug}`);
      setLoading(false);
      return;
    }

    loader()
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setError(`Failed to load: ${section}/${slug}`);
        setLoading(false);
      });
  }, [section, slug]);

  if (loading) {
    return (
      <div className="doc-loading">Loading...</div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#d8423a', padding: '2rem' }}>{error}</div>
    );
  }

  return (
    <article>
      <Breadcrumb section={section} title={findDocTitle(section, slug)} />
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
