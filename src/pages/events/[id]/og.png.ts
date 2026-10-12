import type { APIRoute } from 'astro';
import { getEvents, type Event } from '../../../lib/data';
import { ogImage } from '../../../lib/og';

// 每一場的連結預覽圖（見 src/lib/og.ts）
export async function getStaticPaths() {
  return (await getEvents()).filter((e) => !e.hidden).map((e) => ({ params: { id: e.id }, props: { event: e } }));
}

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await ogImage(props.event as Event)), { headers: { 'Content-Type': 'image/png' } });
