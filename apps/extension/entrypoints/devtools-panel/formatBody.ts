// Past this, the panel shows a prefix so a huge response can't freeze it.
export const MAX_DISPLAY_CHARS = 100_000;

export type FormattedBody =
  | { kind: 'empty' }
  /** Chrome base64-encodes binary responses; there's nothing readable to show. */
  | { kind: 'binary' }
  | {
      kind: 'json' | 'text';
      text: string;
      /** Full length when `text` was cut to MAX_DISPLAY_CHARS. */
      truncatedFrom?: number;
    };

/** Turns a raw response body into what the panel displays. Pure, for display only. */
export function formatBody(content: string, encoding: string): FormattedBody {
  if (encoding === 'base64') return { kind: 'binary' };
  if (content === '') return { kind: 'empty' };

  let kind: 'json' | 'text';
  let text: string;
  try {
    text = JSON.stringify(JSON.parse(content), null, 2);
    kind = 'json';
  } catch {
    text = content;
    kind = 'text';
  }

  return text.length > MAX_DISPLAY_CHARS
    ? { kind, text: text.slice(0, MAX_DISPLAY_CHARS), truncatedFrom: text.length }
    : { kind, text };
}
