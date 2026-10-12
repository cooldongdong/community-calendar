// 連結預覽圖（og:image）：活動網址貼到 LINE、Facebook、Slack 時跳出來的那張卡片，1200×630。
// 建置時每一場畫一張：satori 把版面畫成 SVG，resvg 轉成 PNG。
//
// 字型：Noto Sans TC（SIL Open Font License 1.1），從 npm 的 @fontsource/noto-sans-tc 讀，只在建置時用，
// 不放進這個 repo、也不跟網站一起發出去；圖裡只有畫出來的字。
// fontsource 把字型照字切成一百多個小檔，每張圖只載入用得到的那幾個。
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { formatWhen, tentative, vanishedEarly, type Event } from './data';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const FONT_DIR = path.dirname(require.resolve('@fontsource/noto-sans-tc/package.json'));

interface Subset { file: string; ranges: [number, number][] }
const subsets = new Map<number, Promise<Subset[]>>();
const files = new Map<string, Promise<Buffer>>();

// 讀 fontsource 的 CSS：每個 @font-face 一個小檔，unicode-range 說它涵蓋哪些字
function subsetsOf(weight: number) {
  if (!subsets.has(weight)) {
    subsets.set(weight, readFile(path.join(FONT_DIR, `${weight}.css`), 'utf8').then((css) =>
      [...css.matchAll(/url\(\.\/files\/([^)]+\.woff)\) format\('woff'\)[\s\S]*?unicode-range:([^;]+);/g)].map(([, file, range]) => ({
        file,
        ranges: range.split(',').map((r) => {
          const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
          return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
        }),
      }))));
  }
  return subsets.get(weight)!;
}

async function fontsFor(text: string, weight: number) {
  const codes = new Set([...text].map((c) => c.codePointAt(0)!));
  const need = (await subsetsOf(weight)).filter((s) => [...codes].some((c) => s.ranges.some(([a, b]) => c >= a && c <= b)));
  return Promise.all(need.map(async (s) => {
    if (!files.has(s.file)) files.set(s.file, readFile(path.join(FONT_DIR, 'files', s.file)));
    // satori 遇到同名的字型只用其中一個，所以每個小檔各取一個名字，版面上把全部列進 fontFamily
    return { name: s.file, data: await files.get(s.file)!, weight: weight as 400 | 700, style: 'normal' as const };
  }));
}

// satori 吃的是 React 元素的樣子，這裡不用 JSX，直接寫物件
type Node = { type: string; props: { style?: Record<string, unknown>; children?: Node | string | (Node | string)[] } };
const h = (type: string, style: Record<string, unknown>, children?: Node['props']['children']): Node => ({ type, props: { style, children } });

const C = { bg: '#f6f6f7', text: '#18181b', muted: '#5d5d68', accent: '#2f55d4', soft: '#e7ecfc', warn: '#9a5b00', warnSoft: '#fdf1dc' };

export async function ogImage(e: Event) {
  const when = tentative(e) ? `${e.date_start}・講者邀約中` : formatWhen(e);
  const where = e.venue ?? (e.online ? '線上' : '');
  const tags = [
    e.cancelled ? ['停辦', C.warn, C.warnSoft] : vanishedEarly(e) ? ['共筆已移除', C.warn, C.warnSoft] : null,
    e.jothon ? ['揪松主辦', C.accent, C.soft] : null,
    e.series_label && e.series !== 'other-jothon' ? [e.series_label, C.muted, '#eeeef1'] : null,
  ].filter(Boolean) as [string, string, string][];
  const size = e.title.length > 44 ? 50 : e.title.length > 26 ? 60 : 72;

  // 內容寬 1200 − 左邊色條 16 − 左右留白 72×2 = 1040。寬度要寫死，satori 才會換行
  const W = 1040;
  const tree = h('div', { width: 1200, height: 630, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px', background: C.bg, borderLeft: `16px solid ${C.accent}` }, [
    h('div', { display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, color: C.muted }, [
      h('div', { display: 'flex', fontWeight: 700, color: C.text }, 'g0v 社群行事曆'),
      ...tags.map(([t, fg, bg]) => h('div', { display: 'flex', padding: '4px 14px', borderRadius: 8, background: bg, color: fg, fontSize: 24, fontWeight: 700 }, t)),
    ]),
    h('div', { display: 'block', width: W, fontSize: size, fontWeight: 700, lineHeight: 1.25, color: C.text, lineClamp: 3, textDecoration: e.cancelled ? 'line-through' : 'none' }, e.title),
    h('div', { display: 'flex', flexDirection: 'column', gap: 6, width: W }, [
      h('div', { display: 'flex', fontSize: 36, fontWeight: 700, color: C.accent }, when),
      ...(where ? [h('div', { display: 'block', fontSize: 28, color: C.muted, lineClamp: 1 }, where)] : []),
    ]),
  ]);

  const text = ['g0v 社群行事曆', e.title, when, where, ...tags.map(([t]) => t), '…'].join('');
  const fonts = [...(await fontsFor(text, 700)), ...(await fontsFor(text, 400))];
  tree.props.style!.fontFamily = [...new Set(fonts.map((f) => f.name))].join(', ');
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  // 字已經被 satori 轉成線條，不用字型；resvg 預設每張都掃一次系統字型，很慢
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } }).render().asPng();
}
