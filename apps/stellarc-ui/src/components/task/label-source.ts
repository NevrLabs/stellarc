/**
 * #147: how a label chip decides whether it came from a linked repository.
 *
 * `label.source` is written by the API: the GitHub import path sets "repo",
 * everything created inside Kaneo keeps the column default "kaneo". Rows that
 * predate the column have no source at all and are native by definition,
 * because the import path is the only writer of "repo".
 */
export function isRepoLabel(source: string | null | undefined) {
  return source === "repo";
}

/** Value for the chip's `data-label-source` attribute. */
export function labelSourceAttribute(source: string | null | undefined) {
  return source ?? "kaneo";
}

export function canSelectLabelSource(
  source: string | null | undefined,
  syncedTicket: boolean,
) {
  return !isRepoLabel(source) || syncedTicket;
}
