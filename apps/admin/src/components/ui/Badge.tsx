const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  IMAGES_UPLOADED: 'bg-blue-100 text-blue-700',
  TRIAGE_PENDING: 'bg-yellow-100 text-yellow-700',
  TRIAGE_COMPLETE: 'bg-green-100 text-green-700',
  XPERT_REVIEW: 'bg-purple-100 text-purple-700',
  INELIGIBLE: 'bg-red-100 text-red-700',
  PUBLISHED: 'bg-indigo-100 text-indigo-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
  OPEN: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  SUCCEEDED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  APPROVED: 'bg-green-100 text-green-700',
  ADJUSTED: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
