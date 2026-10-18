import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronRight, Clock, MapPin, Megaphone, Navigation } from "lucide-react";
import { CheckInButton, SaveButton, ShopperNav } from "@/components/discover";
import { CategoryChip, TopBar } from "@/components/ui";
import { eventWhen } from "@/lib/city";
import { cardArt, directionsUrl, interestEmoji, interestLabel, isLive } from "@/lib/feed";
import { getT } from "@/lib/lang";
import { currentCustomerId } from "@/lib/session";
import { eventCardFor, getEvent, getVendor, isSaved, reviewsFor } from "@/lib/store";
import { EventMap } from "./EventMap";
import { ReviewList } from "@/app/v/[id]/Reviews";

const serverNow = async () => Date.now();

export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  await connection(); // live data: render per request
  const { id } = await params;
  const [event, card] = await Promise.all([getEvent(id), eventCardFor(id)]);
  if (!event || !card) notFound();
  const customerId = await currentCustomerId();
  const [host, saved, reviews, t, now] = await Promise.all([
    getVendor(event.vendorId),
    isSaved(customerId, "event", event.id),
    reviewsFor(event.vendorId, customerId, 3),
    getT(),
    serverNow(),
  ]);
  const art = cardArt(card);
  const live = isLive(card, now);
  const ended = event.endsAt <= now;

  return (
    <main className="flex flex-1 flex-col pb-24">
      <TopBar back="/discover" />
      <div className="px-5">
        <div
          className="relative grid h-40 animate-rise place-items-center rounded-[1.25rem] border-[2.5px] border-ink shadow-block"
          style={{ backgroundColor: art.color }}
        >
          <span className="text-8xl" aria-hidden>
            {art.emoji}
          </span>
          <span className="absolute right-3 bottom-3 rounded-full border-2 border-ink bg-ink px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
            {t(`kind.${event.kind}`)}
          </span>
          {event.boostUntil > now && (
            <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full border-2 border-ink bg-marigold px-2.5 py-0.5 text-sm font-bold">
              <Megaphone className="size-4" strokeWidth={2.5} /> {t("disc.boosted")}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-start gap-3">
          <h1 className="flex-1 font-display text-3xl leading-tight">{event.title}</h1>
          {!ended && <SaveButton type="event" id={event.id} saved={saved} />}
        </div>
        <p className={`mt-2 flex items-center gap-1.5 text-lg font-bold ${live ? "text-chili" : ""}`}>
          <Clock className="size-5 shrink-0" strokeWidth={2.5} /> {eventWhen(t, event.startsAt, event.endsAt, now)}
        </p>
        {event.spot && (
          <p className="mt-1 flex items-center gap-1.5 text-lg">
            <MapPin className="size-5 shrink-0 text-chili" strokeWidth={2.5} /> {event.spot}
          </p>
        )}
        {event.description && <p className="mt-4 text-lg leading-snug">{event.description}</p>}
        {card.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {card.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-paper-2 px-2.5 py-1 text-sm font-bold">
                {interestEmoji(tag)} {t(interestLabel(tag))}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 h-48 overflow-hidden rounded-[1.25rem] border-[2.5px] border-ink">
          <EventMap spot={{ key: "event", title: event.title, emoji: art.emoji, color: art.color, lat: event.lat, lng: event.lng, live }} />
        </div>
        <a
          href={directionsUrl(event.lat, event.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn mt-4 w-full bg-sky text-white"
        >
          <Navigation className="size-6" strokeWidth={2.5} /> {t("plans.directions")}
        </a>
        {live && <CheckInButton vendorId={event.vendorId} eventId={event.id} className="mt-3" />}

        {host && (
          <section className="mt-7">
            <h2 className="mb-2 font-display text-xl">{t("event.host")}</h2>
            <Link
              href={`/v/${host.id}`}
              className="block-card flex items-center gap-3 p-3 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <CategoryChip category={host.category} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{host.name}</span>
                <span className="block text-sm text-ink-soft">{host.ownerName}</span>
              </span>
              <ChevronRight className="size-6 shrink-0" strokeWidth={2.5} />
            </Link>
            {reviews.length > 0 && <ReviewList reviews={reviews} now={now} className="mt-3" />}
          </section>
        )}
      </div>
      <ShopperNav />
    </main>
  );
}
