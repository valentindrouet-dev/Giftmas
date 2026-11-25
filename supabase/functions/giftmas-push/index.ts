// Envoie un web push à chaque nouvelle notification.
// Déclenchée par un Database Webhook Supabase (table giftmas.notifications, INSERT), qui fournit la clé service.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

webpush.setVapidDetails(
  Deno.env.get("GIFTMAS_VAPID_SUBJECT") ?? "mailto:giftmas@example.com",
  Deno.env.get("GIFTMAS_VAPID_PUBLIC_KEY")!,
  Deno.env.get("GIFTMAS_VAPID_PRIVATE_KEY")!,
);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "giftmas" } });

Deno.serve(async (req) => {
  const { record } = await req.json();
  if (!record?.recipient) return new Response("ignored");
  const { data: subs, error } = await db.rpc("push_targets", { p_profile: record.profile_id, p_recipient: record.recipient });
  if (error) return new Response(error.message, { status: 500 });
  const payload = JSON.stringify({ title: "Giftmas 🎁", body: record.body });
  await Promise.all(subs.map((s: { endpoint: string; subscription: webpush.PushSubscription }) =>
    webpush.sendNotification(s.subscription, payload).catch((e) => {
      // abonnement expiré (appli supprimée, notifs refusées) : on le retire
      if (e.statusCode === 404 || e.statusCode === 410) return db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      console.error(e);
    })
  ));
  return new Response(`sent ${subs.length}`);
});
