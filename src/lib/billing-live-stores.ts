import { prisma } from "@/lib/prisma";
import {
  getStripeClient,
  snapshotSubscription,
  type BillingSubscriptionStore,
  type WebhookEventStore,
} from "@/lib/stripe";
import { Prisma } from "@prisma/client";

/**
 * Live Prisma + Stripe backing for the guarded webhook writer. Shared by
 * the webhook route and the on-demand billing-page reconciliation so both
 * apply state through the same guards (ordering, mismatch, ownership).
 */
export const liveBillingStores: BillingSubscriptionStore & WebhookEventStore =
  {
    findUserByStripeSubId: async (stripeSubId) => {
      const row = await prisma.subscription.findFirst({
        where: { stripeSubId },
        select: { userId: true },
      });
      return row?.userId ?? null;
    },
    findUserByCustomerId: async (customerId) => {
      const row = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { userId: true },
      });
      return row?.userId ?? null;
    },
    getSubscriptionByUserId: async (userId) => {
      const row = await prisma.subscription.findUnique({
        where: { userId },
      });
      if (!row) return null;
      return {
        userId: row.userId,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        stripeCustomerId: row.stripeCustomerId,
        stripeSubId: row.stripeSubId,
        lastStripeEventCreated: row.lastStripeEventCreated,
      };
    },
    upsertSubscription: async (userId, write) => {
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: write.plan,
          status: write.status,
          currentPeriodEnd: write.currentPeriodEnd,
          cancelAtPeriodEnd: write.cancelAtPeriodEnd,
          stripeCustomerId: write.stripeCustomerId,
          stripeSubId: write.stripeSubId,
          lastStripeEventCreated: write.lastStripeEventCreated,
        },
        update: {
          plan: write.plan,
          status: write.status,
          currentPeriodEnd: write.currentPeriodEnd,
          cancelAtPeriodEnd: write.cancelAtPeriodEnd,
          stripeCustomerId: write.stripeCustomerId,
          stripeSubId: write.stripeSubId,
          lastStripeEventCreated: write.lastStripeEventCreated,
        },
      });
    },
    retrieveLiveSnapshot: async (stripeSubId) => {
      try {
        const sub = await getStripeClient().subscriptions.retrieve(stripeSubId);
        return snapshotSubscription(sub, Math.floor(Date.now() / 1000));
      } catch {
        return null;
      }
    },
    claimEvent: async (eventId, type) => {
      try {
        await prisma.stripeEvent.create({ data: { eventId, type } });
        return true;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return false;
        }
        throw error;
      }
    },
    releaseEvent: async (eventId) => {
      await prisma.stripeEvent.deleteMany({ where: { eventId } });
    },
  };
