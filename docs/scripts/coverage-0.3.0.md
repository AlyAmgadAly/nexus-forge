# Nexus Forge script coverage

- Source: `data/cards.json + data/scripts.json`
- Total collectible cards: 1647
- Text cards: 1552
- Scripts present: 270 (17.4%)
- Verified effects: 38 (2.4%)
- Missing: 1282

## Status

| Status | Count |
| --- | --- |
| none | 95 |
| manual | 1282 |
| auto | 232 |
| partial | 0 |
| curated | 38 |
| custom | 0 |

## Missing by set

| Set | Text cards | Scripted | Missing |
| --- | --- | --- | --- |
| Set1 | 279 | 101 | 178 |
| Set2 | 110 | 24 | 86 |
| Set3 | 176 | 31 | 145 |
| Set4 | 211 | 36 | 175 |
| Set5 | 219 | 28 | 191 |
| Set6 | 113 | 9 | 104 |
| Set6cde | 171 | 17 | 154 |
| Set7 | 57 | 9 | 48 |
| Set7b | 52 | 1 | 51 |
| Set8 | 106 | 9 | 97 |
| Set9 | 58 | 5 | 53 |

## Missing by type

| Type | Text cards | Scripted | Missing |
| --- | --- | --- | --- |
| Champion | 105 | 16 | 89 |
| Equipment | 27 | 2 | 25 |
| Landmark | 81 | 2 | 79 |
| Spell | 566 | 91 | 475 |
| Unit | 773 | 159 | 614 |

## Starter-deck cohort

| Deck | Unique | Text | Scripted | Verified | Missing |
| --- | --- | --- | --- | --- | --- |
| Vanguard Disciplines | 37 | 29 | 29 | 29 | 0 |
| Reckless Revenants | 37 | 31 | 7 | 0 | 24 |
| Frost & Flame | 37 | 32 | 4 | 1 | 28 |
| Tides of the Peak | 37 | 32 | 10 | 0 | 22 |
| Sands & Secrets | 37 | 34 | 6 | 0 | 28 |
| Runeterra Wanderers | 39 | 36 | 9 | 0 | 27 |

Cohort total: 206 unique, 179 text, 61 scripted, 29 verified, 118 missing.

## Trigger frequency

| Trigger | Entries |
| --- | --- |
| allyDeath | 1 |
| attack | 14 |
| barrier | 3 |
| castSpell | 4 |
| death | 14 |
| equip | 1 |
| nexusStrike | 8 |
| play | 131 |
| playCard | 1 |
| recall | 1 |
| roundEnd | 2 |
| roundStart | 13 |
| strike | 9 |
| summon | 65 |
| summonOther | 8 |
| support | 3 |
| supported | 1 |
| surviveDamage | 6 |

## Action frequency

| Action | Uses |
| --- | --- |
| addCounter | 1 |
| barrier | 4 |
| buff | 75 |
| capture | 1 |
| choose | 3 |
| copy | 2 |
| create | 54 |
| createRandom | 12 |
| damage | 21 |
| damageAll | 11 |
| destroyEquipment | 1 |
| draw | 14 |
| emptyManaGem | 4 |
| equipFromHand | 1 |
| frostbite | 5 |
| grantKeyword | 22 |
| heal | 8 |
| healNexus | 1 |
| if | 1 |
| kill | 3 |
| nextSummon | 1 |
| obliterate | 1 |
| pickFromTop | 1 |
| predict | 4 |
| rally | 5 |
| recall | 7 |
| silence | 2 |
| spellMana | 1 |
| strike | 1 |
| stun | 8 |
| summon | 46 |
| swap | 1 |
| toss | 6 |
| transform | 1 |
