const TOPICS = [
  [
    "account-sign-in",
    "Account & access",
    "Sign in to Sousa Murray Planeia",
    "Use the Log In button and complete Microsoft sign-in in the same browser tab. Keep essential cookies enabled and avoid switching between several sign-in tabs.",
    [
      "Close duplicate sign-in tabs.",
      "Return to Sousa Murray Planeia and choose Log In.",
      "Complete Microsoft sign-in in the same browser."
    ],
    [
      "login",
      "sign in",
      "Microsoft",
      "account",
      "cookies",
      "session"
    ]
  ],
  [
    "account-loop",
    "Account & access",
    "Sign-in page keeps returning",
    "A sign-in loop is commonly resolved by closing duplicate tabs, allowing essential cookies and starting a fresh sign-in from Sousa Murray Planeia.",
    [
      "Close other Sousa Murray Planeia tabs.",
      "Allow essential cookies for the site.",
      "Open a fresh tab and sign in once."
    ],
    [
      "sign in loop",
      "redirect",
      "cookies",
      "session"
    ]
  ],
  [
    "account-email",
    "Account & access",
    "Account email does not match",
    "Use the Microsoft account associated with your Sousa Murray Planeia customer account. Sign out of other Microsoft accounts if the browser selects the wrong identity.",
    [
      "Sign out of the incorrect Microsoft identity.",
      "Open Sousa Murray Planeia in a fresh tab.",
      "Choose the intended Microsoft account."
    ],
    [
      "wrong email",
      "account mismatch",
      "Microsoft identity"
    ]
  ],
  [
    "account-security",
    "Account & access",
    "Keep sign-in details secure",
    "Sousa Murray Planeia support will never ask for your password, full payment-card number, CVV or one-time authentication code.",
    [
      "Do not share security credentials in chat.",
      "Use the official sign-in screen only.",
      "Report suspicious requests to the support team."
    ],
    [
      "password",
      "one time code",
      "OTP",
      "security",
      "CVV"
    ]
  ],
  [
    "builder-start",
    "Builders & plans",
    "Start the right plan builder",
    "Open Explore Builders, compare the available templates and choose the builder that matches the type of plan you want to create.",
    [
      "Open Explore Builders.",
      "Review each builder description.",
      "Choose a template and begin the guided questions."
    ],
    [
      "builder",
      "start",
      "template",
      "planning"
    ]
  ],
  [
    "builder-save",
    "Builders & plans",
    "Save a plan",
    "Complete required builder fields, preview the plan and save it while signed in. Keep one builder tab open while saving.",
    [
      "Confirm you are signed in.",
      "Complete required questions.",
      "Preview, then choose Save."
    ],
    [
      "save",
      "builder",
      "plan",
      "draft"
    ]
  ],
  [
    "builder-preview",
    "Builders & plans",
    "Preview a plan",
    "Use Preview after completing the required questions. If preview does not open, check for highlighted fields and retry in one browser tab.",
    [
      "Review highlighted required fields.",
      "Complete any missing answers.",
      "Choose Preview again."
    ],
    [
      "preview",
      "builder",
      "missing field"
    ]
  ],
  [
    "builder-edit",
    "Builders & plans",
    "Edit a saved plan",
    "Open your saved plans, select the plan and choose the available edit or continue option. Save again after making changes.",
    [
      "Open your saved plans.",
      "Select the plan to change.",
      "Edit, preview and save the update."
    ],
    [
      "edit",
      "saved plan",
      "change plan"
    ]
  ],
  [
    "builder-download",
    "Builders & plans",
    "Download or print a plan",
    "Open the finished plan and use its download or print action. Allow the browser download and check the Downloads folder.",
    [
      "Open the finished plan.",
      "Choose Download or Print.",
      "Check the browser Downloads list if no file appears."
    ],
    [
      "download",
      "print",
      "PDF",
      "plan"
    ]
  ],
  [
    "builder-lost",
    "Builders & plans",
    "Find a missing saved plan",
    "Confirm you are signed into the same customer account used when the plan was saved, then refresh the saved-plans page once.",
    [
      "Check the signed-in email.",
      "Open Saved Plans.",
      "Refresh once and search for the plan title."
    ],
    [
      "missing plan",
      "lost draft",
      "saved plans"
    ]
  ],
  [
    "builder-mobile",
    "Builders & plans",
    "Use builders on a phone or tablet",
    "Builders support responsive layouts. Rotate the device if helpful, keep the browser current and avoid private browsing if you need the session to persist.",
    [
      "Update the browser if needed.",
      "Use portrait or landscape orientation with the clearest layout.",
      "Keep the builder in one tab."
    ],
    [
      "mobile",
      "phone",
      "tablet",
      "builder"
    ]
  ],
  [
    "builder-error",
    "Technical support",
    "Builder error or failure",
    "Refresh the affected page once, confirm your sign-in is still active and reproduce the problem in one tab. Record the exact message if it continues.",
    [
      "Copy the exact error message.",
      "Refresh once and confirm sign-in.",
      "Retry the same steps in one tab."
    ],
    [
      "error",
      "builder broken",
      "not working",
      "failure"
    ]
  ],
  [
    "plans-share",
    "Builders & plans",
    "Share plan information safely",
    "Review a plan before sharing or printing it and remove information you do not want another person to see.",
    [
      "Preview the plan.",
      "Check personal and booking information.",
      "Download or share only with intended recipients."
    ],
    [
      "share",
      "privacy",
      "plan"
    ]
  ],
  [
    "billing-plan",
    "Billing & subscriptions",
    "View a subscription plan",
    "Open Settings and Billing to review the current plan and available account billing actions.",
    [
      "Open Settings.",
      "Choose Billing.",
      "Review the active plan and renewal information."
    ],
    [
      "subscription",
      "billing",
      "plan"
    ]
  ],
  [
    "billing-invoice",
    "Billing & subscriptions",
    "Find an invoice or receipt",
    "Use the Billing area and secure billing portal where available to view invoices and receipts associated with the account.",
    [
      "Open Settings and Billing.",
      "Open the secure billing portal.",
      "Choose the relevant invoice or receipt."
    ],
    [
      "invoice",
      "receipt",
      "payment"
    ]
  ],
  [
    "billing-cancel",
    "Billing & subscriptions",
    "Cancel or change a subscription",
    "Use the secure Billing area for supported subscription changes. Review the effective date before confirming.",
    [
      "Open Settings and Billing.",
      "Choose the relevant subscription action.",
      "Review and confirm the effective date."
    ],
    [
      "cancel",
      "change subscription",
      "renewal"
    ]
  ],
  [
    "billing-failed",
    "Billing & subscriptions",
    "Payment did not complete",
    "Check that billing details are current and retry only once. Do not send card details in the chatbot; contact your card provider if it declines the transaction.",
    [
      "Do not share card details in chat.",
      "Review the message shown by the secure payment page.",
      "Retry once or contact the card provider."
    ],
    [
      "failed payment",
      "declined",
      "card",
      "Stripe"
    ]
  ],
  [
    "gyg-discover",
    "Affiliate travel partners",
    "Discover activities with GetYourGuide",
    "Sousa Murray Planeia can help you discover activity ideas and provide an affiliate link to GetYourGuide. Sousa Murray Planeia does not sell or fulfil the activity.",
    [
      "Tell the assistant the destination and interests.",
      "Review the suggested activity type.",
      "Open the GetYourGuide partner link to check current details."
    ],
    [
      "GetYourGuide",
      "things to do",
      "activity",
      "tour",
      "destination"
    ]
  ],
  [
    "gyg-booking",
    "Affiliate travel partners",
    "GetYourGuide booking support",
    "Sousa Murray Planeia provides affiliate links only. The activity is offered and fulfilled by GetYourGuide or its supplier. Booking confirmation, changes, cancellations and refunds are handled by the partner under its terms.",
    [
      "Open the GetYourGuide confirmation or account.",
      "Locate the partner booking reference.",
      "Contact GetYourGuide support for booking-specific help."
    ],
    [
      "GetYourGuide booking",
      "confirmation",
      "cancel tour",
      "refund activity"
    ]
  ],
  [
    "gyg-price",
    "Affiliate travel partners",
    "GetYourGuide prices and availability",
    "Prices, availability, schedules and activity details are controlled by GetYourGuide or the activity supplier and can change. Verify them on the partner page before booking.",
    [
      "Open the partner activity page.",
      "Check the date, participants and currency.",
      "Review the final price and terms before paying."
    ],
    [
      "GetYourGuide price",
      "availability",
      "schedule"
    ]
  ],
  [
    "gyg-ideas",
    "Affiliate travel partners",
    "GetYourGuide activity ideas",
    "Describe the destination, dates, group, interests, accessibility needs and approximate budget. The assistant can suggest useful activity categories before you visit the partner.",
    [
      "Provide the destination and dates.",
      "Describe interests, group and accessibility needs.",
      "Open partner links and verify suitability."
    ],
    [
      "GetYourGuide ideas",
      "recommend activities",
      "what to do"
    ]
  ],
  [
    "headout-discover",
    "Affiliate travel partners",
    "Discover experiences with Headout",
    "Sousa Murray Planeia can help you explore experience ideas and provide an affiliate link to Headout. Sousa Murray Planeia does not sell or fulfil the experience.",
    [
      "Tell the assistant where you are going.",
      "Describe the type of experience you want.",
      "Open the Headout partner link to check current details."
    ],
    [
      "Headout",
      "experience",
      "attraction",
      "ticket",
      "destination"
    ]
  ],
  [
    "headout-booking",
    "Affiliate travel partners",
    "Headout booking support",
    "Sousa Murray Planeia provides affiliate links only. The experience is offered and fulfilled by Headout or its supplier. Booking confirmation, changes, cancellations and refunds are handled by the partner under its terms.",
    [
      "Open the Headout confirmation or account.",
      "Locate the partner booking reference.",
      "Contact Headout support for booking-specific help."
    ],
    [
      "Headout booking",
      "ticket confirmation",
      "cancel experience",
      "refund ticket"
    ]
  ],
  [
    "headout-price",
    "Affiliate travel partners",
    "Headout prices and availability",
    "Prices, availability, entry times and experience details are controlled by Headout or the supplier and can change. Verify them on the partner page before booking.",
    [
      "Open the partner experience page.",
      "Check the date, entry time and participants.",
      "Review the final price and terms before paying."
    ],
    [
      "Headout price",
      "availability",
      "entry time"
    ]
  ],
  [
    "headout-ideas",
    "Affiliate travel partners",
    "Headout experience ideas",
    "Describe the destination, dates, group, interests, accessibility needs and approximate budget. The assistant can suggest experience categories before you visit the partner.",
    [
      "Provide destination and dates.",
      "Describe interests and practical requirements.",
      "Open partner links and verify suitability."
    ],
    [
      "Headout ideas",
      "recommend experience",
      "attractions"
    ]
  ],
  [
    "affiliate-role",
    "Affiliate travel partners",
    "How Sousa Murray Planeia affiliate links work",
    "Sousa Murray Planeia may earn a commission when an eligible purchase is made through an affiliate link. The partner remains responsible for its product, booking, payment, fulfilment and support.",
    [
      "Review the affiliate notice.",
      "Open the partner page for live information.",
      "Read the partner terms before booking."
    ],
    [
      "affiliate",
      "commission",
      "partner link",
      "not our product"
    ]
  ],
  [
    "affiliate-compare",
    "Affiliate travel partners",
    "Compare partner activity options",
    "The assistant can help narrow ideas by destination, dates, group, interests, accessibility and budget. It cannot guarantee partner price, availability or suitability.",
    [
      "Describe what matters most.",
      "Compare the partner listings shown.",
      "Verify final details directly with the partner."
    ],
    [
      "compare",
      "GetYourGuide",
      "Headout",
      "activity ideas"
    ]
  ],
  [
    "affiliate-access",
    "Affiliate travel partners",
    "Accessibility information for partner activities",
    "Ask the assistant to help find relevant options, then verify step-free access, assistance, transport and other adjustments directly on the partner listing or with its provider.",
    [
      "Describe the required adjustment.",
      "Review the partner accessibility information.",
      "Contact the partner before booking if anything is unclear."
    ],
    [
      "wheelchair",
      "accessible tour",
      "accessibility activity"
    ]
  ],
  [
    "affiliate-confirm",
    "Affiliate travel partners",
    "Missing partner confirmation",
    "Sousa Murray Planeia cannot access GetYourGuide or Headout booking systems. Check spam folders and the partner account, then contact the named partner with the booking details.",
    [
      "Check email spam and promotions folders.",
      "Sign in to the partner account.",
      "Contact partner support with its booking reference."
    ],
    [
      "missing confirmation",
      "GetYourGuide email",
      "Headout email"
    ]
  ],
  [
    "privacy-request",
    "Privacy & data",
    "Make a data protection request",
    "Use Privacy & Data to request access, correction, deletion, restriction or objection. Provide enough detail to identify the relevant account information.",
    [
      "Open Privacy & Data.",
      "Choose the request type.",
      "Submit the details and retain the reference."
    ],
    [
      "GDPR",
      "data request",
      "delete data",
      "rectification",
      "DSAR"
    ]
  ],
  [
    "privacy-affiliate",
    "Privacy & data",
    "Privacy when opening an affiliate link",
    "Opening an affiliate link takes you to a separate partner service with its own privacy and cookie information. Review the partner notice before providing details.",
    [
      "Recognise that you are leaving Sousa Murray Planeia.",
      "Review the partner privacy and cookie notice.",
      "Only provide information you are comfortable sharing."
    ],
    [
      "affiliate privacy",
      "cookies",
      "tracking link"
    ]
  ],
  [
    "access-controls",
    "Accessibility",
    "Use website accessibility controls",
    "Open the accessibility controls to adjust text size, contrast, motion, font, link underlining or grayscale where available.",
    [
      "Open Accessibility.",
      "Choose the adjustments you need.",
      "Use Reset to restore the standard presentation."
    ],
    [
      "contrast",
      "font size",
      "reduce motion",
      "dyslexia",
      "grayscale"
    ]
  ],
  [
    "pwa-install",
    "Website & app",
    "Install Sousa Murray Planeia as an app",
    "Use the browser install option where supported. The installed PWA uses the same customer account and online services as the website.",
    [
      "Open Sousa Murray Planeia in a supported browser.",
      "Choose Install app or Add to Home Screen.",
      "Open the installed app and sign in."
    ],
    [
      "PWA",
      "install app",
      "home screen"
    ]
  ],
  [
    "browser-cache",
    "Technical support",
    "Refresh outdated website content",
    "A normal refresh may resolve stale content. If needed, close existing tabs and reopen the site; avoid clearing all browser data unless necessary.",
    [
      "Refresh the page once.",
      "Close duplicate Sousa Murray Planeia tabs.",
      "Reopen the site and sign in if required."
    ],
    [
      "old page",
      "cache",
      "refresh",
      "stale"
    ]
  ],
  [
    "upload-help",
    "Technical support",
    "Prepare a useful support attachment",
    "Use a screenshot or document that shows the issue without exposing passwords, payment-card details, authentication codes or unrelated personal data.",
    [
      "Remove sensitive information.",
      "Use a supported PDF or image format.",
      "Add a short explanation of what the attachment shows."
    ],
    [
      "upload",
      "screenshot",
      "PDF",
      "PNG",
      "attachment"
    ]
  ]
];

const VARIANTS = [
  [
    "How do I",
    "step-by-step help"
  ],
  [
    "Help with",
    "support guidance"
  ],
  [
    "Troubleshoot",
    "troubleshooting"
  ],
  [
    "What should I know about",
    "important information"
  ],
  [
    "I need advice about",
    "practical advice"
  ],
  [
    "Common questions about",
    "frequently asked questions"
  ]
];

export const EXPANDED_DEFAULT_ARTICLES = TOPICS.flatMap(([id, category, title, answer, steps, keywords]) => {
  const base = { id, category, title, summary: answer, answer, steps, keywords, href: "/help-centre" };
  return [base, ...VARIANTS.map(([prefix, intent], index) => ({
    ...base,
    id: `${id}-${index + 1}`,
    title: `${prefix} ${title.charAt(0).toLowerCase()}${title.slice(1)}?`,
    summary: `${intent}: ${answer}`,
    keywords: [...keywords, intent, prefix.toLowerCase()]
  }))];
});
