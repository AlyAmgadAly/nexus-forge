# Nexus Forge script coverage

- Source: `data/cards.json + data/scripts.json`
- Total collectible cards: 1647
- Text cards: 1552
- Scripts present: 282 (18.2%)
- Verified effects: 56 (3.6%)
- Missing: 1270

## Status

| Status | Count |
| --- | --- |
| none | 95 |
| manual | 1270 |
| auto | 226 |
| partial | 0 |
| curated | 56 |
| custom | 0 |

## Missing by set

| Set | Text cards | Scripted | Missing |
| --- | --- | --- | --- |
| Set1 | 279 | 104 | 175 |
| Set2 | 110 | 25 | 85 |
| Set3 | 176 | 33 | 143 |
| Set4 | 211 | 38 | 173 |
| Set5 | 219 | 29 | 190 |
| Set6 | 113 | 10 | 103 |
| Set6cde | 171 | 18 | 153 |
| Set7 | 57 | 10 | 47 |
| Set7b | 52 | 1 | 51 |
| Set8 | 106 | 9 | 97 |
| Set9 | 58 | 5 | 53 |

## Missing by type

| Type | Text cards | Scripted | Missing |
| --- | --- | --- | --- |
| Champion | 105 | 16 | 89 |
| Equipment | 27 | 2 | 25 |
| Landmark | 81 | 2 | 79 |
| Spell | 566 | 94 | 472 |
| Unit | 773 | 168 | 605 |

## Starter-deck cohort

| Deck | Unique | Text | Scripted | Verified | Missing |
| --- | --- | --- | --- | --- | --- |
| Vanguard Disciplines | 37 | 29 | 29 | 29 | 0 |
| Reckless Revenants | 37 | 31 | 19 | 18 | 12 |
| Frost & Flame | 37 | 32 | 4 | 1 | 28 |
| Tides of the Peak | 37 | 32 | 10 | 0 | 22 |
| Sands & Secrets | 37 | 34 | 6 | 0 | 28 |
| Runeterra Wanderers | 39 | 36 | 9 | 0 | 27 |

Cohort total: 206 unique, 179 text, 73 scripted, 47 verified, 106 missing.

## Trigger frequency

| Trigger | Entries |
| --- | --- |
| allyDeath | 2 |
| attack | 14 |
| barrier | 3 |
| block | 1 |
| castSpell | 4 |
| death | 15 |
| equip | 1 |
| nexusStrike | 8 |
| play | 136 |
| playCard | 1 |
| recall | 1 |
| roundEnd | 2 |
| roundStart | 13 |
| spellKill | 1 |
| strike | 9 |
| summon | 66 |
| summonOther | 9 |
| support | 4 |
| supported | 1 |
| surviveDamage | 6 |

## Action frequency

| Action | Uses |
| --- | --- |
| addCounter | 1 |
| barrier | 4 |
| buff | 83 |
| capture | 1 |
| choose | 4 |
| copy | 2 |
| create | 58 |
| createRandom | 12 |
| damage | 23 |
| damageAll | 11 |
| destroyEquipment | 1 |
| drain | 1 |
| draw | 14 |
| emptyManaGem | 4 |
| equipFromHand | 1 |
| frostbite | 5 |
| grantKeyword | 24 |
| heal | 8 |
| healNexus | 1 |
| if | 2 |
| kill | 3 |
| moveCardToTop | 1 |
| nextSummon | 1 |
| obliterate | 1 |
| pickFromTop | 1 |
| predict | 4 |
| rally | 5 |
| recall | 7 |
| reduceCost | 1 |
| silence | 2 |
| spellMana | 1 |
| strike | 1 |
| stun | 8 |
| summon | 46 |
| swap | 1 |
| toss | 6 |
| transform | 1 |
