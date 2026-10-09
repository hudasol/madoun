# Research programme: robotic inspection evidence

A proposal that sits on top of the product. The product works with officers and scanners today; a robot is a fourth kind of performer that adds evidence. The programme asks one question: **can an inspection robot produce findings that officers and other authorities will rely on, at a quality and speed that justify its cost and risk?**

## Hypotheses
- H1: For seal verification and container exterior checks, a robot matches officer recall with fewer false alarms and a shorter time per container.
- H2: Findings captured with hashed media and a structured result let a second authority rely on them without re-inspecting (the receipt is accepted in at least 80% of eligible cases).
- H3: Routing only lane-red containers to the robot cell does not lengthen total release time compared with officer-only inspection.

## Readiness ladder
| Level | Meaning here | Exit evidence |
|---|---|---|
| R0 Requirements | Access model, hazard list, legal power to inspect, findings an officer must always confirm | signed requirements with customs and the terminal operator |
| R1 Laboratory | A mock yard with instrumented containers; a ROS 2 gateway subscribing to Madoun tasks and returning results with media hashes | task round trip works; seal and exterior findings measured against known ground truth |
| R2 Controlled trial | Robot at the terminal beside officers, results not used for decisions | paired comparison on at least 200 containers (see protocol); safety log with no incident |
| R3 Pilot cell | Robot results used for lane-red containers with officer confirmation | Gate criteria below |

## Protocol (R2)
- **Paired design:** the same container is checked by the robot and by an officer who does not see the robot's result. A third, blinded re-check settles disagreements.
- **Outcome measures:** recall and false-alarm rate per finding type with 95% intervals; minutes per container; share of results an officer must correct; share of receipts accepted by another authority.
- **Sample size:** to estimate recall to within ±5 points at 80% expected recall needs about 246 positive cases; plan the number of containers from the expected prevalence of each finding type (the Pilot page calculator gives the figure for a chosen rate and margin).
- **Pre-registered:** hypotheses, measures and stopping rules are written before the first container.

## Safety case (outline)
Hazards: collision with people and vehicles; opening or probing hazardous or cold-chain cargo; interference with the seal as evidence; cyber compromise; wrong finding leading to wrongful detention. Controls: geofenced operation with a human-controlled stop; the existing hazmat and cold-chain constraints carried in every task; seal state captured before any contact; signed tasks and results (see threat-model.md); **an officer confirms any serious finding a machine reports before action**; every media file hashed in the receipt.

## Data and sovereignty
Media and findings stay on UAE infrastructure; retention follows customs rules; media references, not media, travel in the shared file; model and gateway code are inspectable by the government.

## Deliverables
A ROS 2 gateway; a task and result schema (exists); a test yard protocol; a safety case; an evaluation report with intervals; a decision memo on R3.

## Partners (types, not names)
A research institute with a robotics group; the terminal operator; customs inspection staff; a certification body for machinery safety.

## Stop criteria
Any safety incident; recall materially below officers on a serious finding type; officers not willing to rely on the results; legal objection.
