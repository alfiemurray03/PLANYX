const FLOWS = {
  account: {
    label: "Account or sign-in",
    category: "Technical Support",
    priority: "High",
    questions: [
      "Which sign-in option are you using for your Sousa Murray Planeia account?",
      "What happens when you try to sign in? If you see an error message, please tell me exactly what it says.",
      "What device and browser are you using?",
      "When did this start, and does it happen every time you try?"
    ]
  },
  billing: {
    label: "Billing or subscription",
    category: "Billing",
    priority: "High",
    questions: [
      "Which subscription plan or payment do you need help with?",
      "Was a payment taken? If so, please provide the date, amount and invoice or receipt reference. Do not send any card details.",
      "Is the problem about a renewal, cancellation, trial, failed payment or an unexpected charge?",
      "What would you like the support team to look into or put right?"
    ]
  },
  builders: {
    label: "Builders or saved plans",
    category: "Technical Support",
    priority: "Normal",
    questions: [
      "Which builder or saved plan are you having trouble with?",
      "What were you trying to do — save, preview, edit or download the plan, or something else?",
      "What happened? If an error message appeared, please tell me exactly what it said.",
      "Does the same thing happen each time, and what device and browser are you using?"
    ]
  },
  privacy: {
    label: "Privacy or data",
    category: "Data Protection",
    priority: "High",
    questions: [
      "Is this about accessing, correcting or deleting your information, restricting or objecting to its use, or reporting a possible data incident?",
      "Which account or information is affected? Please do not send passwords or authentication codes.",
      "When did you first notice this?",
      "Do you think there is any immediate risk to your personal information or account security?"
    ]
  },
  technical: {
    label: "Technical problem",
    category: "Technical Support",
    priority: "Normal",
    questions: [
      "Which page or feature are you having trouble with?",
      "What were you trying to do when it happened?",
      "What happened instead of what you expected? Please include the exact error message if there was one.",
      "Are you using the installed app or the website, and what device and browser are you using?",
      "Roughly when did it happen, and does it happen every time?"
    ]
  },
  general: {
    label: "General support",
    category: "General Enquiry",
    priority: "Normal",
    questions: [
      "Please tell me what you need help with and what has happened so far.",
      "Which part of Sousa Murray Planeia does this relate to?",
      "What have you tried already, and what would you like to happen next?"
    ]
  }
};

const SUPPORT_CONFIRMATION = "Would you like me to send this conversation to the support team?";

function confirmsSupport(message) {
  return /^(?:yes\b|please do\b|send\b|go ahead\b|contact\b|submit\b)/i.test(message);
}

function declinesSupport(message) {
  return /^(?:no\b|not yet\b|keep helping\b|try again\b|do not send\b|don't send\b)/i.test(message);
}

function text(value) {
  return String(value || "").trim();
}

function normaliseHistory(history) {
  return Array.isArray(history)
    ? history.slice(-20).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: text(item?.content || item?.text)
      })).filter((item) => item.content)
    : [];
}

function detectFlow(message, history) {
  const all = `${history.map((item) => item.content).join(" ")} ${message}`.toLowerCase();
  if (/privacy|data|gdpr|delete|deletion|dsar|breach|personal information/.test(all)) return "privacy";
  if (/bill|subscription|payment|charge|invoice|refund|stripe|renewal|trial/.test(all)) return "billing";
  if (/builder|saved plan|preview|download|save|template|itinerary/.test(all)) return "builders";
  if (/login|log in|sign in|account|microsoft|pin|authentication/.test(all)) return "account";
  if (/error|broken|not working|loading|blank|website|app|browser|technical/.test(all)) return "technical";
  return "general";
}

const TRIAGE_QUESTIONS = Object.values(FLOWS).flatMap((flow) => flow.questions);

function containsTriageQuestion(content) {
  return TRIAGE_QUESTIONS.some((question) => content.includes(question));
}

function triageStarted(history) {
  return history.some((item) => item.role === "assistant" && containsTriageQuestion(item.content));
}

function escalationRequested(message) {
  return /\b(no|not solved|did not work|didn't work|still|human|person|agent|contact|enquiry|escalate|support team)\b/i.test(message);
}

function answeredQuestionCount(history) {
  let count = 0;
  for (let index = 0; index < history.length; index += 1) {
    const item = history[index];
    if (item.role !== "assistant" || !containsTriageQuestion(item.content)) continue;
    const next = history[index + 1];
    if (next?.role === "user" && next.content) count += 1;
  }
  return count;
}

function urgentPriority(flowKey, message, history) {
  const all = `${history.map((item) => item.content).join(" ")} ${message}`.toLowerCase();
  if (/data breach|account takeover|hacked|security incident|fraud|immediate risk|service-wide|everyone|all users/.test(all)) return "Urgent";
  if (/payment taken|charged twice|locked out|cannot access paid|paid service unavailable|suspended/.test(all)) return "High";
  return FLOWS[flowKey].priority;
}

export function guidedEscalation(config, message, rawHistory) {
  if (!config?.escalationEnabled) return null;
  const history = normaliseHistory(rawHistory);
  const flowKey = detectFlow(message, history);
  const flow = FLOWS[flowKey];
  const confirmationAsked = history.some((item) => item.role === "assistant" && item.content.includes(SUPPORT_CONFIRMATION));

  if (confirmationAsked) {
    if (declinesSupport(message)) {
      return {
        reply: "No problem — I haven’t sent anything. Tell me what you would like to try next, or ask me another question.",
        suggestions: ["Try another question"],
        category: flow.category,
        suggestedSubject: `${flow.label} support request`,
        escalate: false,
        resolved: false,
        source: "guided_triage"
      };
    }
    if (confirmsSupport(message)) {
      const priority = urgentPriority(flowKey, message, history);
      return {
        reply: "Thanks — I’m sending the conversation to the support team now. I’ll show your enquiry reference as soon as it has been submitted.",
        suggestions: [],
        category: flow.category,
        suggestedSubject: `[${priority}] ${flow.label} support request`,
        escalate: true,
        resolved: false,
        priority,
        source: "guided_triage"
      };
    }
    return {
      reply: `I haven’t sent anything yet. ${SUPPORT_CONFIRMATION}`,
      suggestions: ["Yes, send it to the support team", "No, keep helping me"],
      category: flow.category,
      suggestedSubject: `${flow.label} support request`,
      escalate: false,
      resolved: false,
      source: "guided_triage"
    };
  }

  const started = triageStarted(history);
  if (!started && !escalationRequested(message)) return null;
  const answered = answeredQuestionCount(history);

  if (answered < flow.questions.length) {
    const introduction = answered === 0 ? "Of course — I’ll ask a few questions so I can understand what has happened and help properly." : "";
    const securityNote = answered === 0 ? "Please don’t send passwords, full payment-card numbers, security codes or authentication codes." : "";
    return {
      reply: [introduction, flow.questions[answered], securityNote].filter(Boolean).join("\n\n"),
      suggestions: [],
      category: flow.category,
      suggestedSubject: `${flow.label} support request`,
      escalate: false,
      resolved: false,
      source: "guided_triage"
    };
  }

  return {
    reply: `Thanks — I’ve got the information the support team would need. ${SUPPORT_CONFIRMATION}`,
    suggestions: ["Yes, send it to the support team", "No, keep helping me"],
    category: flow.category,
    suggestedSubject: `${flow.label} support request`,
    escalate: false,
    resolved: false,
    source: "guided_triage"
  };
}
