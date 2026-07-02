import type { CaseStatus, JobStatus } from '@corexpert/core';

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';

const variantClasses: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: 'gray',
  IMAGES_UPLOADED: 'blue',
  TRIAGE_PENDING: 'yellow',
  TRIAGE_COMPLETE: 'green',
  XPERT_REVIEW: 'purple',
  INELIGIBLE: 'red',
  PUBLISHED: 'blue',
  ACCEPTED: 'green',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
  OPEN: 'blue',
  EXPIRED: 'gray',
  PENDING: 'yellow',
  SUCCEEDED: 'green',
  FAILED: 'red',
  REFUNDED: 'gray',
};

interface BadgeProps {
  status: CaseStatus | JobStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: BadgeProps) {
  const variant = STATUS_VARIANTS[status] ?? 'gray';
  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {label}
    </span>
  );
}
