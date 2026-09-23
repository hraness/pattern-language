# Linked decomposition procedure

Grow the partition from the link table, not from first impressions. At each
step identify the strongest unresolved coupling structure, apply the fitting
pattern, and follow its links into the next unresolved part. The names below
organize the supplied facts; they add no new misfits or links.

## Coupling skeleton

Context: the misfit set needs structure before naming. Forces: each misfit's
links pull it toward some cluster and away from others; a group that cuts many
links hides the system's real seams. Resolution: scan the link table and mark
the densest local clusters — misfit sets whose links mostly stay inside —
as group seeds. Smaller links: **Named centers** gives each seed a shared
concern; **Boundary placement** grows each seed to full membership.

## Named centers

Context: each seed is a cluster of misfit IDs. Forces: a group needs a shared
concern its members actually serve; a name that covers unrelated misfits is
false cohesion. Resolution: name each group by the concern its members' texts
share — e.g., livestock, water, crops, credit — and keep the name only while
the members fit it. Larger pattern: **Coupling skeleton** keeps the group's
boundary honest; smaller link: **Boundary placement**.

## Boundary placement

Context: seeds exist but many misfits remain unplaced. Forces: an unplaced
misfit usually links to several groups; counting its links inside each
candidate group competes with judging its text alone. Resolution: place each
remaining misfit in the group holding the most of its links; use semantic fit
only to break ties. Prerequisite link: **Coupling skeleton** and **Named
centers** fix the candidate groups. Effect on the whole: **Rebalance** repairs
what greedy placement distorted.

## Rebalance

Context: every misfit is placed. Forces: local placements can leave a group
too small, too large, or split from its couplings; the contract's bounds
compete with leaving a natural but illegal shape. Resolution: if groups
exceed 16, merge the two groups sharing the most cross-links; if fewer than
8, split the least coherent group at its weakest internal seam; move any
misfit whose links lie mostly across its boundary. Smaller link: **Coverage
audit** certifies the final shape.

## Coverage audit

Context: the partition is shaped. Forces: the artifact must satisfy the
contract exactly — every misfit once, 8 to 16 named groups, no singletons.
Resolution: verify coverage and bounds before returning. If a check fails,
revisit the **Rebalance** step rather than patching the artifact.

Return only the closed JSON artifact. Do not return the sequence,
calculations, explanations or additional fields.
