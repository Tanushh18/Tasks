/**
 * The 25 built-in quotes for WhatsApp auto send (SHINE ONE ESTATE, construction). Each send picks one at random,
 * never the same one twice in a row. The price line is the advertised starting rate, as in the approved copy.
 */
export interface AutoTemplate {
  id: string;
  name: string;
  text: string;
}

export const AUTO_TEMPLATES: AutoTemplate[] = [
  { id: "c01", name: "Build Your Dream Home", text: "🏠 Build Your Dream Home!\nBuild your dream home at just ₹1,000/Sq. Ft. With Material*\n📞 Call: 9310994032\nSHINE ONE ESTATE" },
  { id: "c02", name: "Dream, Our Construction", text: "🏗️ Your Dream, Our Construction!\nComplete civil construction starting at just ₹1,000/Sq. Ft. With Material*\n📞 9310994032 | SHINE ONE ESTATE" },
  { id: "c03", name: "Turn Plot Into Home", text: "🔑 Turn Your Plot Into Your Dream Home!\nWe build your vision with quality and commitment.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032 – SHINE ONE ESTATE" },
  { id: "c04", name: "Strong Foundations", text: "🧱 Strong Foundations, Better Tomorrow!\nQuality civil construction at just ₹1,000/Sq. Ft. With Material*\n📞 Contact: 9310994032\nSHINE ONE ESTATE" },
  { id: "c05", name: "Build Smart", text: "💰 Build Smart, Save More!\nAffordable home construction without compromising on quality.\nStarting ₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c06", name: "Your Land, Our Expertise", text: "🏡 Your Land, Our Expertise!\nHave a plot in Gurgaon? Let's build something beautiful!\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE | 9310994032" },
  { id: "c07", name: "Foundation to Finishing", text: "🏗️ From Foundation to Finishing!\nComplete civil construction solutions for your dream property.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c08", name: "Make It a Reality", text: "✨ Make Your Dream Home a Reality!\nBeautiful construction, trusted materials and professional execution.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c09", name: "Tired of Managing", text: "🛠️ Tired of Managing Construction Yourself?\nLet our team handle your construction journey.\nStarting at ₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c10", name: "Have a Plot? Start Today", text: "📐 Have a Plot? Start Building Today!\nTurn your empty plot into a beautiful home.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE | 9310994032" },
  { id: "c11", name: "Your Home, Your Design", text: "🏠 Your Home, Your Design, Our Responsibility!\nBuild a home that matches your lifestyle and budget.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c12", name: "Quality Materials", text: "🧱 Quality Materials. Professional Construction.\nBuild with confidence and give your property a strong foundation.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c13", name: "Build Something Amazing", text: "🔨 Let's Build Something Amazing!\nYour construction project deserves the right team.\nCivil Construction at ₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c14", name: "One Step Closer", text: "🌟 One Step Towards Your Dream Home!\nChoose quality, transparency and commitment.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c15", name: "Affordable Construction", text: "💎 Affordable Construction, Beautiful Living!\nMake your dream home a reality without stretching your budget.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c16", name: "Home Full of Memories", text: "👨‍👩‍👧 Build a Home Full of Memories!\nA perfect home for you and your family starts with the right construction team.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c17", name: "Independent Floor", text: "🏢 Planning an Independent Floor?\nGet professional civil construction for your residential building.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c18", name: "Plot Into Investment", text: "📈 Turn Your Plot Into an Investment!\nBuild residential floors and explore rental income opportunities.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c19", name: "Ready to Start", text: "🚧 Ready to Start Construction?\nGet in touch for your construction estimate and planning.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c20", name: "Build Today, Enjoy Tomorrow", text: "🏡 Build Today, Enjoy Tomorrow!\nSmart construction for a better future.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c21", name: "Built With Care", text: "💧 Built with Care, Designed to Last!\nQuality-focused construction with attention to every detail.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c22", name: "Gurgaon Is Growing", text: "🌆 Gurgaon Is Growing. Build Your Future Here!\nHave land in Gurgaon? Let's turn it into your dream property.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c23", name: "Empty Land to Buildings", text: "🛠️ From Empty Land to Beautiful Buildings!\nWe bring your construction vision to life.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
  { id: "c24", name: "Your Trust, Our Commitment", text: "🤝 Your Trust, Our Commitment!\nTransparent construction services with quality at every step.\n₹1,000/Sq. Ft. With Material*\nSHINE ONE ESTATE" },
  { id: "c25", name: "Build Your Future", text: "🎯 Don't Just Own a Plot, Build Your Future!\nStart your dream construction journey with Shine One Estate.\n₹1,000/Sq. Ft. With Material*\n📞 9310994032" },
];

/** Fills {name} and tidies spacing/punctuation left behind when the lead has no name ("Hi , ..." -> "Hi, ..."). */
export function renderAutoTemplate(text: string, name: string | undefined | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return text
    .replace(/\{name\}/gi, first)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

/** A random template from `pool` that is not `lastId`. `random` is injectable for tests. */
export function pickAutoTemplate(lastId: string | null | undefined, pool: AutoTemplate[] = AUTO_TEMPLATES, random: () => number = Math.random): AutoTemplate {
  const choices = pool.filter((x) => x.id !== lastId);
  const list = choices.length ? choices : pool;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}
