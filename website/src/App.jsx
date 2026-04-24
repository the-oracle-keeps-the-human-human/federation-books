import Header from "./components/Header";
import QuickStart from "./components/QuickStart";
import OracleGrid from "./components/OracleGrid";
import DocGrid from "./components/DocGrid";
import SkillGrid from "./components/SkillGrid";
import Footer from "./components/Footer";
import { guides, references, stories } from "./data/docs";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="container">
        <QuickStart />
        <OracleGrid />
        <DocGrid title="Guides" docs={guides} />
        <DocGrid title="Reference" docs={references} />
        <DocGrid title="Stories & Recipes" docs={stories} />
        <SkillGrid />
      </main>
      <Footer />
    </div>
  );
}
