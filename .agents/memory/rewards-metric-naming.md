---
name: Rewards metric naming — "recitation" means recall from memory
description: The DB metric key and the user-facing label deliberately differ; do not "fix" either one to match the other.
---

The reward ledger metric key is `recitation`, but that word is wrong in the user's
vocabulary: in this app it specifically means *testing yourself from memory*, not
reading from the mushaf (that is Telawa, a separate metric).

- DB / API metric key: `recitation` — **never rename.** Existing `reward_events` rows
  and the unique `(userId, metric, sourceRef)` index depend on it.
- English label: "Recall from memory" (`rewards.metric.recitation`).
- Arabic label: "تسميع" — already the correct domain term, leave it.

**Why:** the user objected to the English "Page recitation" wording because it reads
like ordinary reading aloud and is indistinguishable from Telawa. The key/label split
keeps the ledger stable while fixing the terminology.

**How to apply:** when adding UI that surfaces this metric, translate through
`rewards.metric.*` rather than title-casing the raw key, and keep "recitation" out of
new English copy for this concept.
