import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './components/HomePage';
import DocPage from './components/DocPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/guides/:slug" element={<DocPage section="guides" />} />
        <Route path="/reference/:slug" element={<DocPage section="reference" />} />
        <Route path="/recipes/:slug" element={<DocPage section="recipes" />} />
        <Route path="/blog/:slug" element={<DocPage section="blog" />} />
      </Routes>
    </Layout>
  );
}
