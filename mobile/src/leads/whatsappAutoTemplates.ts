/**
 * The 12 hard-coded messages used by WhatsApp auto send. Each one is a different style (greeting, question, short
 * note, follow-up, ...) so no two leads in a row get the same wording. {name} is the lead's first name, or nothing.
 * They carry no prices or claims: only an introduction and an invitation to reply.
 */
export interface AutoTemplate {
  id: string;
  name: string;
  text: string;
}

export const AUTO_TEMPLATES: AutoTemplate[] = [
  { id: "t01", name: "Warm hello", text: "Hello {name}, hope you're doing well. I'm sharing details of plots in Farukh Nagar that may suit you. The picture is attached. Reply here and I'll tell you more." },
  { id: "t02", name: "Quick question", text: "Hi {name}, are you still looking for a plot or property in Farukh Nagar? If yes, I have a few good options to show you. Just reply and we can talk." },
  { id: "t03", name: "Short and simple", text: "Hi {name}! Plots available in Farukh Nagar. Details are in the picture. Message me if you'd like to know more." },
  { id: "t04", name: "Follow-up", text: "Hello {name}, following up on your enquiry about a plot. Is it still on your mind? I'd be happy to share what's available right now." },
  { id: "t05", name: "Site visit invite", text: "Hi {name}, would you like to visit the site this week? I can arrange a short visit at a time that suits you. The picture has the details." },
  { id: "t06", name: "Good morning", text: "Good morning {name}! A small note about plots in Farukh Nagar. Have a look at the attached picture and tell me what you think." },
  { id: "t07", name: "Investment angle", text: "Hello {name}, if you're thinking of buying land as a long-term investment, Farukh Nagar is worth a look. The attached picture has the basics. Happy to answer questions." },
  { id: "t08", name: "Family home", text: "Hi {name}, planning a home for your family? We have plots in Farukh Nagar in a calm, growing area. See the picture and let me know if you'd like the full details." },
  { id: "t09", name: "Reply with your budget", text: "Hello {name}, tell me your budget and the plot size you have in mind, and I'll send options that fit. The picture shows what we currently have." },
  { id: "t10", name: "Polite introduction", text: "Dear {name}, I hope this message finds you well. I help buyers find plots in Farukh Nagar. If this interests you, please reply and I'll call at a convenient time." },
  { id: "t11", name: "Evening note", text: "Good evening {name}. Sharing the latest on plots in Farukh Nagar. If you'd like a call to discuss, tell me a time that works for you." },
  { id: "t12", name: "No pressure", text: "Hi {name}, no hurry at all. Just sharing details of our plots in Farukh Nagar in case you're exploring. Reach out whenever you like." },
];

/** Fills {name} and tidies spacing/punctuation left behind when the lead has no name ("Hi , ..." -> "Hi, ..."). */
export function renderAutoTemplate(text: string, name: string | undefined | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return text
    .replace(/\{name\}/gi, first)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A random template that is not the one used last time. `random` is injectable for tests. */
export function pickAutoTemplate(lastId: string | null | undefined, random: () => number = Math.random): AutoTemplate {
  const pool = AUTO_TEMPLATES.filter((t) => t.id !== lastId);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
