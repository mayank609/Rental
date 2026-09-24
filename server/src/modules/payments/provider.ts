/**
 * Payment gateway abstraction.
 *
 * RazorpayProvider – production (India). Uses Orders + Checkout for
 *   collection, Refunds API, and Razorpay Route (linked accounts + direct
 *   transfers) for owner payouts. Funds stay in the platform account
 *   (escrow) until the rental completes, then a transfer is made.
 * MockProvider – development/test. Deterministic HMAC signatures, instant
 *   refunds and transfers, so the full flow can be exercised offline.
 *
 * Stripe Connect can be added by implementing the same interface.
 */
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../../config/env";
import { safeEqual } from "../../lib/crypto";

export interface ProviderPayment {
  id: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  amount: number;
  method?: string;
  errorDescription?: string;
}

export interface PaymentProvider {
  name: "razorpay" | "mock";
  publicKey: string;
  createOrder(input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<{ orderId: string }>;
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  refund(input: { paymentId: string; amount: number; idempotencyKey: string; notes?: Record<string, string> }): Promise<{ refundId: string; status: "processed" | "pending" | "failed" }>;
  createLinkedAccount(input: { email?: string | null; phone?: string | null; name: string; ifsc?: string | null; accountNumber?: string | null; upiId?: string | null; referenceId: string }): Promise<{ accountId: string }>;
  transfer(input: { accountId: string; amount: number; currency: string; notes?: Record<string, string>; idempotencyKey: string }): Promise<{ transferId: string }>;
}

// ---------------------------------------------------------------- mock ---
const MOCK_SECRET = "mock_payment_secret";
export const mockSign = (orderId: string, paymentId: string) =>
  crypto.createHmac("sha256", MOCK_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

/** In-memory state so fetchOrderPayments reflects simulated payments. */
const mockPayments = new Map<string, ProviderPayment[]>();
export function mockRecordPayment(orderId: string, p: ProviderPayment) {
  mockPayments.set(orderId, [...(mockPayments.get(orderId) ?? []), p]);
}

class MockProvider implements PaymentProvider {
  name = "mock" as const;
  publicKey = "rzp_test_mock";
  async createOrder() {
    return { orderId: `order_mock_${crypto.randomBytes(8).toString("hex")}` };
  }
  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return safeEqual(mockSign(orderId, paymentId), signature);
  }
  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    const expected = crypto.createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
  }
  async fetchOrderPayments(orderId: string) {
    return mockPayments.get(orderId) ?? [];
  }
  async refund() {
    return { refundId: `rfnd_mock_${crypto.randomBytes(6).toString("hex")}`, status: "processed" as const };
  }
  async createLinkedAccount() {
    return { accountId: `acc_mock_${crypto.randomBytes(6).toString("hex")}` };
  }
  async transfer() {
    return { transferId: `trf_mock_${crypto.randomBytes(6).toString("hex")}` };
  }
}

// ------------------------------------------------------------ razorpay ---
class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;
  publicKey = env.RAZORPAY_KEY_ID!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rzp: any = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });

  async createOrder(input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }) {
    const o = await this.rzp.orders.create({ amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes, payment_capture: 1 });
    return { orderId: o.id as string };
  }
  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
    return safeEqual(expected, signature);
  }
  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
  }
  async fetchOrderPayments(orderId: string) {
    const res = await this.rzp.orders.fetchPayments(orderId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.items ?? []).map((p: any) => ({ id: p.id, status: p.status, amount: p.amount, method: p.method, errorDescription: p.error_description }));
  }
  async refund(input: { paymentId: string; amount: number; idempotencyKey: string; notes?: Record<string, string> }) {
    const r = await this.rzp.payments.refund(input.paymentId, { amount: input.amount, speed: "normal", notes: input.notes, receipt: input.idempotencyKey.slice(0, 40) });
    return { refundId: r.id as string, status: (r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending") as "processed" | "pending" | "failed" };
  }
  async createLinkedAccount(input: { email?: string | null; phone?: string | null; name: string; ifsc?: string | null; accountNumber?: string | null; upiId?: string | null; referenceId: string }) {
    // Route linked account (v2 Accounts API). Settlement details are attached
    // via product configuration; KYC is completed on Razorpay's side.
    const acc = await this.rzp.accounts.create({
      email: input.email ?? undefined,
      phone: input.phone?.replace(/^\+91/, "") ?? undefined,
      type: "route",
      reference_id: input.referenceId.slice(0, 20),
      legal_business_name: input.name,
      business_type: "individual",
      contact_name: input.name,
      profile: { category: "others", subcategory: "others", addresses: {} },
    });
    const product = await this.rzp.products.requestProductConfiguration(acc.id, { product_name: "route", tnc_accepted: true });
    if (input.accountNumber && input.ifsc) {
      await this.rzp.products.edit(acc.id, product.id, {
        settlements: { account_number: input.accountNumber, ifsc_code: input.ifsc, beneficiary_name: input.name },
        tnc_accepted: true,
      });
    }
    return { accountId: acc.id as string };
  }
  async transfer(input: { accountId: string; amount: number; currency: string; notes?: Record<string, string> }) {
    const t = await this.rzp.transfers.create({ account: input.accountId, amount: input.amount, currency: input.currency, notes: input.notes });
    return { transferId: t.id as string };
  }
}

export const paymentProvider: PaymentProvider =
  env.PAYMENT_PROVIDER === "razorpay" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? new RazorpayProvider() : new MockProvider();
