export interface Style {
  dim(text: string): string;
  bold(text: string): string;
  yellow(text: string): string;
  green(text: string): string;
  red(text: string): string;
}

const wrap = (code: string, enabled: boolean) => (text: string) =>
  enabled ? `\x1b[${code}m${text}\x1b[0m` : text;

export function createStyle(colors: boolean): Style {
  return {
    dim: wrap("2", colors),
    bold: wrap("1", colors),
    yellow: wrap("33", colors),
    green: wrap("32", colors),
    red: wrap("31", colors),
  };
}

export const plainStyle: Style = createStyle(false);
