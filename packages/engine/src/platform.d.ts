// Standard, deterministic web APIs the engine may use. The engine's tsconfig
// leaves out DOM and Node types so impure APIs (fetch, timers, document, fs)
// fail typecheck (CLAUDE.md rule 1). These exist in every runtime the engine
// runs in (Chrome, Node, Vitest), so they're declared here, with only the
// members the engine uses. Add to this list deliberately.
export {};

declare global {
  interface URL {
    readonly origin: string;
    readonly host: string;
    readonly pathname: string;
    readonly searchParams: URLSearchParams;
  }
  var URL: {
    prototype: URL;
    new (url: string, base?: string): URL;
    canParse(url: string, base?: string): boolean;
  };

  interface URLSearchParams {
    [Symbol.iterator](): IterableIterator<[string, string]>;
  }
  var URLSearchParams: {
    prototype: URLSearchParams;
    new (init?: string): URLSearchParams;
  };

  /** Decodes base64 to a binary string (one char per byte). */
  function atob(data: string): string;

  interface TextDecoder {
    decode(input?: Uint8Array): string;
  }
  var TextDecoder: {
    prototype: TextDecoder;
    new (label?: string, options?: { fatal?: boolean }): TextDecoder;
  };
}
