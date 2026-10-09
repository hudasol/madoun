# Robotics extension

Madoun already treats an inspection as a **request that any performer can fulfil**. That is the seam for a robotics proposal.

## Contract
```ts
InspectionTask   { id, shipmentId, containerIds[], requestedAt, requestedBy, scope[], priority, constraints[] }
InspectionResult { taskId, performedBy, performerKind: 'officer'|'scanner'|'robot'|'drone',
                   findings[], seal{intact}, media refs, completedAt }
```
`createInspectionTask` derives scope and constraints (hazmat protocol, keep cold chain intact, time-critical) from the risk assessment. `resultToReceiptDraft` turns a result into an `inspection-result` evidence receipt that other authorities can rely on without re-inspecting. `outcomeFromInspection` feeds the learning loop. `simulateInspectionCell` models a cell with realistic throughput so the Inspection page can show the effect of adding a robot.

## Proposed ROS 2 bridge
1. A small gateway subscribes to Madoun tasks (HTTP/WebSocket) and publishes `InspectionTask` messages on a ROS 2 topic.
2. The robot stack (mobile base, manipulator or inspection arm, camera, optional gas/thermal sensors) executes: locate container, verify seal, open/probe within constraints, capture imagery.
3. The gateway maps findings and media hashes back into an `InspectionResult` and posts it.
4. Madoun records the receipt, updates reviews, and the officer sees a complete evidence file.

## Why this is a product-first path
The robot adds *evidence*, not a new workflow. Madoun works today with officers and scanners as performers; a robot is a fourth performer kind. Safety, human sign-off and the legal power to inspect stay with customs officers.

## Open questions for a pilot
Physical access model at terminals, hazmat certification of the robot, media retention and privacy rules, and which findings an officer must always confirm.
