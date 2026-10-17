# Demo script (6 minutes)

For an engineering audience. Start the production build (`npm run build`, then `npx next start -p 3000`) and keep a terminal open in the repository. Say once, at the start, and do not hedge it later: everything is synthetic, the API is a mock, the keys are public demo keys and the robot is a simulator.

| Time | Where | Show | Say |
|---|---|---|---|
| 0:00 to 0:40 | Control tower (`/`) | The arrival board; drag the time scrubber back and forward. | One shared file per shipment; every change is an event, so the whole day can be replayed. |
| 0:40 to 1:20 | A red lane shipment (`/shipments/...`) | Lane reasons, the parallel review plan, reused receipts. | The lane explains itself; an officer can override with a recorded reason. |
| 1:20 to 2:40 | Inspection (`/inspection`) | Press "Run inspection cell" on waiting shipments until the banner "Awaiting officer confirmation" appears. Open the shipment from the banner. Show the pending receipt note, then switch the role lens to an auditor or a regulator and show that the form is replaced by an explanation. Switch back to customs, choose "Overturn the finding", write a note and record it. | A machine never has the last word on a serious finding. The engine keeps the receipt pending and keeps the learning loop closed until an officer decides; a property test checks this over random event sequences, not only in the interface. |
| 2:40 to 3:20 | Terminal | `npx tsx gateway/robot.ts --base http://localhost:3000 --max 3` | The same contract a real robot gateway would use: poll tasks, post a result with media digests. The ROS 2 messages are in `gateway/ros2/msg`. |
| 3:20 to 4:30 | Evidence (`/evidence`) | Open a receipt, press "Copy inclusion proof", save it as `proof.json`, then in the terminal run `node scripts/verify-proof.mjs proof.json <key>` with the demo ledger key published in `docs/key-custody.md` (a different channel from the server). Edit one character of the receipt's issuer in the file and run it again. | RFC 6962 Merkle checkpoints, signed. The verifier is a standalone script: it needs no app code and no network. VALID, then INVALID after the edit. The VALID line lists what is proven and what is not: the hashed fields are, the summary text and the current status are not. |
| 4:30 to 5:30 | Inspection, "Inspection cell comparison" | The table with intervals for the four scenarios. | The predictions were committed before the model existed. Thirteen hit; the miss is shown, not hidden. The robot cell is faster and frees officer time, but under these assumptions it misses more violations. Every parameter is an assumption until a test yard measures it. |
| 5:30 to 6:00 | Terminal or `docs/edge-proposal.md` | `npm run offline` output, then the readiness table and the four asks. | Zero outbound requests, proved with an egress guard inside the server. What we ask for is a robot, a sceptical review and help with key custody, not a purchase. |

## If something goes wrong
- No banner after several runs: the simulated robot reports a serious finding only for some shipments; keep pressing, or open any shipment already listed under Completed with "Awaiting" in the officer confirmation column.
- The clipboard is blocked: the proof appears in a text area under the button; copy it from there.
- No open tasks for the gateway: every red lane shipment already has a result in this server process; restart the server (the gateway store is in memory only).
