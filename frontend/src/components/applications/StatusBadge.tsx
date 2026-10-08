import { ApplicationStatus, STATUS_LABELS, STATUS_STYLES } from "@/lib/applications";

export default function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.pending
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
