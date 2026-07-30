/**
 * Build the URL used when navigating to the Reader from action-oriented
 * surfaces (dashboard cards, page-row, homework, telawa, etc.).
 *
 * When `hideOnJump` is true (the default from settings.hideReaderOnJump) the
 * Reader opens in practice/hide mode with only the first ayah revealed.
 */
export function readerUrl(page: number, hideOnJump: boolean): string {
  return `/reader/${page}${hideOnJump ? "?hide=1" : ""}`;
}
