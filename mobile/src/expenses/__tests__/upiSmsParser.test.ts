import { fromExtracted, isObviouslyNotTransaction, looksLikeTransaction, parseUpiSms } from "../upiSmsParser";

const S1 = "Debited Rs 200.00 from a/c X9229 on 04Oct26 13:35 via UPI to Facebook Ind. Ref 664394072564.Bal Rs 11940.61. Not you?Call 18004251199 -Federal Bank";
const S2 = "Debited Rs 182.00 from a/c X9229 on 26Sep26 18:03 via UPI to Zomato Media. Ref 663526514328.Bal Rs 2874.61. Not you?Call 18004251199 -Federal Bank";
const S3 = "Debited Rs 500.00 from a/c X9229 on 25Sep26 21:35 via UPI to Meta Verifie. Ref 626895136750.Bal Rs 6056.61. Not you?Call 18004251199 -Federal Bank";

describe("parseUpiSms: Federal Bank samples", () => {
  it("sample 1", () => {
    expect(parseUpiSms(S1)).toMatchObject({
      type: "OUT", amount: 200, date: "2026-10-04", time: "13:35", merchant: "Facebook Ind",
      ref: "664394072564", accountLast4: "9229", bank: "Federal Bank", balance: 11940.61, key: "upi-664394072564",
    });
  });
  it("sample 2", () => {
    expect(parseUpiSms(S2)).toMatchObject({
      type: "OUT", amount: 182, date: "2026-09-26", time: "18:03", merchant: "Zomato Media",
      ref: "663526514328", accountLast4: "9229", balance: 2874.61,
    });
  });
  it("sample 3", () => {
    expect(parseUpiSms(S3)).toMatchObject({
      type: "OUT", amount: 500, date: "2026-09-25", time: "21:35", merchant: "Meta Verifie",
      ref: "626895136750", accountLast4: "9229", balance: 6056.61,
    });
  });
});

describe("parseUpiSms: variants", () => {
  it("credit via UPI", () => {
    const p = parseUpiSms("Credited Rs 1,250.50 to a/c X9229 on 05Oct26 09:10 via UPI from Ramesh Kumar. Ref 123456789012.Bal Rs 5000.00 -Federal Bank");
    expect(p).toMatchObject({ type: "IN", amount: 1250.5, merchant: "Ramesh Kumar", ref: "123456789012", date: "2026-10-05", time: "09:10" });
  });
  it("Rs. and INR forms", () => {
    expect(parseUpiSms("Rs. 99 debited from A/c XX1234 via UPI to Chai Point UPI Ref 111222333444")?.amount).toBe(99);
    expect(parseUpiSms("INR 75.00 debited A/c *1234 on 01-10-26 UPI to Cafe. Ref 998877665544")).toMatchObject({ amount: 75, accountLast4: "1234", date: "2026-10-01" });
    expect(parseUpiSms("₹300 paid via UPI to Shop Ref 555666777888")?.amount).toBe(300);
  });
  it("HDFC style", () => {
    const p = parseUpiSms("Sent Rs.350.00 From HDFC Bank A/c *1234 To SWIGGY On 04/10/26 Ref 628899001122 Not You? Call 18002586161");
    expect(p).toMatchObject({ type: "OUT", amount: 350, merchant: "SWIGGY", ref: "628899001122", accountLast4: "1234", date: "2026-10-04", bank: "HDFC Bank" });
  });
  it("SBI style", () => {
    const p = parseUpiSms("Dear UPI user A/c X1234 debited by Rs 200 on 04Oct26 trf to RAVI KUMAR Refno 123456789012. If not u? call 1800");
    expect(p).toMatchObject({ type: "OUT", amount: 200, merchant: "RAVI KUMAR", ref: "123456789012", accountLast4: "1234", date: "2026-10-04" });
  });
  it("short ref (Refno 123)", () => {
    expect(parseUpiSms("A/c X1234 debited by Rs 200 on 04Oct26 trf to NAME Refno 123")?.ref).toBe("123");
  });
  it("VPA payee prefers the readable name", () => {
    expect(parseUpiSms("Rs 40 debited A/c X1234 UPI to VPA abc@okhdfc JOHN DOE on 04-10-26. UPI Ref 123456789012")?.merchant).toBe("JOHN DOE");
  });
  it("falls back to the received time when the text has none", () => {
    const at = new Date(2026, 9, 6, 7, 5).getTime();
    expect(parseUpiSms("Debited Rs 10 via UPI to Shop Ref 123456789012", at)).toMatchObject({ date: "2026-10-06", time: "07:05" });
  });
  it("12 hour times", () => {
    expect(parseUpiSms("Debited Rs 10 on 04Oct26 1:05 PM via UPI to Shop Ref 123456789012")?.time).toBe("13:05");
  });
  it("ignores an impossible date", () => {
    const at = new Date(2026, 9, 6, 7, 5).getTime();
    expect(parseUpiSms("Debited Rs 10 on 31Feb26 via UPI to Shop Ref 123456789012", at)?.date).toBe("2026-10-06");
  });
});

