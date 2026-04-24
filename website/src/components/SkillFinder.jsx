import { useState } from "react";

const questions = [
  {
    id: "goal",
    q: "What do you need help with?",
    options: [
      { label: "Setting up federation for the first time", next: "setup" },
      { label: "Something is broken", next: "broken" },
      { label: "Sending messages across nodes", next: "messaging" },
      { label: "Managing my fleet of nodes", next: "fleet" },
      { label: "Connecting nodes over the internet", next: "tunnel" },
      { label: "Inviting someone to join", next: "invite" },
    ],
  },
  {
    id: "setup",
    q: "How much time do you have?",
    options: [
      { label: "5 minutes — just get it running", skill: "/federation-setup", note: "Interactive 9-step wizard" },
      { label: "I need copy-paste commands", skill: "/federation-invite", note: "Pre-filled config generator" },
    ],
  },
  {
    id: "broken",
    q: "Do you know which peer is failing?",
    options: [
      { label: "Yes, a specific peer", skill: "/federation-debug", note: "6-layer trace: DNS → HMAC" },
      { label: "No, I need a general checkup", skill: "/federation-doctor", note: "8 checks with --fix mode" },
      { label: "It was working, now it's not", skill: "/federation-monitor", note: "Track when nodes drop" },
    ],
  },
  {
    id: "messaging",
    q: "What kind of messaging?",
    options: [
      { label: "Send to one peer", skill: "/federation-message", note: "Quick send + templates" },
      { label: "Broadcast to everyone", skill: "/federation-message broadcast", note: "Send to all peers at once" },
      { label: "Full comms: listen, sync, PRs", skill: "/federation-talk", note: "Complete communication toolkit" },
    ],
  },
  {
    id: "fleet",
    q: "What do you want to see?",
    options: [
      { label: "Status of all nodes", skill: "/federation-fleet", note: "Dashboard + health scores" },
      { label: "Which oracles live where", skill: "/fleet-map", note: "Visual machine → repo → oracle tree" },
      { label: "Watch health over time", skill: "/federation-monitor", note: "Real-time with alerts" },
      { label: "Backup my config", skill: "/federation-backup", note: "Backup, restore, export peers" },
    ],
  },
  {
    id: "tunnel",
    q: "Which tunnel do you prefer?",
    options: [
      { label: "Tailscale (recommended)", skill: "/federation-tunnel tailscale", note: "Zero-config, permanent, fastest" },
      { label: "Cloudflare Tunnel", skill: "/federation-tunnel cloudflare", note: "Free, permanent URL, CDN" },
      { label: "ngrok (quick demo)", skill: "/federation-tunnel ngrok", note: "Instant, temporary" },
      { label: "Help me choose", skill: "/federation-tunnel", note: "Interactive comparison" },
    ],
  },
  {
    id: "invite",
    q: "Invite method?",
    options: [
      { label: "Generate a shareable text block", skill: "/federation-invite", note: "Copy-paste with your token + URL" },
      { label: "Walk them through setup live", skill: "/federation-setup", note: "Full wizard they can follow" },
    ],
  },
];

export default function SkillFinder() {
  const [step, setStep] = useState("goal");
  const [result, setResult] = useState(null);

  const current = questions.find((q) => q.id === step);

  const handlePick = (opt) => {
    if (opt.skill) {
      setResult(opt);
    } else if (opt.next) {
      setStep(opt.next);
    }
  };

  const reset = () => {
    setStep("goal");
    setResult(null);
  };

  return (
    <section className="section">
      <h2>Which Skill Do I Need?</h2>
      <div className="quick-start">
        {result ? (
          <div>
            <div style={{ fontSize: "1.3em", marginBottom: 8 }}>
              <span className="skill-name">{result.skill}</span>
            </div>
            <p>{result.note}</p>
            <pre style={{ marginTop: 12, padding: 12, background: "var(--bg)", borderRadius: 6 }}>
              <code>{result.skill}</code>
            </pre>
            <button onClick={reset} className="finder-reset">
              Try another question
            </button>
          </div>
        ) : current ? (
          <div>
            <p style={{ fontSize: "1.1em", marginBottom: 16 }}>{current.q}</p>
            <div className="finder-options">
              {current.options.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handlePick(opt)}
                  className="finder-btn"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {step !== "goal" && (
              <button onClick={reset} className="finder-back">
                Start over
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
