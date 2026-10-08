"use client";
import { useEffect } from "react";
import Link from "next/link";
import { captureAttribution, track } from "@/modules/analytics/client";
import type { ClientEventName } from "@/modules/analytics/events";

/** Registra un evento al montaggio (una volta per pagina). */
export function TrackOnMount({ event }: { event: ClientEventName }) {
  useEffect(() => {
    captureAttribution();
    track(event);
  }, [event]);
  return null;
}

/** Link che registra il click prima di navigare. */
export function TrackedLink({
  href,
  event,
  label,
  className,
  children,
}: {
  href: string;
  event: ClientEventName;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event, { label })}>
      {children}
    </Link>
  );
}
