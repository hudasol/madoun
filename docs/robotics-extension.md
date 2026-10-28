# Robotics extension

Madoun treats an inspection as a **request that any performer can fulfil**: an officer, a scanner, a drone or a ground robot. That is the seam for robotic inspection. Nothing in this repository drives real hardware; the robot is a seeded simulator and every rate in it is a parameter, not a measurement.

## Contract
```ts
InspectionTask   { id, shipmentId, containerIds[], requestedAt, requestedBy, scope[], priority, constraints[] }
InspectionResult { taskId, performedBy, performerKind: 'officer'|'scanner'|'robot'|'drone',
                   findings[], seal{id, intact}, mediaRefs[], media?[{ref, sha256, bytes}], completedAt }
```
`createInspectionTask` derives scope and constraints (hazardous materials protocol, keep the cold chain intact, time critical) from the risk assessment. `resultToReceiptDraft` turns a result into an `inspection-result` evidence receipt that other authorities can rely on without inspecting again. `outcomeFromInspection` feeds the learning loop. All of these are in `src/engine/inspection.ts`.

## Safe human machine teaming: officer confirmation
A machine never has the last word on a serious finding. `requiresOfficerConfirmation(result)` is true when the performer is a robot, drone or scanner and any finding has severity `major`, or the seal is reported broken. In that case:

| Step | What happens | Where it is enforced |
|---|---|---|
| Result arrives | The receipt is created as `pending`. No authority can rely on it. | `resultToReceiptDraft` |
| Before a decision | A learning outcome is rejected; issuing the receipt as `verified` is rejected. | `validateEvent` |
| Officer upholds | `InspectionConfirmed { decision: 'upheld', officerId, note }` makes the receipt `verified`. | reducer (`apply` and `WorldBuilder`) |
| Officer overturns | The receipt is revoked with the officer's note as the reason, whatever its status; the outcome is recorded as a false alarm. | reducer, `outcomeFromInspection` |
| Any other order | A receipt issued before the result, under another id, or with a status the rule does not give it, a second result, or an outcome before the result: all rejected. These paths were found by an independent review and are now in the property test. | `validateEvent` |

The officer id and a note are required, a second confirmation is rejected, and a confirmation cannot predate the result. A property test (`tests/confirmation.test.ts`) checks over random event sequences, including forged verified receipts and blank notes, that no serious machine finding is ever verified without an upheld confirmation. In the user interface only the customs role sees the uphold or overturn form (Inspection page and the shipment file). In the simulator the duty officer confirms one hour after the result, inside the red lane release window; that delay is an assumption (docs/decisions.md, D3).

## Gateway API (mock)
| Route | Purpose |
|---|---|
| `GET /api/v1/inspection-tasks?status=open` | Tasks for red lane shipments in flight that have no result yet. `status=completed` lists tasks with a result. Paged like every list route. |
| `POST /api/v1/inspection-tasks/{id}/result` | The gateway posts a result. Strict validation: unknown fields rejected at every level, 65536 byte body cap checked in bytes, at most 50 findings and 20 media digests, `completedAt` not before the request. Returns 201 with the receipt and `awaitingOfficerConfirmation`; 409 if the task already has a result. |

There is deliberately no confirmation route in the mock API: an officer decision must not be callable by a device on the gateway API, so it is made in the officer interface. The result route accepts machine performers only. Both routes are a **mock**: accepted results are held in memory in one server process, are lost on restart and are not shared between instances. The route never records a learning outcome; that stays a customs action after confirmation. The contract is in `public/openapi.yaml` and as JSON Schemas in `docs/schemas/inspection-task.schema.json` and `docs/schemas/inspection-result-request.schema.json`.

## Reference gateway
`gateway/robot.ts` plays a robotic inspection cell. It polls open tasks, simulates the cell with seeded randomness, and posts a result with the SHA-256 digest of each media file it "captured" (generated placeholder bytes, not images). It imports only Node built-ins, nothing from the app, so it shows exactly what an external adapter needs to know.

