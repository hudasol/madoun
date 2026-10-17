# Madoun inspection task, as published to a robotic inspection cell.
# Mirrors InspectionTask in public/openapi.yaml. Interface definition only; no ROS package is built or required by Madoun.
string id                      # task id, e.g. insp-SHP-0027
string shipment_id
string[] container_ids         # ISO 6346 container numbers
builtin_interfaces/Time requested_at
string[] scope                 # what to check, plain language
string priority                # "normal" or "high"
string[] constraints           # e.g. hazardous-materials-protocol, keep-cold-chain-intact, time-critical
