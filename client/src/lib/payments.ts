/**
 * Opens Razorpay Checkout (production) or a simulated checkout (mock
 * provider in development), then verifies the payment server-side.
 */
import { api } from "./api";
import type { CheckoutPayload } from "./types";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment gateway. Check your connection."));
    document.body.appendChild(s);
  });
}

export interface PaymentResult {
  status: "success" | "cancelled" | "failed";
  message?: string;
}

export async function startCheckout(c: CheckoutPayload, description: string): Promise<PaymentResult> {
  if (c.provider === "mock") {
    const ok = window.confirm(`Simulated payment (development)\n\n${description}\nAmount: ₹${(c.amount / 100).toLocaleString("en-IN")}\n\nPress OK to pay, Cancel to abort.`);
    if (!ok) {
      await api.post("/payments/failed", { orderId: c.orderId, reason: "Checkout dismissed" }).catch(() => undefined);
      return { status: "cancelled" };
    }
    const sim = await api.post("/payments/mock/pay", { orderId: c.orderId });
    await api.post("/payments/verify", { orderId: sim.data.orderId, paymentId: sim.data.paymentId, signature: sim.data.signature });
    return { status: "success" };
  }

  await loadRazorpay();
  return new Promise<PaymentResult>((resolve) => {
    const rzp = new window.Razorpay!({
      key: c.keyId,
      order_id: c.orderId,
      amount: c.amount,
      currency: c.currency,
      name: c.name,
      description,
      prefill: c.prefill,
      theme: { color: "#4f46e5" },
      retry: { enabled: true, max_count: 3 },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await api.post("/payments/verify", { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
          resolve({ status: "success" });
        } catch {
          // Webhook + reconciliation will still confirm the payment server-side.
          resolve({ status: "success", message: "Payment received — confirmation may take a minute." });
        }
      },
      modal: {
        ondismiss: () => {
          api.post("/payments/failed", { orderId: c.orderId, reason: "Checkout dismissed" }).catch(() => undefined);
          resolve({ status: "cancelled" });
        },
      },
    });
    rzp.on("payment.failed", (r: unknown) => {
      const reason = (r as { error?: { description?: string } }).error?.description;
      resolve({ status: "failed", message: reason });
    });
    rzp.open();
  });
}