```bash
npx tsx gateway/robot.ts --base http://localhost:3000 --seed 7 --max 3
```

`tests/gateway.test.ts` runs the same gateway code against the route handlers directly, without a server or network, from task to result to an officer's confirmation event.

## ROS 2 interface
Message definitions are in `gateway/ros2/msg/` (package name suggested: `madoun_inspection_msgs`). They are interface definitions only; no ROS installation is needed to run or test anything in this repository.

| Madoun JSON field | ROS 2 message and field | Note |
|---|---|---|
| `InspectionTask.id` | `InspectionTask.id` | |
| `InspectionTask.shipmentId` | `InspectionTask.shipment_id` | |
| `InspectionTask.containerIds[]` | `InspectionTask.container_ids[]` | |
| `InspectionTask.requestedAt` (ISO 8601) | `InspectionTask.requested_at` (`builtin_interfaces/Time`) | seconds and nanoseconds since the Unix epoch, UTC |
| `InspectionTask.scope[]`, `priority`, `constraints[]` | same names, snake case | |
| URL `{id}` | `InspectionResult.task_id` | the gateway puts it back in the URL |
| `performedBy` | `InspectionResult.performed_by` | |
| `performerKind` | `InspectionResult.performer_kind` | `robot`, `drone` or `scanner` |
| `completedAt` | `InspectionResult.completed_at` (`builtin_interfaces/Time`) | |
| `seal.id`, `seal.intact` | `InspectionResult.seal_id`, `seal_intact` | `false` triggers officer confirmation |
| `findings[]` | `InspectionResult.findings[]` (`InspectionFinding`) | `kind`, `severity`, `note`, `note_ar` (empty when absent) |
| `media[]` | `InspectionResult.media[]` (`MediaDigest`) | `ref`, `sha256`, `bytes` |

### rosbridge style JSON
A bridge node can expose the same messages over the rosbridge v2 JSON protocol: the gateway publishes tasks on `/madoun/inspection/tasks` and subscribes to results on `/madoun/inspection/results`, where the robot side publishes them. For example, the subscription and one published result (the digest is an illustrative placeholder, not the hash of real bytes):

```json
{ "op": "subscribe", "topic": "/madoun/inspection/results", "type": "madoun_inspection_msgs/msg/InspectionResult" }
```

```json
{
  "op": "publish",
  "topic": "/madoun/inspection/results",
  "msg": {
    "task_id": "insp-SHP-0027",
    "performed_by": "cell-G1",
    "performer_kind": "robot",
    "completed_at": { "sec": 1791516600, "nanosec": 0 },
    "seal_id": "SEAL-0027",
    "seal_intact": true,
    "findings": [{ "kind": "undeclared-goods", "severity": "major", "note": "Load does not match the declared goods", "note_ar": "" }],
    "media": [{ "ref": "media/insp-SHP-0027/overview.jpg", "sha256": "3f0a1c9e5b7d2468ace013579bdf2468ace013579bdf2468ace013579bdf2468", "bytes": 4096 }]
  }
}
```

The gateway converts this message to the JSON body of `POST /api/v1/inspection-tasks/insp-SHP-0027/result` using the table above. `completed_at` 1791516600 seconds is 2026-10-09T03:30:00Z.

## Why this is a product first path
The robot adds *evidence*, not a new workflow. Madoun works today with officers and scanners as performers; a robot is one more performer kind. Safety, the human decision on serious findings and the legal power to inspect stay with customs officers.

## Open questions for a pilot
Physical access model at terminals, hazardous materials certification of the robot, media retention and privacy rules, device identity and key custody for the gateway (today a gateway authenticates with a bearer key when the server runs with `MADOUN_AUTH=keys`, and the public demo runs without), and whether the confirmation rule should also cover some minor findings for particular goods.