describe("parseUpiSms: rejects", () => {
  it.each([
    "123456 is your OTP for UPI payment of Rs 200. Do not share.",
    "Debited Rs 200 via UPI to Shop Ref 123456789012 failed. Amount will be reversed",
    "UPI transaction of Rs 200 declined due to insufficient balance",
    "Rs 200 reversed to your a/c via UPI Ref 123456789012",
    "Get 10% cashback! Pay Rs 200 via UPI now https://x.in",
    "Hello from the bank",
    "",
  ])("null: %s", (b) => {
    expect(parseUpiSms(b)).toBeNull();
  });
  it("non-UPI debit without a reference is ignored", () => {
    expect(parseUpiSms("Debited Rs 5000 from a/c X1234 at ATM on 04Oct26")).toBeNull();
    expect(parseUpiSms("Rs 5000 debited from a/c X1234 NEFT")).toBeNull();
  });
  it("needs an amount and a direction", () => {
    expect(parseUpiSms("Your UPI Ref 123456789012 is processed")).toBeNull();
    expect(parseUpiSms("UPI payment Rs 200 Ref 123456789012")).toBeNull();
  });
});

describe("dedupe key", () => {
  it("is stable and ref based", () => {
    expect(parseUpiSms(S1)?.key).toBe(parseUpiSms(S1)?.key);
    expect(parseUpiSms(S1)?.key).toBe("upi-664394072564");
  });
  it("hashes when there is no ref", () => {
    const a = parseUpiSms("Debited Rs 10 on 04Oct26 10:00 via UPI to Shop a/c X1234")!;
    const b = parseUpiSms("Debited Rs 10 on 04Oct26 10:00 via UPI to Shop a/c X1234")!;
    const c = parseUpiSms("Debited Rs 11 on 04Oct26 10:00 via UPI to Shop a/c X1234")!;
    expect(a.ref).toBe("");
    expect(a.key).toMatch(/^upi-h[0-9a-f]{8}$/);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});

describe("looksLikeTransaction / isObviouslyNotTransaction", () => {
  it("true for a bank-looking sender with money words", () => {
    expect(looksLikeTransaction("Rs 250 paid to Foo via new format xyz", "VM-FEDBNK")).toBe(true);
  });
  it("false for phone-number senders, OTP, promo, no amount", () => {
    expect(looksLikeTransaction("Rs 250 paid to Foo", "+919876543210")).toBe(false);
    expect(looksLikeTransaction("OTP 1234 for Rs 250 payment", "VM-FEDBNK")).toBe(false);
    expect(looksLikeTransaction("Cashback offer: Rs 250 credited soon", "VM-FEDBNK")).toBe(false);
    expect(looksLikeTransaction("Your account was debited", "VM-FEDBNK")).toBe(false);
  });
  it("flags obvious non-transactions", () => {
    expect(isObviouslyNotTransaction("Your OTP is 1234")).toBe(true);
    expect(isObviouslyNotTransaction(S1)).toBe(false);
  });
});

describe("fromExtracted", () => {
  it("validates and builds a key", () => {
    const p = fromExtracted({ type: "OUT", amount: 12, date: "2026-10-04", time: "10:30", merchant: "X", ref: "123456", accountLast4: "98765432" });
    expect(p).toMatchObject({ amount: 12, accountLast4: "5432", key: "upi-123456" });
    expect(fromExtracted({ type: "OUT", amount: -1 })).toBeNull();
    expect(fromExtracted({ type: "X", amount: 1 })).toBeNull();
  });
});
