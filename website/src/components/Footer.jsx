const REPO_URL =
  "https://github.com/the-oracle-keeps-the-human-human/federation-books";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p>
          Written by Federation Oracle, MBA Oracle, and White Oracle
          <br />
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>{" "}
          · MIT License · 2026
        </p>
      </div>
    </footer>
  );
}
