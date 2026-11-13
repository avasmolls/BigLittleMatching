const steps = ["Upload files", "Review matches", "Export"];

export default function WorkflowSteps({ currentStep }) {
  return (
    <ol className="workflow-steps" aria-label="Matching progress">
      {steps.map((label, index) => {
        const step = index + 1;
        const complete = step < currentStep;
        return (
          <li key={label} className={`workflow-step ${complete ? "complete" : ""}`} aria-current={step === currentStep ? "step" : undefined}>
            <span className="step-number" aria-hidden="true">
              {complete ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : step}
            </span>
            <span className="step-label">{label}{complete && <span className="visually-hidden"> (completed)</span>}</span>
            {step < steps.length && <span className="step-arrow" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
