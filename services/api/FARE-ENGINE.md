# Central fare engine

Chaufr uses one server-side fare calculation for passenger quotes and trip requests. Android clients submit route distance, duration and vehicle category; they cannot supply or override fuel prices, consumption assumptions, commission, traffic adjustments or fare bands.

## Starting fare bands

These are the initial schedule values supplied by the owner. They are configurable development defaults, not a claim that live traffic or routing is connected yet.

| Journey duration | Starting fare |
| --- | ---: |
| Up to 7 minutes | R40 |
| 8–15 minutes | R50 |
| 16–22 minutes | R85 |
| 23–29 minutes | R100 |
| 30–39 minutes | R150 |
| 40–49 minutes | R170 |
| 50–59 minutes | R200 |
| 60 minutes and longer | R250 |

For journeys longer than 60 minutes, the R250 band is currently the starting floor; an additional long-trip increment still needs owner configuration.

## Traffic adjustments

The calculator supports four trusted traffic levels. For journeys up to 15 minutes, the adjustments are R0 / R10 / R15 / R20 (normal / moderate / heavy / severe), keeping the 10–15 minute range within the owner's R50–R70 starting range. For 16–25 minutes they are R0 / R10 / R15 / R25. For journeys longer than 25 minutes they are R0 / R10 / R25 / R40. The existing 30-minute illustration therefore calculates R150 / R160 / R175 / R190.

The trip-request API currently uses the normal baseline because a live routing/traffic provider has not yet been connected. The calculator itself accepts a traffic level so a trusted routing integration can supply it later; the passenger app must never be allowed to choose its own traffic level.

## Vehicle classes and route costs

Standard uses multiplier 1.00, Comfort 1.15 and XL 1.30 by default. The fare is never below the configured duration/traffic/category starting fare, the minimum fare, or the server-side route cost floor. The route cost floor includes base cost, distance, fuel and operating costs using server-owned assumptions.

## Commission and driver earnings

The initial 12% platform commission is included in the passenger's displayed fare, not added as a surprise surcharge. Driver expected earnings are the remaining 88%; the platform commission is 12% of the passenger fare. The amount is stored with the trip but is marked earned only when the assigned driver completes the trip. Driver-facing responses show expected/actual driver earnings, never platform commission or aggregate company revenue. Payment collection and driver payout settlement are not yet connected.

## Fare acceptance

A passenger trip request stores a snapshot of the fare-rule version, route measurements, traffic level, vehicle class, passenger total and expected driver earnings. When an eligible, activated driver accepts, the API transactionally assigns the driver and approved vehicle and sets the fare lock timestamp. Later traffic changes or fare-rule edits do not change an accepted trip's price. The live traffic provider and the complete trip lifecycle are still follow-up work.

## Configuration and status

The schedule, traffic additions, category multipliers, fuel price, fuel consumption, distance rate, operating cost, commission and minimum fare are configured on the API server. No live routing provider, production payment provider, or production fare configuration is enabled by this repository yet.
