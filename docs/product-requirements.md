# Product requirements

## Passenger Android app

## Passenger loyalty rewards
- Award one ticket for every completed passenger trip.
- Nine tickets redeem one free passenger fare on a server-calculated route between 5 and 20 minutes inclusive.
- Ticket balances are account-based and persisted in an auditable ledger; client-side balances are never trusted.
- A redemption reserves nine tickets transactionally when the passenger submits the ride request. Expired or cancelled unaccepted requests release the reservation.
- The regular trip fare and driver earnings remain unchanged. The passenger payable amount is zero and Chaufr funds the reward fare.

- Register, sign in and manage a passenger profile.
- Set pickup and destination and review the proposed route.
- Receive a fixed upfront quote before requesting a trip.
- View fare breakdown and trip status.
- Cancel subject to configurable policy.
- View trip history, receipts and support details.

## Driver Android app
- Register and submit driver, vehicle and required verification information.
- See verification status and account restrictions.
- Set availability and receive trip offers.
- Accept or decline within the configured response window.
- View pickup, destination, route handoff and trip status.
- Complete trips and see gross fare, platform commission and net driver earnings.
- Review earnings and trip history.

## Owner dashboard
- Strongly protected owner login and role-based access.
- Manage drivers, passengers, vehicles and verification statuses.
- Monitor active and historical trips.
- Configure service areas, vehicle categories, fare rules and commission.
- View financial summaries and export operational reports.
- Audit sensitive changes and administrative actions.

## Fare engine
The fare engine returns a fixed quote based on:
- route distance and estimated travel time;
- vehicle category and fuel consumption;
- configured fuel price;
- operating-cost allowance;
- driver earnings component;
- platform commission and minimum fare.

Every quote stores its calculation inputs, configuration version, breakdown and expiry. The quote is authoritative only when produced by the backend.

## Decisions still required before launch
- Initial operating cities and service-area boundaries.
- Vehicle categories and eligible vehicle requirements.
- Exact fare coefficients, minimum fares and commission.
- Maps/routing, SMS/push notification and payment providers.
- Driver payout process and customer support process.
- Legal, insurance, privacy and transport compliance review for South Africa.
\n## Trip ratings and feedback\n- Passenger and driver may each rate the other participant once per completed trip.\n- Rating score is 1–5 stars with optional feedback up to 500 characters.\n- Only trip participants may submit; the API validates the completed trip and role.\n- Duplicate rating submissions are prevented by a database unique constraint.\n- Users can view their received ratings summary.\n\n## Customer support tickets\n- Passenger and driver can create categorized support tickets for trips, payments, account issues, safety or general help.\n- Ticket creation validates subject and message length; tickets default to open.\n- Users can view only their own tickets.\n- Owner can review ticket queues, respond, and set ticket status (open, in progress, resolved or closed).\n