import type { APIRoute } from 'astro';
import { getEvents, type Event } from '../../lib/data';
import { eventIcs, onCalendar, singleCount } from '../../lib/ics';

// 單獨加一場到自己的行事曆（Apple、Outlook 用）。有子場次的每個子場次一個檔：{id}-1.ics、{id}-2.ics…
export async function getStaticPaths() {
  return (await getEvents()).filter((e) => onCalendar(e) && !e.cancelled).flatMap((e) => {
    const n = singleCount(e);
    return n > 1
      ? Array.from({ length: n }, (_, i) => ({ params: { id: `${e.id}-${i + 1}` }, props: { event: e, session: i } }))
      : [{ params: { id: e.id }, props: { event: e, session: undefined } }];
  });
}

export const GET: APIRoute = ({ props, site }) => eventIcs(props.event as Event, site, props.session as number | undefined);
