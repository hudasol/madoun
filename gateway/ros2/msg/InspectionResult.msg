# Result returned by the cell for one task. Mirrors the body of POST /api/v1/inspection-tasks/{id}/result.
string task_id
string performed_by               # cell or device id, e.g. cell-G1
string performer_kind             # "robot", "drone" or "scanner" (an officer result does not travel over ROS)
builtin_interfaces/Time completed_at
string seal_id
bool seal_intact                  # false means a broken seal: officer confirmation required
InspectionFinding[] findings      # at least one; report KIND_NONE when nothing was found
MediaDigest[] media               # at most 20
