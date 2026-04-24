import { quickStartSteps } from "../data/docs";

export default function QuickStart() {
  const workshopUrl =
    "https://github.com/the-oracle-keeps-the-human-human/federation-books/blob/main/guides/federation-workshop.md";

  return (
    <section className="section">
      <h2>Quick Start</h2>
      <div className="quick-start">
        <ol>
          {quickStartSteps.map((step, i) => (
            <li key={i}>
              {step.label}: <code>{step.cmd}</code>
            </li>
          ))}
          <li>
            Full tutorial:{" "}
            <a href={workshopUrl} target="_blank" rel="noreferrer">
              Workshop (10 min)
            </a>
          </li>
        </ol>
      </div>
    </section>
  );
}
