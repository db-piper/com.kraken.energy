
## Tests

| Res | # | Type | Start | End | Advanced Start | Start | End | Extended End |
|-----|---|------|-------|-----|----------------|-------|-----|--------------|
| ✓ | 1 | SMART | 11:36 | 11:50 | 11:30 - P, Q 0 | 11:36 - D | 11:50 - E | 12:00 - P, Q 0 |
| ✓ | 2 | SMART | 12:36 | 12:50 | 12:30 - P, Q 0 | 12:36 - D | 12:50 - E | 13:00 - P, NO Q Tariff Q=0 |
| ✓ | 3 | SMART | 13:36 | 13:50 | 13:30 - P, No Q (Tariff) | 13:36 - D | 13:50 - E | 14:00 - NO P, NO Q Contiguous|
| ✓ | 4 | SMART | 14:10 | 14:20 | 14:00 - NO P, NO Q Contiguous | 14:10 - D | 14:20 - E | 14:30 - P, NO Q Tariff Q=0 |
| ✓ | 5 | BOOST | 15:10 | 15:25 | 15:00 - BP, Q 3 | 15:10 - D | 15:25 - E | 15:30 - BP, Tariff Q=0 |
| ✓ | 6 | SMART | 16:10 | 16:25 | 16:00 - P, No Q | 16:10 - D | 16:25 - E | 16:30 - P, Q=3 |
| ✓ | 7 | SMART | 17:10 | 17:25 | 17:00 - P, Q=0 | 17:10 - D | 17:25 - E | 17:30 - NO P, NO Q Contiguous |
| ✓ | 8 | SMART | 17:30 | 17:50 | 17:30 - No P, No Q Contiguous | 17:30 - D | 17:50 - E | 18:00 - P, Q=3 Tariff |


## Notes

| # | Time | Comment | Outcome |
|---|------|---------|---------|
| 6 | 16:00 | Q=3 by tariff rules.  Before 16:00 it is already 0; dispatch pricing starts at 16:00 so 0 remains. | CORRECT |

Further confirmation in the timeline in the webapp confirms that all events were correctly received.