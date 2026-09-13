import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { liveBillingStores } from "@/lib/billing-live-stores";
import {
  getStripeClient,
  processWebhookEvent,
  snapshotInvoice,
  snapshotSubscription,
  type WebhookOutcome,
  type WebhookPayload,
} from "@/lib/stripe";
import { logDiagnostic, reportError } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

const liveStores = liveBillingStores;

function payloadFor(event: Stripe.Event): WebhookPayload | null {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const snapshot = snapshotSubscription(event.data.object, event.created);
      if (!snapshot) return null;
      return { kind: "subscription", snapshot };
    }
    case "invoice.payment_succeeded":
      return {
        kind: "invoice",
        invoice: snapshotInvoice(event.data.object, true),
      };
    case "invoice.payment_failed":
      return {
        kind: "invoice",
        invoice: snapshotInvoice(event.data.object, false),
      };
    default:
      return null;
  }
}

function respondOutcome(
  event: Stripe.Event,
  outcome: WebhookOutcome
): NextResponse {
  // Only safe fields reach the logs: ids, types, plans, statuses.
  // Never emails, amounts, card or payment data.
  switch (outcome.outcome) {
    case "applied":
      logDiagnostic("billing", "webhook_applied", {
        type: event.type,
        eventId: event.id,
        userId: outcome.userId,
      });
      return NextResponse.json({ received: true });
    case "duplicate":
      logDiagnostic("billing", "webhook_duplicate", {
        type: event.type,
        eventId: event.id,
      });
      return NextResponse.json({ received: true, duplicate: true });
    case "ignored":
      logDiagnostic("billing", "webhook_ignored", {
        type: event.type,
        eventId: event.id,
        reason: outcome.reason,
      });
      return NextResponse.json({ received: true });
    case "unresolvable":
      reportError("billing", "webhook event has no matching user", undefined, {
        type: event.type,
        eventId: event.id,
        reason: outcome.reason,
      });
      // Ack anyway: retrying an event that can never resolve is a loop.
      return NextResponse.json({ received: true });
  }
}

/**
 * Stripe webhook — the ONLY writer of paid Subscription state.
 *
 * - Verifies the Stripe signature over the raw body before any processing.
 * - Claims the event id first: duplicate deliveries are acked as no-ops.
 * - Writes Subscription rows only; BillingTestOverride is never read or
 *   written here, so test state can never become (or corrupt) real billing.
 * - Unknown prices/statuses/users never grant access; failures return 5xx
 *   so Stripe retries, then the claim is released for the next attempt.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    reportError("billing", "stripe webhook secret is missing", undefined);
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 500 }
    );
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      secret
    );
  } catch (error) {
    reportError("billing", "stripe webhook signature invalid", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  logDiagnostic("billing", "webhook_received", {
    type: event.type,
    eventId: event.id,
  });
  try {
    const outcome = await processWebhookEvent({
      eventId: event.id,
      type: event.type,
      payload: payloadFor(event),
      stores: liveStores,
    });
    return respondOutcome(event, outcome);
  } catch (error) {
    // Release the claim so the Stripe retry can reprocess this delivery.
    try {
      await liveStores.releaseEvent(event.id);
    } catch {
      // The retry still arrives; the next claim attempt decides.
    }
    reportError("billing", "stripe webhook apply failed", error, {
      type: event.type,
      eventId: event.id,
    });
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
