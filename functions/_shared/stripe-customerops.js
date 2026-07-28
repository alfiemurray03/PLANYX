import {
  flushCustomerOpsOutbox,
  profileReferenceForStripe,
  queueCustomerOpsEvent
} from "./customerops-central.js";

function idValue(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

function stripeTime(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0
    ? new Date(Number(value) * 1000).toISOString()
    : null;
}

function invoiceSubscriptionId(invoice) {
  return idValue(invoice?.subscription)
    || idValue(invoice?.parent?.subscription_details?.subscription)
    || idValue(invoice?.lines?.data?.find(line => line?.subscription)?.subscription)
    || null;
}

function eventName(type) {
  return ({
    "checkout.session.completed": "order.completed",
    "customer.subscription.created": "subscription.started",
    "customer.subscription.updated": "subscription.changed",
    "customer.subscription.deleted": "subscription.cancelled",
    "invoice.paid": "payment.succeeded",
    "invoice.payment_failed": "payment.failed",
    "invoice.finalized": "invoice.finalized",
    "charge.refunded": "refund.completed",
    "charge.dispute.created": "payment.disputed"
  })[type] || `stripe.${type}`;
}

function title(type) {
  return ({
    "checkout.session.completed": "Planyx checkout completed",
    "customer.subscription.created": "Planyx subscription started",
    "customer.subscription.updated": "Planyx subscription changed",
    "customer.subscription.deleted": "Planyx subscription cancelled",
    "invoice.paid": "Stripe invoice paid",
    "invoice.payment_failed": "Stripe payment failed",
    "invoice.finalized": "Stripe invoice finalised",
    "charge.refunded": "Stripe refund completed",
    "charge.dispute.created": "Stripe payment dispute opened"
  })[type] || "Stripe customer event";
}

function subscriptionPayload(object, eventType) {
  if (!eventType.startsWith("customer.subscription.")) return undefined;
  const item = object.items?.data?.[0] || null;
  return {
    id: object.id,
    provider: "Stripe",
    customerReference: idValue(object.customer),
    planCode: object.metadata?.plan_code || item?.price?.metadata?.plan_code || null,
    planName: object.metadata?.plan_name || item?.price?.nickname || item?.price?.product?.name || null,
    status: eventType === "customer.subscription.deleted" ? "cancelled" : object.status || "unknown",
    amountMinor: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency || null,
    startedAt: stripeTime(object.start_date || object.created),
    currentPeriodStart: stripeTime(object.current_period_start),
    currentPeriodEnd: stripeTime(object.current_period_end),
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    cancelledAt: stripeTime(object.canceled_at),
    metadata: { stripeEventType: eventType, priceId: idValue(item?.price) }
  };
}

function orderPayload(object, eventType) {
  if (eventType !== "checkout.session.completed") return undefined;
  return {
    id: object.id,
    provider: "Stripe",
    type: "subscription_checkout",
    status: object.payment_status === "paid" ? "completed" : object.payment_status || "completed",
    amountMinor: object.amount_total ?? null,
    currency: object.currency || null,
    createdAt: stripeTime(object.created),
    completedAt: new Date().toISOString(),
    metadata: {
      planCode: object.metadata?.plan_code || null,
      planName: object.metadata?.plan_name || null,
      paymentIntentId: idValue(object.payment_intent)
    }
  };
}

function paymentPayload(object, eventType) {
  if (eventType.startsWith("invoice.")) {
    return {
      id: object.id,
      provider: "Stripe",
      customerReference: idValue(object.customer),
      status: eventType === "invoice.paid" ? "paid" : eventType === "invoice.payment_failed" ? "failed" : object.status || "finalised",
      amountMinor: eventType === "invoice.paid" ? object.amount_paid ?? object.amount_due ?? 0 : object.amount_due ?? 0,
      currency: object.currency || "GBP"
    };
  }
  if (eventType === "charge.refunded") {
    return {
      id: object.id,
      provider: "Stripe",
      customerReference: idValue(object.customer),
      status: "refunded",
      amountMinor: object.amount_refunded ?? object.amount ?? 0,
      currency: object.currency || "GBP"
    };
  }
  if (eventType === "charge.dispute.created") {
    const charge = typeof object.charge === "object" ? object.charge : null;
    return {
      id: object.id,
      provider: "Stripe",
      customerReference: idValue(charge?.customer || object.customer),
      status: "disputed",
      amountMinor: object.amount ?? charge?.amount ?? 0,
      currency: object.currency || charge?.currency || "GBP"
    };
  }
  if (eventType === "checkout.session.completed" && object.payment_intent) {
    return {
      id: idValue(object.payment_intent),
      provider: "Stripe",
      customerReference: idValue(object.customer),
      status: object.payment_status || "completed",
      amountMinor: object.amount_total ?? 0,
      currency: object.currency || "GBP"
    };
  }
  return undefined;
}

export async function queueStripeCustomerOpsEvent(env, DB, event) {
  const object = event?.data?.object;
  if (!event?.id || !event?.type || !object) return null;
  const reference = await profileReferenceForStripe(DB, object);
  const type = eventName(event.type);
  const disputed = event.type === "charge.dispute.created";
  const failed = event.type === "invoice.payment_failed";
  const payload = {
    externalEventId: `stripe:${event.id}`,
    eventType: type,
    title: title(event.type),
    category: disputed ? "fraud" : event.type.startsWith("customer.subscription.") ? "subscription" : event.type.includes("checkout") ? "order" : "payment",
    occurredAt: stripeTime(event.created) || new Date().toISOString(),
    ...reference,
    entityType: event.data.object.object || "stripe_object",
    entityExternalId: object.id,
    severity: disputed ? "high" : failed ? "moderate" : "information",
    outcome: disputed ? "disputed" : failed ? "failed" : "processed",
    riskScore: disputed ? 80 : failed ? 25 : 0,
    reason: disputed ? "Stripe reported a payment dispute against the customer account." : failed ? "Stripe reported a failed customer payment." : undefined,
    order: orderPayload(object, event.type),
    subscription: subscriptionPayload(object, event.type),
    payment: paymentPayload(object, event.type),
    metadata: {
      stripeEventType: event.type,
      stripeObjectType: object.object || null,
      subscriptionId: event.type.startsWith("invoice.") ? invoiceSubscriptionId(object) : null
    }
  };
  await queueCustomerOpsEvent(DB, payload);
  return flushCustomerOpsOutbox(env, DB, 10);
}
