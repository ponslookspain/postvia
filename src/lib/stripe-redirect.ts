/**
 * Exact allowlist for browser navigation targets returned by billing APIs.
 * Stripe Checkout sessions live on checkout.stripe.com, the Customer Portal
 * on billing.stripe.com — both plain https with no user-info, port or path
 * tricks. Dependency-free so approved client components can import it
 * without pulling the Stripe server SDK into the browser bundle.
 */
const STRIPE_REDIRECT_HOSTS = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);

export function isStripeRedirectUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    STRIPE_REDIRECT_HOSTS.has(url.hostname) &&
    url.username === "" &&
    url.password === "" &&
    url.port === ""
  );
}
